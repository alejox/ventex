-- Booking: each business decides whether its public widget offers
-- "Cualquiera disponible" (any available staff member).
--
-- 1. `business_sites.booking_allow_any` (default true, so every existing site
--    keeps today's behaviour). It sits next to `booking_enabled` /
--    `slot_interval_minutes`; `authenticated` holds table-level privileges on
--    `business_sites` and RLS (`workspace_business_sites_write`) already limits
--    writes, so no column grant is needed.
-- 2. `public_site_by_slug` exposes it as `bookingAllowAny`. Body is the live
--    `pg_get_functiondef` plus that key; ACL unchanged.
-- 3. `public_site_book` rejects a null `p_staff_id` when the option is off and
--    the site has at least one visible bookable staff member (same predicate the
--    function already uses for "any available"). A site with no visible staff
--    keeps working without a person. Body is the live one plus that guard.

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------

alter table public.business_sites
  add column booking_allow_any boolean not null default true;

comment on column public.business_sites.booking_allow_any is
  'When false, the public booking widget hides "Cualquiera disponible" and public_site_book requires a staff member (if the site shows any).';

-- ---------------------------------------------------------------------------
-- 2. public_site_by_slug exposes bookingAllowAny
-- ---------------------------------------------------------------------------

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
               'photoUrl', stf.photo_url
             ) order by stf.full_name), '[]'::jsonb)
      from public.staff stf
      where stf.user_id = s.user_id and (public.site_catalog_ids(s.published_config, 'staffIds') is null or stf.id = any(public.site_catalog_ids(s.published_config, 'staffIds'))) and stf.show_on_website
        and coalesce(stf.is_active, true)
        and coalesce(stf.status, 'active') = 'active'
    )
  )
  from site s;
$function$;

-- ---------------------------------------------------------------------------
-- 3. public_site_book requires a person when "any available" is off
-- ---------------------------------------------------------------------------

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
       and coalesce(s.is_active, true) and coalesce(s.status, 'active') = 'active'
       and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
  ) then
    raise exception 'Elige con quién quieres tu cita.' using errcode = 'P0001';
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
