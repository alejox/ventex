-- Redes sociales del micrositio público.
--
-- Cada columna guarda lo que el dueño escribió TAL CUAL (un @usuario, una URL
-- completa o sólo el nombre de usuario). Normalizar a URL es trabajo de la UI
-- (`lib/socialLinks.ts`), no de la base: así el dueño ve en el formulario lo
-- mismo que escribió y cambiar la forma del enlace no obliga a migrar datos.
--
-- Los permisos de columna NO hacen falta acá: `business_sites` tiene un grant a
-- nivel de TABLA (`grant select, insert, update, delete ... to authenticated`),
-- que sí cubre las columnas nuevas — verificado: la tabla no tiene ningún ACL
-- por columna (`pg_attribute.attacl` vacío). Si alguna vez se agrega uno, estas
-- columnas quedarían sin permiso y PostgREST respondería "permission denied"
-- pareciendo un problema de RLS.

alter table public.business_sites
  add column if not exists facebook text,
  add column if not exists tiktok   text,
  add column if not exists youtube  text,
  add column if not exists twitter  text,
  add column if not exists linkedin text,
  add column if not exists telegram text,
  add column if not exists website  text;

-- ---------------------------------------------------------------------------
-- El payload público agrega las redes. Sigue eligiendo columna por columna: lo
-- que no está acá, el sitio público no lo puede mostrar.
-- ---------------------------------------------------------------------------

create or replace function public.public_site_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
    -- Deliberately NOT selected: purchase_price, commission_*, distributor_id,
    -- minimum_stock, barcode. Those are the tenant's business, not the public's.
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
        and pr.parent_product_id is null
    ),
    -- Deliberately NOT selected: email, phone, pos_pin_hash, permissions,
    -- username, is_admin.
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
$$;
