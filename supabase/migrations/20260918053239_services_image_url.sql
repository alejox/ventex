-- Los servicios también llevan foto.
--
-- Hasta acá solo los productos tenían imagen, y en el micrositio un servicio se
-- dibujaba con un emoji o con las iniciales. Para una barbería el servicio ES el
-- producto: "Corte y barba" vende mucho más con una foto que con una tijera
-- dibujada.

alter table public.services add column if not exists image_url text;

comment on column public.services.image_url is
  'Foto del servicio. Comparte el bucket `product-images` con los productos: las dos son imágenes de catálogo.';

-- El bucket se comparte, pero la policy NO servía tal cual: exigía
-- `worker_can('inventory_edit')`, mientras que escribir en `services` pide
-- `worker_can('services')`. Son permisos distintos a propósito —las dos mitades
-- del catálogo se administran por separado—, así que quien puede editar un
-- servicio no podía subirle la foto. Ahora alcanza con cualquiera de los dos.
drop policy if exists product_images_insert_own on storage.objects;
create policy product_images_insert_own on storage.objects
  for insert with check (
    public.get_effective_user_id() is not null
    and (public.worker_can('inventory_edit') or public.worker_can('services'))
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

drop policy if exists product_images_update_own on storage.objects;
create policy product_images_update_own on storage.objects
  for update using (
    public.get_effective_user_id() is not null
    and (public.worker_can('inventory_edit') or public.worker_can('services'))
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  ) with check (
    public.get_effective_user_id() is not null
    and (public.worker_can('inventory_edit') or public.worker_can('services'))
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

drop policy if exists product_images_delete_own on storage.objects;
create policy product_images_delete_own on storage.objects
  for delete using (
    public.get_effective_user_id() is not null
    and (public.worker_can('inventory_edit') or public.worker_can('services'))
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

-- La proyección pública expone la foto del servicio. El cuerpo completo está en
-- 20260918050459_site_editable_photos_copy.sql; acá solo se agrega `imageUrl`
-- dentro de cada servicio, de ahí que la función se recree entera.
create or replace function public.site_public_projection(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
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
    'footerNote',      s.footer_note,
    'copy',            coalesce(s.site_copy, '{}'::jsonb),
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
               'icon',            sv.icon,
               'imageUrl',        sv.image_url
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
               'role',     stf.role,
               'photoUrl', stf.photo_url
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
  where s.user_id = p_user_id;
$$;

revoke all on function public.site_public_projection(uuid) from public, anon, authenticated;
