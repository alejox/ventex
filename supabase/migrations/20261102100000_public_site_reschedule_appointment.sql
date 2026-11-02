-- Public site: a customer moves their own appointment to another day/time,
-- found by the same phone match used to cancel (booking UX phase 4).
--
-- 1. The slot functions learn to ignore ONE appointment
--    (`p_exclude_appointment_id`, default null): the appointment being moved
--    must not block its own new time. The parameter goes last with a default,
--    and the old signature is dropped in the same migration (if both existed,
--    every 4-argument call would be ambiguous). Bodies are the live ones
--    (`pg_get_functiondef`) plus the `a.id is distinct from` filter. Knowing an
--    appointment uuid is required to use it, and it only frees that one row.
-- 2. `public_site_find_appointments` also returns `serviceId`, `staffId` and
--    `reschedulable`, so the site can show the pickers for that service/staff.
-- 3. `public_site_reschedule_appointment` re-validates the slot under the same
--    advisory lock as `public_site_book`, sets the appointment back to
--    `pending` and notifies the owner and the assigned staff member.

-- ---------------------------------------------------------------------------
-- 1. Slot functions with an excluded appointment
-- ---------------------------------------------------------------------------

drop function if exists public.public_site_slots(text, uuid, date, uuid);

create function public.public_site_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_staff_id uuid default null::uuid,
  p_exclude_appointment_id uuid default null::uuid
)
 returns table(slot_time text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
         and a.id is distinct from p_exclude_appointment_id
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

revoke all on function public.public_site_slots(text, uuid, date, uuid, uuid) from public;
grant execute on function public.public_site_slots(text, uuid, date, uuid, uuid) to anon, authenticated, service_role;

drop function if exists public.public_site_day_slots(text, uuid, date, uuid);

create function public.public_site_day_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_staff_id uuid default null::uuid,
  p_exclude_appointment_id uuid default null::uuid
)
 returns table(slot_time text, slot_state text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
       and a.id is distinct from p_exclude_appointment_id
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

revoke all on function public.public_site_day_slots(text, uuid, date, uuid, uuid) from public;
grant execute on function public.public_site_day_slots(text, uuid, date, uuid, uuid) to anon, authenticated, service_role;

drop function if exists public.public_site_availability(text, uuid, date, integer, uuid);

create function public.public_site_availability(
  p_slug text,
  p_service_id uuid,
  p_from date,
  p_days integer default 21,
  p_staff_id uuid default null::uuid,
  p_exclude_appointment_id uuid default null::uuid
)
 returns table(day date, is_open boolean, free_slots integer)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site  public.business_sites%rowtype;
  v_open  boolean;
  v_i     int;
  v_day   date;
begin
  select * into v_site
    from public.business_sites
   where slug = lower(btrim(p_slug)) and published and booking_enabled;
  if not found then return; end if;

  for v_i in 0 .. greatest(least(coalesce(p_days, 21), 60), 1) - 1 loop
    v_day := p_from + v_i;

    select h.is_open into v_open
      from public.business_hours h
     where h.user_id = v_site.user_id
       and h.weekday = extract(dow from v_day)::smallint;

    day        := v_day;
    is_open    := coalesce(v_open, false);
    free_slots := (
      select count(*)::int
        from public.public_site_slots(p_slug, p_service_id, v_day, p_staff_id, p_exclude_appointment_id)
    );
    return next;
  end loop;

  return;
end;
$function$;

revoke all on function public.public_site_availability(text, uuid, date, integer, uuid, uuid) from public;
grant execute on function public.public_site_availability(text, uuid, date, integer, uuid, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Lookup returns what the site needs to offer "Cambiar fecha"
-- ---------------------------------------------------------------------------

create or replace function public.public_site_find_appointments(p_slug text, p_phone text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site public.business_sites%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_now timestamp;
  v_result jsonb;
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
    return '[]'::jsonb;
  end if;
  v_phone := right(v_digits, 10);

  v_now := now() at time zone coalesce(nullif(v_site.timezone, ''), 'America/Bogota');

  select coalesce(jsonb_agg(row_data order by sort_key), '[]'::jsonb) into v_result
  from (
    select
      a.appointment_date + a.start_time as sort_key,
      jsonb_build_object(
        'id', a.id,
        'date', a.appointment_date,
        'time', to_char(a.start_time, 'HH24:MI'),
        'service', coalesce(sv.name, a.service_type),
        'staff', st.full_name,
        'status', a.status,
        'serviceId', a.service_id,
        'staffId', a.staff_id,
        -- Same rules `public_site_reschedule_appointment` enforces: the service
        -- still bookable, and the assigned person (if any) still on the site.
        'reschedulable', (
          sv.id is not null
          and coalesce(sv.status, 'active') = 'active'
          and (
            a.staff_id is null
            or (
              st.id is not null
              and st.show_on_website
              and coalesce(st.is_active, true)
              and coalesce(st.status, 'active') = 'active'
              and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null
                   or st.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
            )
          )
        )
      ) as row_data
    from public.appointments a
    join public.customers c on c.id = a.customer_id
    left join public.services sv on sv.id = a.service_id
    left join public.staff st on st.id = a.staff_id
    where a.user_id = v_site.user_id
      and c.user_id = v_site.user_id
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone
      and a.status in ('pending', 'confirmed')
      and (a.appointment_date + a.start_time) >= v_now
    order by a.appointment_date, a.start_time
    limit 10
  ) upcoming;

  return v_result;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Reschedule
-- ---------------------------------------------------------------------------

create or replace function public.public_site_reschedule_appointment(
  p_slug text,
  p_appointment_id uuid,
  p_phone text,
  p_date date,
  p_time text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site public.business_sites%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_appt public.appointments%rowtype;
  v_service public.services%rowtype;
  v_start time;
  v_end time;
  v_now timestamp;
  v_open_slots int;
  v_assigned uuid;
  v_excluded uuid;
  v_customer_name text;
  v_body text;
  v_data jsonb;
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

  if p_date is null then
    raise exception 'Elige la nueva fecha de tu cita.' using errcode = 'P0001';
  end if;
  begin
    v_start := p_time::time;
  exception when others then
    raise exception 'La hora seleccionada no es válida.' using errcode = 'P0001';
  end;

  -- Same ownership + phone match as public_site_cancel_appointment. The row
  -- lock serializes two reschedules (or a reschedule and a cancel) of it.
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

  v_now := now() at time zone coalesce(nullif(v_site.timezone, ''), 'America/Bogota');
  if coalesce(v_appt.status, 'pending') not in ('pending', 'confirmed')
     or (v_appt.appointment_date + v_appt.start_time) < v_now then
    raise exception 'CITA_NO_REPROGRAMABLE' using errcode = '22023';
  end if;

  select * into v_service
  from public.services
  where id = v_appt.service_id
    and user_id = v_site.user_id
    and coalesce(status, 'active') = 'active';
  if not found then
    raise exception 'El servicio de esta cita ya no se reserva en línea. Escríbele al negocio para cambiarla.' using errcode = 'P0001';
  end if;

  if v_appt.staff_id is not null and not exists (
    select 1 from public.staff s
     where s.id = v_appt.staff_id
       and s.user_id = v_site.user_id
       and s.show_on_website
       and coalesce(s.is_active, true)
       and coalesce(s.status, 'active') = 'active'
       and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null
            or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
  ) then
    raise exception 'La persona que te atiende ya no recibe reservas en línea. Escríbele al negocio para cambiar la cita.' using errcode = 'P0001';
  end if;

  if p_date = v_appt.appointment_date and v_start = v_appt.start_time then
    raise exception 'Tu cita ya está en ese horario. Elige otro, por favor.' using errcode = 'P0001';
  end if;

  -- Same advisory lock as public_site_book, on both days and always in date
  -- order, so two reschedules crossing the same two days cannot deadlock.
  perform pg_advisory_xact_lock(hashtextextended(v_site.user_id::text || ':' || least(p_date, v_appt.appointment_date)::text, 0));
  if p_date <> v_appt.appointment_date then
    perform pg_advisory_xact_lock(hashtextextended(v_site.user_id::text || ':' || greatest(p_date, v_appt.appointment_date)::text, 0));
  end if;

  -- The appointment being moved never blocks its own new time.
  select count(*) into v_open_slots
  from public.public_site_slots(p_slug, v_service.id, p_date, v_appt.staff_id, v_appt.id);
  if v_open_slots = 0 then
    raise exception 'No hay horarios libres ese día. Elige otra fecha, por favor.' using errcode = 'P0001';
  end if;

  perform 1
  from public.public_site_slots(p_slug, v_service.id, p_date, v_appt.staff_id, v_appt.id) slot
  where slot.slot_time = to_char(v_start, 'HH24:MI');
  if not found then
    raise exception 'Ese horario ya fue tomado. Elige otro, por favor.' using errcode = 'P0001';
  end if;

  v_end := v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30));

  v_assigned := v_appt.staff_id;
  if v_assigned is null then
    -- "Any available", exactly as public_site_book, minus this appointment.
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
            and a.id <> v_appt.id
            and a.appointment_date = p_date
            and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
            and a.start_time < v_end
            and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start)
     order by (select count(*) from public.appointments a2
                where a2.staff_id = s.id and a2.appointment_date = p_date
                  and a2.id <> v_appt.id
                  and coalesce(a2.status, 'pending') not in ('cancelled', 'no_show')),
              s.full_name
     limit 1;

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

  -- Back to `pending`: the business confirms the new time again.
  update public.appointments
     set appointment_date = p_date,
         start_time = v_start,
         end_time = v_end,
         staff_id = v_assigned,
         status = 'pending'
   where id = v_appt.id;

  select c.full_name into v_customer_name from public.customers c where c.id = v_appt.customer_id;

  v_body := v_service.name || ': '
    || to_char(v_appt.appointment_date, 'DD/MM/YYYY') || ' ' || to_char(v_appt.start_time, 'HH24:MI')
    || ' → ' || to_char(p_date, 'DD/MM/YYYY') || ' ' || to_char(v_start, 'HH24:MI')
    || ' (' || coalesce(v_customer_name, 'cliente') || ')';

  v_data := jsonb_build_object(
    'appointment_id', v_appt.id,
    'customer_name', v_customer_name,
    'customer_phone', v_phone,
    'event', 'rescheduled',
    'date', p_date,
    'time', to_char(v_start, 'HH24:MI'),
    'previous_date', v_appt.appointment_date,
    'previous_time', to_char(v_appt.start_time, 'HH24:MI'),
    'service', v_service.name
  );

  insert into public.notifications (user_id, type, severity, title, body, data)
  values (v_site.user_id, 'appointment', 'info', 'Cita reprogramada', v_body, v_data);

  -- Same gate as the booking/cancel notices: only a member with Ventex access.
  if v_assigned is not null and exists (
    select 1
    from public.workspace_memberships m
    where m.workspace_id = v_site.user_id
      and m.staff_id = v_assigned
      and m.status = 'active'
      and m.member_kind = 'member'
  ) then
    insert into public.notifications (user_id, recipient_staff_id, type, severity, title, body, data)
    values (
      v_site.user_id, v_assigned, 'appointment', 'info', 'Se reprogramó una de tus citas',
      v_body, v_data || jsonb_build_object('event', 'rescheduled_staff')
    );
  end if;

  return jsonb_build_object(
    'id', v_appt.id,
    'date', p_date,
    'time', to_char(v_start, 'HH24:MI'),
    'service', v_service.name,
    'staff', (select s.full_name from public.staff s where s.id = v_assigned),
    'status', 'pending'
  );
end;
$function$;

comment on function public.public_site_reschedule_appointment(text, uuid, text, date, text) is
  'Sitio público: mueve una cita futura del teléfono dado a otro horario libre (mismo servicio y profesional), la deja pendiente y avisa al dueño y a quien la atiende (si tiene acceso).';

revoke all on function public.public_site_reschedule_appointment(text, uuid, text, date, text) from public;
grant execute on function public.public_site_reschedule_appointment(text, uuid, text, date, text) to anon, authenticated, service_role;
