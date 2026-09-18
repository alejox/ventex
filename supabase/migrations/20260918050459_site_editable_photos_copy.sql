-- El micrositio deja de tener partes fijas en el código.
--
-- Tres cosas pasan a ser del negocio: la foto de cada persona del equipo, la
-- nota del pie y los textos de cada sección.

-- ---------------------------------------------------------------------------
-- 1. Foto del empleado
-- ---------------------------------------------------------------------------
--
-- Va en `staff` y NO en `business_sites`, y la razón no es de comodidad: la
-- ficha de la persona es `public.staff`, y la foto es un atributo de la persona,
-- no del sitio web. Guardarla en el sitio obligaría a un arreglo de objetos
-- indexado por id de empleado, que se queda con huérfanos en cuanto alguien se
-- archiva y no tiene forma de expresar una FK. Además así la misma foto sirve
-- para el POS, las comisiones y la agenda sin volver a subirla.
alter table public.staff add column if not exists photo_url text;

comment on column public.staff.photo_url is
  'Foto de la persona. La sube el dueño desde /dashboard/staff y la publica el micrositio.';

-- Bucket propio y no `business-logos`: mezclar caras de personas con el logo del
-- negocio en el mismo lugar complica cualquier política o borrado posterior.
-- Público en lectura porque el micrositio es público; escritura solo del dueño,
-- igual que la policy de escritura de `staff`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-photos', 'staff-photos', true, 2097152,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

drop policy if exists staff_photos_public_read on storage.objects;
create policy staff_photos_public_read on storage.objects
  for select using (bucket_id = 'staff-photos');

drop policy if exists staff_photos_insert_own on storage.objects;
create policy staff_photos_insert_own on storage.objects
  for insert with check (
    public.is_tenant_owner()
    and bucket_id = 'staff-photos'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

drop policy if exists staff_photos_update_own on storage.objects;
create policy staff_photos_update_own on storage.objects
  for update using (
    public.is_tenant_owner()
    and bucket_id = 'staff-photos'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  ) with check (
    public.is_tenant_owner()
    and bucket_id = 'staff-photos'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

drop policy if exists staff_photos_delete_own on storage.objects;
create policy staff_photos_delete_own on storage.objects
  for delete using (
    public.is_tenant_owner()
    and bucket_id = 'staff-photos'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

-- ---------------------------------------------------------------------------
-- 2. Nota del pie y textos de sección
-- ---------------------------------------------------------------------------
alter table public.business_sites add column if not exists footer_note text;

-- Los textos van en UN jsonb y no en veinte columnas. Cada plantilla usa un
-- subconjunto distinto de secciones, así que una columna por frase dejaría la
-- tabla llena de campos que la mayoría de los negocios nunca toca — y cada
-- sección nueva sería otra migración.
--
-- El tope de tamaño no es paranoia: esto viaja en la respuesta pública de CADA
-- visita al micrositio, así que sin límite un pegado accidental de mil líneas
-- se lo cobra el visitante en datos.
alter table public.business_sites add column if not exists site_copy jsonb not null default '{}'::jsonb;

alter table public.business_sites drop constraint if exists business_sites_site_copy_size;
alter table public.business_sites add constraint business_sites_site_copy_size
  check (pg_column_size(site_copy) <= 4096);

alter table public.business_sites drop constraint if exists business_sites_footer_note_len;
alter table public.business_sites add constraint business_sites_footer_note_len
  check (footer_note is null or char_length(footer_note) <= 300);

-- ---------------------------------------------------------------------------
-- 3. La proyección pública expone lo nuevo
-- ---------------------------------------------------------------------------
-- Cuerpo completo en 20260918035924_site_owner_preview.sql; acá solo se agregan
-- `footerNote`, `copy` y el `photoUrl` de cada persona del equipo.
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
