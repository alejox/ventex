-- Booking: optional auto-assignment to the business admin.
--
-- Nothing in the data links a staff row to the owner account, so the owner picks
-- explicitly which staff row is theirs (settings.booking_admin_staff_id). While
-- booking_assign_admin is false (the default), public "any available" bookings:
--   * never auto-assign to that row, and
--   * do not count that row as booking capacity, so a slot shows as taken once
--     every OTHER visible barber is busy (appointments assigned to the admin do
--     not consume barber capacity either).
-- Choosing the admin explicitly by name keeps the previous behavior.
-- No admin row selected (null) = previous behavior, unchanged.
--
-- public_site_slots / public_site_day_slots / public_site_book were patched in
-- place on the live DB (20261006020000, 20261006040000); the definitions below
-- are full rewrites of the LIVE bodies (pg_get_functiondef) plus the exclusion.

alter table public.settings
  add column if not exists booking_admin_staff_id uuid null
    references public.staff(id) on delete set null,
  add column if not exists booking_assign_admin boolean not null default false;

-- Owner-only write + same-tenant staff check. Sibling of
-- guard_owner_uses_shifts_setting (same pattern), not an extension of it.
create or replace function public.guard_booking_admin_setting()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and (new.booking_admin_staff_id is not null or new.booking_assign_admin))
     or (tg_op = 'UPDATE' and (new.booking_admin_staff_id is distinct from old.booking_admin_staff_id
                               or new.booking_assign_admin is distinct from old.booking_assign_admin)) then
    if auth.uid() is not null and not public.is_tenant_owner()
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Solo el administrador del negocio puede cambiar la asignación de reservas'
        using errcode = '42501';
    end if;

    if new.booking_admin_staff_id is not null and not exists (
      select 1 from public.staff s
       where s.id = new.booking_admin_staff_id and s.user_id = new.user_id
    ) then
      raise exception 'La ficha elegida no pertenece a este negocio'
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists settings_guard_booking_admin on public.settings;
create trigger settings_guard_booking_admin
before insert or update of booking_admin_staff_id, booking_assign_admin on public.settings
for each row execute function public.guard_booking_admin_setting();

-- `settings` has table-level GRANT SELECT/INSERT/UPDATE for authenticated, so the
-- new columns are readable/writable without column GRANTs; tenant RLS and the
-- guard above decide who can change them.

-- Staff row excluded from "any available" assignment and capacity for a site,
-- or null when nothing is excluded.
-- Fallback: when the admin is the ONLY visible active staff in the site catalog,
-- excluding it would leave zero capacity and close the online agenda of a
-- one-person business, so nothing is excluded (behaves like before).
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
          and coalesce(s.is_active, true)
          and coalesce(s.status, 'active') = 'active')
   limit 1
$$;

revoke all on function public.site_booking_excluded_staff(uuid, jsonb) from public, anon, authenticated;

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

  perform pg_advisory_xact_lock(hashtextextended(v_site.user_id::text || ':' || p_date::text, 0));

  select count(*) into v_recent
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.user_id = v_site.user_id
    and c.phone = v_phone
    and a.created_at > now() - interval '24 hours'
    and coalesce(a.status, 'pending') <> 'cancelled';
  if v_recent >= 10 then
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
            and coalesce(a.status, 'pending') <> 'cancelled'
            and a.start_time < v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30))
            and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start)
     order by (select count(*) from public.appointments a2
                where a2.staff_id = s.id and a2.appointment_date = p_date
                  and coalesce(a2.status, 'pending') <> 'cancelled'),
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
      raise exception 'Ese horario ya fue tomado. Elegí otro, por favor.' using errcode = 'P0001';
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

  insert into public.notifications (user_id, type, severity, title, body, data)
  values (
    v_site.user_id, 'appointment', 'info', 'Nueva reserva pendiente',
    v_service.name || ' para el ' || to_char(p_date, 'DD/MM/YYYY') || ' a las ' || to_char(v_start, 'HH24:MI') || ' (' || v_name || ')',
    jsonb_build_object('appointment_id', v_appt_id, 'customer_name', v_name, 'customer_phone', v_phone)
  );

  return jsonb_build_object(
    'id', v_appt_id, 'date', p_date, 'time', to_char(v_start, 'HH24:MI'),
    'service', v_service.name, 'status', 'pending',
    'staff', (select s.full_name from public.staff s where s.id = v_assigned),
    'whatsapp', v_site.published_config #>> '{contact,whatsapp}'
  );
end;
$function$;
