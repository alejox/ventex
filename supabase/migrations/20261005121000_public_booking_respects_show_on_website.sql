-- "Mostrar en la página web" manda en TODA la reserva pública, no solo en la
-- lista de profesionales.
--
-- `staff.show_on_website` se aplicó en vivo sin migración (ver CLAUDE.md, el
-- hueco de objetos creados por MCP); acá queda escrito. Lo leía
-- `public_site_by_slug` (la lista) y `public_site_slots` (validar un
-- profesional puntual), pero:
--   * `public_site_day_slots` no lo miraba: un id de alguien oculto devolvía
--     su grilla igual.
--   * la CAPACIDAD de "cualquiera disponible" contaba a TODO el staff activo,
--     cajeros y recepción incluidos. Con 2 barberos y 1 cajera, el sitio
--     aceptaba 3 reservas a la misma hora.
--   * reservar con un profesional puntual solo miraba SUS citas: dos reservas
--     "cualquiera" a las 10:00 llenaban el local y aun así entraba una tercera
--     eligiendo al barbero A.
--
-- Ahora un turno está libre si (a) quedan sillas entre la gente visible en la
-- web y (b) si se pidió alguien puntual, esa persona no tiene cita. Las citas
-- asignadas a alguien oculto no consumen sillas de la web.
--
-- `public_site_book` además toma un lock por negocio y día: entre "¿está
-- libre?" y el INSERT dos visitantes podían quedarse con el mismo turno.

alter table public.staff
  add column if not exists show_on_website boolean not null default false;

comment on column public.staff.show_on_website is
  'Aparece en el micrositio y recibe reservas online. Cajeros/recepción van en false.';

create or replace function public.public_site_slots(
  p_slug text, p_service_id uuid, p_date date, p_staff_id uuid default null
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
     where id = p_staff_id and show_on_website
       and user_id = v_site.user_id
       and coalesce(is_active, true)
       and coalesce(status, 'active') = 'active';
    if not found then return; end if;
  end if;

  select greatest(count(*), 1) into v_capacity
    from public.staff
   where user_id = v_site.user_id
     and show_on_website
     and coalesce(is_active, true)
     and coalesce(status, 'active') = 'active';

  v_open_min  := extract(hour from v_hours.opens_at)  * 60 + extract(minute from v_hours.opens_at);
  v_close_min := extract(hour from v_hours.closes_at) * 60 + extract(minute from v_hours.closes_at);

  -- Integer minute arithmetic on purpose: `time + interval` wraps past midnight
  -- and would loop forever on a late closing time.
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
                           and coalesce(s.is_active, true)
                           and coalesce(s.status, 'active') = 'active')
        ),
        count(*) filter (where a.staff_id = p_staff_id)
        into v_any_taken, v_staff_taken
        from public.appointments a
       where a.user_id = v_site.user_id
         and a.appointment_date = p_date
         and coalesce(a.status, 'pending') <> 'cancelled'
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

create or replace function public.public_site_day_slots(
  p_slug text, p_service_id uuid, p_date date, p_staff_id uuid default null
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
     where id = p_staff_id and show_on_website
       and user_id = v_site.user_id
       and coalesce(is_active, true)
       and coalesce(status, 'active') = 'active';
    if not found then return; end if;
  end if;

  select greatest(count(*), 1) into v_capacity
    from public.staff
   where user_id = v_site.user_id
     and show_on_website
     and coalesce(is_active, true)
     and coalesce(status, 'active') = 'active';

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
                         and coalesce(s.is_active, true)
                         and coalesce(s.status, 'active') = 'active')
      ),
      count(*) filter (where a.staff_id = p_staff_id)
      into v_any_taken, v_staff_taken
      from public.appointments a
     where a.user_id = v_site.user_id
       and a.appointment_date = p_date
       and coalesce(a.status, 'pending') <> 'cancelled'
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

create or replace function public.public_site_book(
  p_slug text, p_service_id uuid, p_date date, p_time text,
  p_customer_name text, p_customer_phone text,
  p_staff_id uuid default null, p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    raise exception 'Escribí tu nombre completo.' using errcode = 'P0001';
  end if;
  if length(v_phone) < 7 then
    raise exception 'Escribí un teléfono válido para confirmarte la cita.' using errcode = 'P0001';
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

  -- Serializa las reservas del mismo negocio y día: sin esto, dos visitantes
  -- que confirman a la vez pasan los dos el chequeo de cupo y quedan dos citas
  -- sobre una sola silla. Se libera solo al terminar la transacción.
  perform pg_advisory_xact_lock(hashtextextended(v_site.user_id::text || ':' || p_date::text, 0));

  select count(*) into v_recent
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.user_id = v_site.user_id
    and c.phone = v_phone
    and a.created_at > now() - interval '24 hours'
    and coalesce(a.status, 'pending') <> 'cancelled';
  if v_recent >= 3 then
    raise exception 'Ya tenés varias reservas pendientes. Escribinos para coordinar.' using errcode = 'P0001';
  end if;

  select count(*) into v_open_slots
  from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id);
  if v_open_slots = 0 then
    raise exception 'El negocio no atiende ese día. Elegí otra fecha, por favor.' using errcode = 'P0001';
  end if;

  perform 1
  from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id) slot
  where slot.slot_time = to_char(v_start, 'HH24:MI');
  if not found then
    raise exception 'Ese horario ya fue tomado. Elegí otro, por favor.' using errcode = 'P0001';
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
    v_site.user_id, v_customer_id, v_service.id, p_staff_id,
    v_service.name || ' · ' || v_name, v_service.name,
    p_date, v_start,
    v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30)),
    'pending', nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_appt_id;

  insert into public.notifications (user_id, type, severity, title, body, data)
  values (
    v_site.user_id, 'appointment', 'info', 'Nueva reserva pendiente',
    v_service.name || ' para el ' || to_char(p_date, 'DD/MM/YYYY') || ' a las ' || to_char(v_start, 'HH24:MI') || ' (' || v_name || ')',
    jsonb_build_object('appointment_id', v_appt_id, 'customer_name', v_name, 'customer_phone', v_phone)
  );

  return jsonb_build_object(
    'id', v_appt_id, 'date', p_date, 'time', to_char(v_start, 'HH24:MI'),
    'service', v_service.name, 'status', 'pending',
    'whatsapp', v_site.published_config #>> '{contact,whatsapp}'
  );
end;
$function$;
