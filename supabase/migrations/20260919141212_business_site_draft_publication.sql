-- Landing content has a draft and an independently published snapshot. Editing
-- an online site must never leak half-finished changes to public visitors.
alter table public.business_sites
  add column draft_config jsonb,
  add column published_config jsonb;

with legacy as (
  select
    id,
    jsonb_build_object(
      'version', 1,
      'template', case template
        when 'clasico' then 'rasm'
        when 'moderno' then 'fallspa'
        when 'minimal' then 'qutter'
        else 'rasm'
      end,
      'colors', jsonb_build_object('primary', null),
      'hero', jsonb_build_object(
        'eyebrow', 'Bienvenidos',
        'title', null,
        'description', headline,
        'imageUrl', hero_image_url
      ),
      'about', jsonb_build_object(
        'title', 'Nuestra esencia',
        'description', about,
        'imageUrl', null
      ),
      'gallery', jsonb_build_object('title', 'Nuestro espacio', 'images', '[]'::jsonb),
      'contact', jsonb_build_object(
        'whatsapp', whatsapp,
        'address', address,
        'instagram', instagram,
        'facebook', facebook,
        'tiktok', tiktok,
        'youtube', youtube,
        'twitter', twitter,
        'linkedin', linkedin,
        'telegram', telegram,
        'website', website
      ),
      'seo', jsonb_build_object('title', null, 'description', null, 'imageUrl', null),
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'services', 'visible', true, 'title', 'Servicios', 'subtitle', 'Lo que hacemos'),
        jsonb_build_object('id', 'about', 'visible', true, 'title', 'Nuestra esencia', 'subtitle', 'Sobre nosotros'),
        jsonb_build_object('id', 'products', 'visible', true, 'title', 'Productos', 'subtitle', 'Para llevar'),
        jsonb_build_object('id', 'team', 'visible', true, 'title', 'El equipo', 'subtitle', 'Quienes te reciben'),
        jsonb_build_object('id', 'gallery', 'visible', true, 'title', 'Nuestro espacio', 'subtitle', 'Conocenos'),
        jsonb_build_object('id', 'booking', 'visible', true, 'title', 'Reservá tu turno', 'subtitle', 'Agenda online'),
        jsonb_build_object('id', 'hours', 'visible', true, 'title', 'Horarios', 'subtitle', 'Planificá tu visita'),
        jsonb_build_object('id', 'contact', 'visible', true, 'title', 'Dónde estamos', 'subtitle', 'Hablemos')
      )
    ) as config
  from public.business_sites
)
update public.business_sites site
set
  draft_config = legacy.config,
  published_config = case when site.published then legacy.config else null end
from legacy
where legacy.id = site.id;

alter table public.business_sites
  alter column draft_config set default '{"version":1,"template":"rasm","colors":{"primary":null},"hero":{"eyebrow":"Bienvenidos","title":null,"description":null,"imageUrl":null},"about":{"title":"Nuestra esencia","description":null,"imageUrl":null},"gallery":{"title":"Nuestro espacio","images":[]},"contact":{},"seo":{},"sections":[{"id":"services","visible":true,"title":"Servicios","subtitle":"Lo que hacemos"},{"id":"about","visible":true,"title":"Nuestra esencia","subtitle":"Sobre nosotros"},{"id":"products","visible":true,"title":"Productos","subtitle":"Para llevar"},{"id":"team","visible":true,"title":"El equipo","subtitle":"Quienes te reciben"},{"id":"gallery","visible":true,"title":"Nuestro espacio","subtitle":"Conocenos"},{"id":"booking","visible":true,"title":"Reservá tu turno","subtitle":"Agenda online"},{"id":"hours","visible":true,"title":"Horarios","subtitle":"Planificá tu visita"},{"id":"contact","visible":true,"title":"Dónde estamos","subtitle":"Hablemos"}]}'::jsonb,
  alter column draft_config set not null;

alter table public.business_sites
  add constraint business_sites_draft_config_valid check (
    jsonb_typeof(draft_config) = 'object'
    and draft_config @> '{"version":1}'::jsonb
    and coalesce(draft_config ->> 'template' in ('rasm', 'fallspa', 'qutter'), false)
  ),
  add constraint business_sites_published_config_valid check (
    published_config is null
    or (
      jsonb_typeof(published_config) = 'object'
      and published_config @> '{"version":1}'::jsonb
      and coalesce(published_config ->> 'template' in ('rasm', 'fallspa', 'qutter'), false)
    )
  ),
  add constraint business_sites_published_has_snapshot check (
    not published or published_config is not null
  );

create or replace function public.set_business_site_published(p_published boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.business_sites%rowtype;
begin
  if auth.uid() is null or auth.uid() <> public.get_effective_user_id() then
    raise exception 'Solo el dueño puede publicar la landing.' using errcode = '42501';
  end if;

  update public.business_sites
  set
    published = p_published,
    published_config = case when p_published then draft_config else published_config end,
    updated_at = now()
  where user_id = public.get_effective_user_id()
  returning * into v_site;

  if not found then
    raise exception 'Primero guardá la landing.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_site);
end;
$$;

revoke all on function public.set_business_site_published(boolean) from public, anon;
grant execute on function public.set_business_site_published(boolean) to authenticated;

-- The public payload is assembled from the frozen snapshot. Operational data
-- such as catalog, staff and hours remains live and is projected field by field.
create or replace function public.public_site_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.published_config || jsonb_build_object(
    'slug',            s.slug,
    'template',        s.published_config ->> 'template',
    'businessName',    coalesce(nullif(btrim(p.business_name), ''), 'Mi negocio'),
    'businessType',    p.business_type,
    'headline',        s.published_config #>> '{hero,description}',
    'about',           s.published_config #>> '{about,description}',
    'heroImageUrl',    s.published_config #>> '{hero,imageUrl}',
    'logoUrl',         st.business_profile ->> 'logoUrl',
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
    'timezone',        s.timezone,
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
               'icon', sv.icon
             ) order by sv.name), '[]'::jsonb)
      from public.services sv
      where sv.user_id = s.user_id and coalesce(sv.status, 'active') = 'active'
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', pr.id, 'name', pr.name, 'price', pr.price,
               'imageUrl', pr.image_url, 'icon', pr.icon, 'unit', pr.unit,
               'inStock', coalesce(pr.stock_level, 0) > 0
             ) order by pr.name), '[]'::jsonb)
      from public.products pr
      where pr.user_id = s.user_id and coalesce(pr.status, 'active') = 'active'
    ),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', stf.id, 'fullName', stf.full_name, 'role', stf.role
             ) order by stf.full_name), '[]'::jsonb)
      from public.staff stf
      where stf.user_id = s.user_id
        and coalesce(stf.is_active, true)
        and coalesce(stf.status, 'active') = 'active'
    )
  )
  from public.business_sites s
  join public.profiles p on p.id = s.user_id
  left join public.settings st on st.user_id = s.user_id
  where s.slug = lower(btrim(p_slug))
    and s.published
    and s.published_config is not null;
$$;

create or replace function public.public_site_book(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_time text,
  p_customer_name text,
  p_customer_phone text,
  p_staff_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) from public;
grant execute on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) to anon, authenticated;
