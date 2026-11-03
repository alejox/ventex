-- Personal: "No disponible" bloquea las reservas del sitio web.
--
-- `staff.accepts_bookings` (default true: nadie cambia de comportamiento). Lo
-- prende/apaga el dueño con el switch de la tarjeta en Personal. Distinto de
-- `show_on_website` (que esconde a la persona del sitio): quien está "No
-- disponible" sigue en la sección de equipo, pero el sitio no ofrece reservar
-- con esa persona y la base lo rechaza.
--
-- Cuerpos = los vivos (20261102100000, 20261102120000, 20261101120000) con
-- `coalesce(accepts_bookings, true)` junto a cada `coalesce(is_active, true)`:
--   * public_site_slots / public_site_day_slots: esa persona no tiene horarios,
--     no cuenta como silla libre, y si NADIE visible está disponible no hay
--     horarios (antes la capacidad mínima era 1 siempre).
--   * public_site_book: rechaza reservar con alguien no disponible, y
--     "Cualquiera disponible" nunca cae en esa persona.
--   * public_site_reschedule_appointment / public_site_find_appointments: una
--     cita con alguien no disponible no se reprograma desde el sitio.
--   * site_booking_excluded_staff: el admin solo se excluye si hay OTRA
--     persona disponible.
--   * public_site_by_slug: cada persona trae `available`.
-- El calendario del dashboard NO se toca: el negocio sigue agendando a mano.

alter table public.staff
  add column if not exists accepts_bookings boolean not null default true;

comment on column public.staff.accepts_bookings is
  'false = "No disponible": la persona no recibe reservas desde el sitio web (sigue visible en el equipo).';


create or replace function public.site_booking_excluded_staff(p_user_id uuid, p_config jsonb)
returns uuid
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select st.booking_admin_staff_id
    from public.settings st
   where st.user_id = p_user_id
     and st.booking_admin_staff_id is not null
     and not st.booking_assign_admin
     and exists (
       select 1 from public.staff s
        where s.user_id = p_user_id
          and s.id <> st.booking_admin_staff_id
          and s.show_on_website
          and (public.site_catalog_ids(p_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(p_config, 'staffIds')))
          and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true)
          and coalesce(s.status, 'active') = 'active')
   limit 1
$$;


-- ---------------------------------------------------------------------------

create or replace function public.public_site_slots(
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
       and coalesce(is_active, true) and coalesce(accepts_bookings, true)
       and coalesce(status, 'active') = 'active';
    if not found then return; end if;
  end if;

  -- Admin excluded from barber capacity unless booked explicitly by name.
  v_excluded := public.site_booking_excluded_staff(v_site.user_id, v_site.published_config);
  if p_staff_id is not null and p_staff_id = v_excluded then
    v_excluded := null;
  end if;

  select count(*) into v_capacity
    from public.staff
   where user_id = v_site.user_id
     and show_on_website
     and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
     and coalesce(is_active, true) and coalesce(accepts_bookings, true)
     and coalesce(status, 'active') = 'active'
     and id is distinct from v_excluded;

  -- Nadie del equipo visible recibe reservas ("No disponible" en Personal):
  -- sin horarios. Un sitio que no muestra a nadie sigue con capacidad 1.
  if v_capacity = 0 then
    if exists (
      select 1 from public.staff
       where user_id = v_site.user_id
         and show_on_website
         and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
         and coalesce(is_active, true)
         and coalesce(status, 'active') = 'active'
    ) then
      return;
    end if;
    v_capacity := 1;
  end if;

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
                           and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true)
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

create or replace function public.public_site_day_slots(
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
       and coalesce(is_active, true) and coalesce(accepts_bookings, true)
       and coalesce(status, 'active') = 'active';
    if not found then return; end if;
  end if;

  -- Admin excluded from barber capacity unless booked explicitly by name.
  v_excluded := public.site_booking_excluded_staff(v_site.user_id, v_site.published_config);
  if p_staff_id is not null and p_staff_id = v_excluded then
    v_excluded := null;
  end if;

  select count(*) into v_capacity
    from public.staff
   where user_id = v_site.user_id
     and show_on_website
     and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
     and coalesce(is_active, true) and coalesce(accepts_bookings, true)
     and coalesce(status, 'active') = 'active'
     and id is distinct from v_excluded;

  -- Nadie del equipo visible recibe reservas ("No disponible" en Personal):
  -- sin horarios. Un sitio que no muestra a nadie sigue con capacidad 1.
  if v_capacity = 0 then
    if exists (
      select 1 from public.staff
       where user_id = v_site.user_id
         and show_on_website
         and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
         and coalesce(is_active, true)
         and coalesce(status, 'active') = 'active'
    ) then
      return;
    end if;
    v_capacity := 1;
  end if;

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
                         and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true)
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
              and coalesce(st.is_active, true) and coalesce(st.accepts_bookings, true)
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
-- reschedule
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
       and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true)
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
       and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true)
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
         and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true) and coalesce(s.status, 'active') = 'active'
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


