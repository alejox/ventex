-- Remove the product variant / parent concept entirely.
-- Variants become standalone products (their full name "PARENT - LABEL" is kept
-- because historical sales reference it). Parent containers are deleted, and
-- the columns + index are dropped.
--
-- The products_guard_edit trigger blocks non-stock UPDATEs unless the caller
-- has inventory_edit (it relies on auth context, absent in this migration run),
-- so it is dropped and recreated inside the same transaction.

BEGIN;

-- 0) Bypass the auth-dependent edit guard for this data migration.
DROP TRIGGER IF EXISTS products_guard_edit ON public.products;

-- 1) Capture parent ids BEFORE unlinking (needed to delete them afterwards).
CREATE TEMP TABLE _parent_products ON COMMIT DROP AS
  SELECT DISTINCT parent_product_id AS id
  FROM public.products
  WHERE parent_product_id IS NOT NULL;

-- 2) One parent ("MEMORIA USB") has a historical sale. sale_items snapshots
--    product_name/sku/unit_price at sale time, so history survives intact:
--    only the product link is cleared so the parent row can be deleted.
UPDATE public.sale_items si
SET product_id = NULL
WHERE si.product_id IN (SELECT id FROM _parent_products);

-- 3) Promote variants to standalone products.
UPDATE public.products
SET parent_product_id = NULL,
    variant_label = NULL
WHERE parent_product_id IS NOT NULL;

-- 4) Delete parent container products (stock/price already zeroed).
DELETE FROM public.products
WHERE id IN (SELECT id FROM _parent_products);

-- 5) public_site_by_slug no longer needs to exclude parents: the concept is gone.
CREATE OR REPLACE FUNCTION public.public_site_by_slug(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'slug',            s.slug,
    'template',        s.template,
    'businessName',    coalesce(nullif(btrim(p.business_name), ''), 'Mi negocio'),
    'businessType',    p.business_type,
    'headline',        s.headline,
    'about',           s.about,
    'heroImageUrl',    s.hero_image_url,
    'logoUrl',         st.business_profile ->> 'logoUrl',
    'whatsapp',        s.whatsapp,
    'address',         s.address,
    'instagram',       s.instagram,
    'facebook',        s.facebook,
    'tiktok',          s.tiktok,
    'youtube',         s.youtube,
    'twitter',         s.twitter,
    'linkedin',        s.linkedin,
    'telegram',        s.telegram,
    'website',         s.website,
    'bookingEnabled',  s.booking_enabled,
    'timezone',        s.timezone,
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'weekday',  h.weekday,
               'isOpen',   h.is_open,
               'opensAt',  to_char(h.opens_at,  'HH24:MI'),
               'closesAt', to_char(h.closes_at, 'HH24:MI')
             ) order by h.weekday), '[]'::jsonb)
      from public.business_hours h
      where h.user_id = s.user_id
    ),
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',              sv.id,
               'name',            sv.name,
               'description',     sv.description,
               'price',           sv.price,
               'durationMinutes', coalesce(sv.duration_minutes, 30),
               'icon',            sv.icon
             ) order by sv.name), '[]'::jsonb)
      from public.services sv
      where sv.user_id = s.user_id
        and coalesce(sv.status, 'active') = 'active'
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',       pr.id,
               'name',     pr.name,
               'price',    pr.price,
               'imageUrl', pr.image_url,
               'icon',     pr.icon,
               'unit',     pr.unit,
               'inStock',  coalesce(pr.stock_level, 0) > 0
             ) order by pr.name), '[]'::jsonb)
      from public.products pr
      where pr.user_id = s.user_id
        and coalesce(pr.status, 'active') = 'active'
    ),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',       stf.id,
               'fullName', stf.full_name,
               'role',     stf.role
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
    and s.published;
$function$;

-- 6) Drop the now-unused columns and index.
DROP INDEX IF EXISTS public.products_parent_product_id_idx;
ALTER TABLE public.products DROP COLUMN IF EXISTS parent_product_id;
ALTER TABLE public.products DROP COLUMN IF EXISTS variant_label;

-- 7) Restore the edit guard exactly as it was.
CREATE TRIGGER products_guard_edit BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION products_guard_edit();

COMMIT;
