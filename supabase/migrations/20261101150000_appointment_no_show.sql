-- "No vino" (no_show): a new appointment status for a customer who did not show up.
--
-- Every availability / overlap check treats it exactly like 'cancelled': the
-- slot never counts as taken. In practice a no-show is always in the past (the
-- dashboard only offers it once the start time has passed), but the agenda,
-- the public booking site and the overlap triggers must agree on one rule.
--
-- Positive filters (`status in ('pending','confirmed')` in
-- public_site_find_appointments / complete_appointment_on_service_sale) already
-- leave it out and are not touched. Functions below are the LIVE definitions
-- (pg_get_functiondef) with only the status predicate changed; CREATE OR
-- REPLACE keeps their grants.

alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status = any (array['pending'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]));

CREATE OR REPLACE FUNCTION public.agenda_busy_slots(p_from date, p_to date)
 RETURNS TABLE(appointment_date date, start_time time without time zone, end_time time without time zone, is_mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid := public.get_effective_user_id();
  v_staff uuid := public.current_staff_id();
begin
  if v_tenant is null or not public.worker_can('calendar') then
    raise exception 'Sin permiso para ver la agenda' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;

  return query
    select a.appointment_date,
           a.start_time,
           coalesce(a.end_time, a.start_time + interval '30 minutes')::time,
           coalesce(v_staff is not null and a.staff_id = v_staff, false)
    from public.appointments a
    where a.user_id = v_tenant
      and a.appointment_date between p_from and p_to
      and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
    order by a.appointment_date, a.start_time;
end;
$function$;

CREATE OR REPLACE FUNCTION public.appointments_prevent_staff_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.staff_id is null or coalesce(new.status, 'pending') in ('cancelled', 'no_show') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.staff_id is not distinct from new.staff_id
     and old.appointment_date is not distinct from new.appointment_date
     and old.start_time is not distinct from new.start_time
     and old.end_time is not distinct from new.end_time
     and coalesce(old.status, 'pending') not in ('cancelled', 'no_show') then
    return new; -- cambio de estado u otro dato: no se revalida el horario
  end if;

  -- Serializa a quien reserva a la misma persona el mismo día.
  perform pg_advisory_xact_lock(hashtextextended(new.staff_id::text || ':' || new.appointment_date::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.staff_id = new.staff_id
      and a.appointment_date = new.appointment_date
      and a.id <> new.id
      and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
      and a.start_time < coalesce(new.end_time, new.start_time + interval '30 minutes')
      and coalesce(a.end_time, a.start_time + interval '30 minutes') > new.start_time
  ) then
    raise exception 'Esa persona ya tiene una cita en ese horario.' using errcode = '23P01';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.appointments_prevent_station_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.station_id is null or coalesce(new.status, 'pending') in ('cancelled', 'no_show') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.station_id is not distinct from new.station_id
     and old.appointment_date is not distinct from new.appointment_date
     and old.start_time is not distinct from new.start_time
     and old.end_time is not distinct from new.end_time
     and coalesce(old.status, 'pending') not in ('cancelled', 'no_show') then
    return new; -- cambio de estado u otro dato: no se revalida el horario
  end if;

  -- Serializa a quien reserva la MISMA estación el mismo día.
  perform pg_advisory_xact_lock(hashtextextended('station:' || new.station_id::text || ':' || new.appointment_date::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.station_id = new.station_id
      and a.appointment_date = new.appointment_date
      and a.id <> new.id
      and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
      and a.start_time < coalesce(new.end_time, new.start_time + interval '30 minutes')
      and coalesce(a.end_time, a.start_time + interval '30 minutes') > new.start_time
  ) then
    raise exception 'Esa estación ya está ocupada en ese horario.' using errcode = '23P01';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.public_site_slots(p_slug text, p_service_id uuid, p_date date, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_time text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_site        public.business_sites%rowtype;
  v_hours       public.business_hours%rowtype;
  v_duration    int;
  v_capacity    int;
  v_open_min    int;
  v_close_min   int;
  v_min         int;
  v_start       time;
  v_end         time;
  v_any_taken   int;
  v_staff_taken int;
  v_excluded    uuid;
begin
  select * into v_site
    from public.business_sites
   where slug = lower(btrim(p_slug)) and published and booking_enabled;
  if not found then return; end if;

  if p_date < (now() at time zone v_site.timezone)::date
     or p_date > (now() at time zone v_site.timezone)::date + 90 then
    return;
  end if;

  select * into v_hours
    from public.business_hours
   where user_id = v_site.user_id
     and weekday = extract(dow from p_date)::smallint;
  if not found or not v_hours.is_open then return; end if;

  select coalesce(duration_minutes, 30) into v_duration
    from public.services
   where id = p_service_id
     and user_id = v_site.user_id
     and coalesce(status, 'active') = 'active';
  if v_duration is null or v_duration <= 0 then return; end if;

  if p_staff_id is not null then
    perform 1 from public.staff
     where id = p_staff_id and show_on_website and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
       and user_id = v_site.user_id
       and coalesce(is_active, true)
       and coalesce(status, 'active') = 'active';
    if not found then return; end if;
  end if;

  -- Admin excluded from barber capacity unless booked explicitly by name.
  v_excluded := public.site_booking_excluded_staff(v_site.user_id, v_site.published_config);
  if p_staff_id is not null and p_staff_id = v_excluded then
    v_excluded := null;
  end if;

  select greatest(count(*), 1) into v_capacity
    from public.staff
   where user_id = v_site.user_id
     and show_on_website
     and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
     and coalesce(is_active, true)
     and coalesce(status, 'active') = 'active'
     and id is distinct from v_excluded;

  v_open_min  := extract(hour from v_hours.opens_at)  * 60 + extract(minute from v_hours.opens_at);
  v_close_min := extract(hour from v_hours.closes_at) * 60 + extract(minute from v_hours.closes_at);

  v_min := v_open_min;
  while v_min + v_duration <= v_close_min loop
    v_start := make_time(v_min / 60, v_min % 60, 0);
    v_end   := make_time((v_min + v_duration) / 60, (v_min + v_duration) % 60, 0);

    if ((p_date + v_start) at time zone v_site.timezone) > now() + interval '30 minutes' then
      select
        count(*) filter (
          where a.staff_id is null
             or exists (select 1 from public.staff s
                         where s.id = a.staff_id and s.show_on_website
                           and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
                           and coalesce(s.is_active, true)
                           and coalesce(s.status, 'active') = 'active'
                           and s.id is distinct from v_excluded)
        ),
        count(*) filter (where a.staff_id = p_staff_id)
        into v_any_taken, v_staff_taken
        from public.appointments a
       where a.user_id = v_site.user_id
         and a.appointment_date = p_date
         and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
         and a.start_time < v_end
         and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start;

      if v_any_taken < v_capacity and (p_staff_id is null or v_staff_taken = 0) then
        slot_time := to_char(v_start, 'HH24:MI');
        return next;
      end if;
    end if;

    v_min := v_min + v_site.slot_interval_minutes;
  end loop;

  return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.public_site_day_slots(p_slug text, p_service_id uuid, p_date date, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_time text, slot_state text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_site        public.business_sites%rowtype;
  v_hours       public.business_hours%rowtype;
  v_duration    int;
  v_capacity    int;
  v_open_min    int;
  v_close_min   int;
  v_min         int;
  v_start       time;
  v_end         time;
  v_any_taken   int;
  v_staff_taken int;
  v_excluded    uuid;
begin
  select * into v_site
    from public.business_sites
   where slug = lower(btrim(p_slug)) and published and booking_enabled;
  if not found then return; end if;

  if p_date < (now() at time zone v_site.timezone)::date
     or p_date > (now() at time zone v_site.timezone)::date + 90 then
    return;
  end if;

  select * into v_hours
    from public.business_hours
   where user_id = v_site.user_id
     and weekday = extract(dow from p_date)::smallint;
  if not found or not v_hours.is_open then return; end if;

  select coalesce(duration_minutes, 30) into v_duration
    from public.services
   where id = p_service_id
     and user_id = v_site.user_id
     and coalesce(status, 'active') = 'active';
  if v_duration is null or v_duration <= 0 then return; end if;

  if p_staff_id is not null then
    perform 1 from public.staff
     where id = p_staff_id and show_on_website and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
       and user_id = v_site.user_id
       and coalesce(is_active, true)
       and coalesce(status, 'active') = 'active';
    if not found then return; end if;
  end if;

  -- Admin excluded from barber capacity unless booked explicitly by name.
  v_excluded := public.site_booking_excluded_staff(v_site.user_id, v_site.published_config);
  if p_staff_id is not null and p_staff_id = v_excluded then
    v_excluded := null;
  end if;

  select greatest(count(*), 1) into v_capacity
    from public.staff
   where user_id = v_site.user_id
     and show_on_website
     and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
     and coalesce(is_active, true)
     and coalesce(status, 'active') = 'active'
     and id is distinct from v_excluded;

  v_open_min  := extract(hour from v_hours.opens_at)  * 60 + extract(minute from v_hours.opens_at);
  v_close_min := extract(hour from v_hours.closes_at) * 60 + extract(minute from v_hours.closes_at);

  v_min := v_open_min;
  while v_min + v_duration <= v_close_min loop
    v_start := make_time(v_min / 60, v_min % 60, 0);
    v_end   := make_time((v_min + v_duration) / 60, (v_min + v_duration) % 60, 0);

    select
      count(*) filter (
        where a.staff_id is null
           or exists (select 1 from public.staff s
                       where s.id = a.staff_id and s.show_on_website
                         and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
                         and coalesce(s.is_active, true)
                         and coalesce(s.status, 'active') = 'active'
                         and s.id is distinct from v_excluded)
      ),
      count(*) filter (where a.staff_id = p_staff_id)
      into v_any_taken, v_staff_taken
      from public.appointments a
     where a.user_id = v_site.user_id
       and a.appointment_date = p_date
       and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
       and a.start_time < v_end
       and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start;

    slot_time := to_char(v_start, 'HH24:MI');
    if ((p_date + v_start) at time zone v_site.timezone) <= now() + interval '30 minutes' then
      slot_state := 'past';
    elsif v_any_taken >= v_capacity or (p_staff_id is not null and v_staff_taken > 0) then
      slot_state := 'taken';
    else
      slot_state := 'free';
    end if;
    return next;

    v_min := v_min + v_site.slot_interval_minutes;
  end loop;

  return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.public_site_book(p_slug text, p_service_id uuid, p_date date, p_time text, p_customer_name text, p_customer_phone text, p_staff_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_site public.business_sites%rowtype;
  v_service public.services%rowtype;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g');
  v_start time;
  v_customer_id uuid;
  v_recent int;
  v_open_slots int;
  v_appt_id uuid;
  v_assigned uuid;
  v_excluded uuid;
  v_body text;
begin
  select * into v_site
  from public.business_sites
  where slug = lower(btrim(p_slug))
    and published
    and published_config is not null
    and booking_enabled;
  if not found then
    raise exception 'Este negocio no está recibiendo reservas en línea.' using errcode = 'P0002';
  end if;

  if length(v_name) < 3 then
    raise exception 'Escribe tu nombre completo.' using errcode = 'P0001';
  end if;
  if length(v_phone) < 7 then
    raise exception 'Escribe un teléfono válido para confirmarte la cita.' using errcode = 'P0001';
  end if;

  begin
    v_start := p_time::time;
  exception when others then
    raise exception 'La hora seleccionada no es válida.' using errcode = 'P0001';
  end;

  select * into v_service
  from public.services
  where id = p_service_id
    and user_id = v_site.user_id
    and coalesce(status, 'active') = 'active';
  if not found then
    raise exception 'El servicio seleccionado ya no está disponible.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_site.user_id::text || ':' || p_date::text, 0));

  select count(*) into v_recent
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.user_id = v_site.user_id
    and c.phone = v_phone
    and a.created_at > now() - interval '24 hours'
    and coalesce(a.status, 'pending') not in ('cancelled', 'no_show');
  if v_recent >= 10 then
    raise exception 'Ya tienes varias reservas pendientes. Escríbenos para coordinar.' using errcode = 'P0001';
  end if;

  select count(*) into v_open_slots
  from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id);
  if v_open_slots = 0 then
    raise exception 'El negocio no atiende ese día. Elige otra fecha, por favor.' using errcode = 'P0001';
  end if;

  perform 1
  from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id) slot
  where slot.slot_time = to_char(v_start, 'HH24:MI');
  if not found then
    raise exception 'Ese horario ya fue tomado. Elige otro, por favor.' using errcode = 'P0001';
  end if;

  v_assigned := p_staff_id;
  if v_assigned is null then
    -- "Any available" never lands on the admin unless the business opted in
    -- (null when nothing is excluded, see site_booking_excluded_staff).
    v_excluded := public.site_booking_excluded_staff(v_site.user_id, v_site.published_config);

    select s.id into v_assigned
      from public.staff s
     where s.user_id = v_site.user_id
       and s.show_on_website
       and coalesce(s.is_active, true)
       and coalesce(s.status, 'active') = 'active'
       and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
       and s.id is distinct from v_excluded
       and not exists (
         select 1 from public.appointments a
          where a.staff_id = s.id
            and a.appointment_date = p_date
            and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
            and a.start_time < v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30))
            and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start)
     order by (select count(*) from public.appointments a2
                where a2.staff_id = s.id and a2.appointment_date = p_date
                  and coalesce(a2.status, 'pending') not in ('cancelled', 'no_show')),
              s.full_name
     limit 1;

    -- Hay equipo visible pero nadie libre: otra reserva se llevó el cupo.
    if v_assigned is null and exists (
      select 1 from public.staff s
       where s.user_id = v_site.user_id and s.show_on_website
         and coalesce(s.is_active, true) and coalesce(s.status, 'active') = 'active'
         and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
         and s.id is distinct from v_excluded
    ) then
      raise exception 'Ese horario ya fue tomado. Elige otro, por favor.' using errcode = 'P0001';
    end if;
  end if;

  select id into v_customer_id
  from public.customers
  where user_id = v_site.user_id and phone = v_phone
  limit 1;

  if v_customer_id is null then
    insert into public.customers (user_id, full_name, phone)
    values (v_site.user_id, v_name, v_phone)
    returning id into v_customer_id;
  end if;

  insert into public.appointments (
    user_id, customer_id, service_id, staff_id, title, service_type,
    appointment_date, start_time, end_time, status, notes
  ) values (
    v_site.user_id, v_customer_id, v_service.id, v_assigned,
    v_service.name || ' · ' || v_name, v_service.name,
    p_date, v_start,
    v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30)),
    'pending', nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_appt_id;

  v_body := v_service.name || ' para el ' || to_char(p_date, 'DD/MM/YYYY') || ' a las ' || to_char(v_start, 'HH24:MI') || ' (' || v_name || ')';

  insert into public.notifications (user_id, type, severity, title, body, data)
  values (
    v_site.user_id, 'appointment', 'info', 'Nueva reserva pendiente',
    v_body,
    jsonb_build_object('appointment_id', v_appt_id, 'customer_name', v_name, 'customer_phone', v_phone)
  );

  -- Aviso aparte para quien atiende la cita, solo si tiene acceso a Ventex
  -- (membresía activa de miembro con ese `staff_id`), igual que la cancelación.
  if v_assigned is not null and exists (
    select 1
    from public.workspace_memberships m
    where m.workspace_id = v_site.user_id
      and m.staff_id = v_assigned
      and m.status = 'active'
      -- Igual que `current_staff_id()`: el dueño ya recibe el aviso general.
      and m.member_kind = 'member'
  ) then
    insert into public.notifications (user_id, recipient_staff_id, type, severity, title, body, data)
    values (
      v_site.user_id, v_assigned, 'appointment', 'info', 'Nueva reserva asignada a ti',
      v_body,
      jsonb_build_object(
        'appointment_id', v_appt_id,
        'customer_name', v_name,
        'customer_phone', v_phone,
        'event', 'booked_staff',
        'date', p_date,
        'time', to_char(v_start, 'HH24:MI'),
        'service', v_service.name
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_appt_id, 'date', p_date, 'time', to_char(v_start, 'HH24:MI'),
    'service', v_service.name, 'status', 'pending',
    'staff', (select s.full_name from public.staff s where s.id = v_assigned),
    'whatsapp', v_site.published_config #>> '{contact,whatsapp}'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.public_site_cancel_appointment(p_slug text, p_phone text, p_appointment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_site public.business_sites%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_appt public.appointments%rowtype;
  v_customer_name text;
  v_service_name text;
  v_now timestamp;
begin
  select * into v_site
  from public.business_sites
  where slug = lower(btrim(p_slug))
    and published
    and published_config is not null
    and booking_enabled;
  if not found then
    raise exception 'Este negocio no está recibiendo reservas en línea.' using errcode = 'P0002';
  end if;

  if length(v_digits) < 7 then
    raise exception 'CITA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  v_phone := right(v_digits, 10);

  select a.* into v_appt
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.id = p_appointment_id
    and a.user_id = v_site.user_id
    and c.user_id = v_site.user_id
    and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone
  for update of a;
  if not found then
    raise exception 'CITA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;

  if v_appt.status = 'cancelled' then
    return jsonb_build_object('id', v_appt.id, 'status', 'cancelled', 'already', true);
  end if;

  v_now := now() at time zone coalesce(nullif(v_site.timezone, ''), 'America/Bogota');
  -- Un "no vino" ya pasó: el cliente no puede convertirlo en cancelación.
  if v_appt.status in ('completed', 'no_show') or (v_appt.appointment_date + v_appt.start_time) < v_now then
    raise exception 'CITA_NO_CANCELABLE' using errcode = '22023';
  end if;

  update public.appointments
     set status = 'cancelled'
   where id = v_appt.id;

  select c.full_name into v_customer_name from public.customers c where c.id = v_appt.customer_id;
  v_service_name := coalesce(
    (select sv.name from public.services sv where sv.id = v_appt.service_id),
    v_appt.service_type,
    'Cita'
  );

  insert into public.notifications (user_id, type, severity, title, body, data)
  values (
    v_site.user_id, 'appointment', 'info', 'Cita cancelada por el cliente',
    v_service_name || ' del ' || to_char(v_appt.appointment_date, 'DD/MM/YYYY')
      || ' a las ' || to_char(v_appt.start_time, 'HH24:MI')
      || ' (' || coalesce(v_customer_name, 'cliente') || ')',
    jsonb_build_object(
      'appointment_id', v_appt.id,
      'customer_name', v_customer_name,
      'customer_phone', v_phone,
      'event', 'cancelled_by_customer',
      'date', v_appt.appointment_date,
      'time', to_char(v_appt.start_time, 'HH24:MI'),
      'service', v_service_name
    )
  );

  if v_appt.staff_id is not null and exists (
    select 1
    from public.workspace_memberships m
    where m.workspace_id = v_site.user_id
      and m.staff_id = v_appt.staff_id
      and m.status = 'active'
      and m.member_kind = 'member'
  ) then
    insert into public.notifications (user_id, recipient_staff_id, type, severity, title, body, data)
    values (
      v_site.user_id, v_appt.staff_id, 'appointment', 'info', 'Se canceló una de tus citas',
      v_service_name || ' del ' || to_char(v_appt.appointment_date, 'DD/MM/YYYY')
        || ' a las ' || to_char(v_appt.start_time, 'HH24:MI')
        || ' (' || coalesce(v_customer_name, 'cliente') || ')',
      jsonb_build_object(
        'appointment_id', v_appt.id,
        'customer_name', v_customer_name,
        'customer_phone', v_phone,
        'event', 'cancelled_by_customer_staff',
        'date', v_appt.appointment_date,
        'time', to_char(v_appt.start_time, 'HH24:MI'),
        'service', v_service_name
      )
    );
  end if;

  return jsonb_build_object('id', v_appt.id, 'status', 'cancelled', 'already', false);
end;
$function$;
