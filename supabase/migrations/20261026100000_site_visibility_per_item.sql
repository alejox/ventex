-- Visibilidad por ítem en el sitio web.
--
-- Hasta ahora el sitio solo filtraba por categoría (`productCategoryIds` /
-- `serviceCategoryIds` del published_config). Esto agrega un interruptor por
-- producto y por servicio. Default true: ningún catálogo existente cambia.
-- Solo afecta al sitio público; POS, inventario y reservas internas lo ignoran.

alter table public.products
  add column if not exists show_on_site boolean not null default true;
alter table public.services
  add column if not exists show_on_site boolean not null default true;

comment on column public.products.show_on_site is
  'Si el producto aparece en el sitio web público (public_site_by_slug).';
comment on column public.services.show_on_site is
  'Si el servicio aparece en el sitio web público (public_site_by_slug).';

-- Columna nueva de products al GRANT por columna (ver
-- 20261008100500_products_cost_column_privileges.sql) y a PRODUCT_COLUMNS.
grant select (show_on_site) on public.products to authenticated;

create or replace function public.public_site_by_slug(p_slug text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
