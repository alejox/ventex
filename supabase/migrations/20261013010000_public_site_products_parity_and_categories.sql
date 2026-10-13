-- Public site (visitor RPC) products: parity fix + categories for the tienda catalog.
--
-- 1. Parity. `20261008100400_public_site_hides_ingredients.sql` fixed only
--    `site_public_projection` (owner preview). The visitor RPC
--    `public_site_by_slug` kept reading `products` directly, so:
--      - "Solo insumo" products (`is_ingredient`) were shown to visitors;
--      - products that do not track stock showed as out of stock
--        (`stock_level` stays 0 for them).
-- 2. Tienda catalog (odd/tasks/tienda-website.md): each product carries its
--    `categoryId`, and the site exposes `categories` — only the ones that have
--    at least one visible product, so an empty tab never shows up. Category
--    names are business-facing labels; nothing else from `categories` leaves.
--
-- Everything else in the function is unchanged.

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
      where sv.user_id = s.user_id and coalesce(sv.status, 'active') = 'active' and (public.site_catalog_ids(s.published_config, 'serviceCategoryIds') is null or sv.category_id = any(public.site_catalog_ids(s.published_config, 'serviceCategoryIds')))
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
    -- `photo_url` es lo ÚNICO nuevo que sale de `staff`: el teléfono, el correo
    -- y la comisión siguen sin cruzar la frontera, que es el contrato de esta
    -- proyección. La foto la sube el dueño para mostrarla.
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