CREATE OR REPLACE FUNCTION public.public_site_by_slug(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with site as (
    select s.*, p.business_name, p.business_type, st.business_profile
    from public.business_sites s
    join public.profiles p on p.id = s.user_id
    left join public.settings st on st.user_id = s.user_id
    where s.slug = lower(btrim(p_slug))
      and s.published
      and s.published_config is not null
  ),
  visible_products as (
    select pr.*
    from site s
    join public.products pr on pr.user_id = s.user_id
    where coalesce(pr.status, 'active') = 'active'
      and not coalesce(pr.is_ingredient, false)
      and pr.show_on_site
      and (public.site_catalog_ids(s.published_config, 'productCategoryIds') is null
           or pr.category_id = any(public.site_catalog_ids(s.published_config, 'productCategoryIds')))
  )
  select s.published_config || jsonb_build_object(
    'slug',            s.slug,
    'template',        s.published_config ->> 'template',
    'businessName',    coalesce(nullif(btrim(s.site_name), ''), nullif(btrim(s.business_name), ''), 'Mi negocio'),
    'businessType',    s.business_type,
    'headline',        s.published_config #>> '{hero,description}',
    'about',           s.published_config #>> '{about,description}',
    'heroImageUrl',    s.published_config #>> '{hero,imageUrl}',
    'timeFormat', case when s.business_profile ->> 'timeFormat' = '24' then '24' else '12' end,
    'logoUrl',         s.business_profile ->> 'logoUrl',
    'whatsapp',        s.published_config #>> '{contact,whatsapp}',
    'address',         s.published_config #>> '{contact,address}',
    'instagram',       s.published_config #>> '{contact,instagram}',
    'facebook',        s.published_config #>> '{contact,facebook}',
    'tiktok',          s.published_config #>> '{contact,tiktok}',
    'youtube',         s.published_config #>> '{contact,youtube}',
    'twitter',         s.published_config #>> '{contact,twitter}',
    'linkedin',        s.published_config #>> '{contact,linkedin}',
    'telegram',        s.published_config #>> '{contact,telegram}',
    'website',         s.published_config #>> '{contact,website}',
    'bookingEnabled',  s.booking_enabled,
    'bookingAllowAny', s.booking_allow_any,
    'timezone',        s.timezone,
    'config',          s.published_config,
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'weekday', h.weekday, 'isOpen', h.is_open,
               'opensAt', to_char(h.opens_at, 'HH24:MI'),
               'closesAt', to_char(h.closes_at, 'HH24:MI')
             ) order by h.weekday), '[]'::jsonb)
      from public.business_hours h
      where h.user_id = s.user_id
    ),
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', sv.id, 'name', sv.name, 'description', sv.description,
               'price', sv.price, 'durationMinutes', coalesce(sv.duration_minutes, 30),
               'icon', sv.icon, 'imageUrl', sv.image_url
             ) order by sv.name), '[]'::jsonb)
      from public.services sv
      where sv.user_id = s.user_id and coalesce(sv.status, 'active') = 'active' and sv.show_on_site and (public.site_catalog_ids(s.published_config, 'serviceCategoryIds') is null or sv.category_id = any(public.site_catalog_ids(s.published_config, 'serviceCategoryIds')))
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', pr.id, 'name', pr.name, 'price', pr.price,
               'imageUrl', pr.image_url, 'icon', pr.icon, 'unit', pr.unit,
               'categoryId', pr.category_id,
               'inStock', (not coalesce(pr.tracks_stock, true)) or coalesce(pr.stock_level, 0) > 0
             ) order by pr.name), '[]'::jsonb)
      from visible_products pr
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name), '[]'::jsonb)
      from public.categories c
      where c.user_id = s.user_id
        and exists (select 1 from visible_products pr where pr.category_id = c.id)
    ),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', stf.id, 'fullName', stf.full_name, 'role', stf.role,
               'photoUrl', stf.photo_url,
               'available', coalesce(stf.accepts_bookings, true)
             ) order by stf.full_name), '[]'::jsonb)
      from public.staff stf
      where stf.user_id = s.user_id and (public.site_catalog_ids(s.published_config, 'staffIds') is null or stf.id = any(public.site_catalog_ids(s.published_config, 'staffIds'))) and stf.show_on_website
        and coalesce(stf.is_active, true)
        and coalesce(stf.status, 'active') = 'active'
    )
  )
  from site s;
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

  -- The business turned off "Cualquiera disponible": a person is required, as
  -- long as the site shows at least one (otherwise there is nobody to choose).
  if p_staff_id is null and not v_site.booking_allow_any and exists (
    select 1 from public.staff s
     where s.user_id = v_site.user_id and s.show_on_website
       and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true) and coalesce(s.status, 'active') = 'active'
       and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
  ) then
    raise exception 'Elige con quién quieres tu cita.' using errcode = 'P0001';
  end if;

  -- "No disponible" en Personal: esa persona no recibe reservas en línea.
  if p_staff_id is not null and exists (
    select 1 from public.staff s
     where s.id = p_staff_id and s.user_id = v_site.user_id
       and not coalesce(s.accepts_bookings, true)
  ) then
    raise exception 'Esa persona no está disponible por ahora. Elige a otra, por favor.' using errcode = 'P0001';
  end if;

  -- El sitio muestra equipo pero nadie está disponible: no hay con quién reservar.
  if exists (
    select 1 from public.staff s
     where s.user_id = v_site.user_id and s.show_on_website
       and coalesce(s.is_active, true) and coalesce(s.status, 'active') = 'active'
       and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
  ) and not exists (
    select 1 from public.staff s
     where s.user_id = v_site.user_id and s.show_on_website
       and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true) and coalesce(s.status, 'active') = 'active'
       and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
  ) then
    raise exception 'Por ahora no hay nadie disponible para reservar en línea. Escríbenos para coordinar tu cita.' using errcode = 'P0001';
  end if;

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
       and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true)
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
         and coalesce(s.is_active, true) and coalesce(s.accepts_bookings, true) and coalesce(s.status, 'active') = 'active'
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
