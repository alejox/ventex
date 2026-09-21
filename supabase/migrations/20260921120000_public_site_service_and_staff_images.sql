-- El sitio publicado no mostraba la foto del servicio ni la del profesional.
--
-- No era la plantilla: `SiteSections.tsx` ya renderiza `service.imageUrl` y
-- `member.photoUrl`, y `.site-service-image` / `.site-team-avatar` existen en
-- `templates.module.css`. Lo que faltaba era el dato.
--
-- `site_public_projection()` —la que alimenta la vista previa del dueño— sí los
-- proyecta. Cuando `20260919141212_business_site_draft_publication.sql` reescribió
-- `public_site_by_slug()` para leer del snapshot `published_config`, rearmó la
-- proyección a mano y en ese pase se cayeron `services.image_url` y
-- `staff.photo_url`. De ahí que la vista previa mostrara las fotos y el sitio
-- publicado no: dos proyecciones del mismo sitio que dejaron de coincidir.
--
-- `products` ya mandaba `imageUrl`; esto deja a las tres listas parejas.
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
               'icon', sv.icon, 'imageUrl', sv.image_url
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
    -- `photo_url` es lo ÚNICO nuevo que sale de `staff`: el teléfono, el correo
    -- y la comisión siguen sin cruzar la frontera, que es el contrato de esta
    -- proyección. La foto la sube el dueño para mostrarla.
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', stf.id, 'fullName', stf.full_name, 'role', stf.role,
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
  where s.slug = lower(btrim(p_slug))
    and s.published
    and s.published_config is not null;
$$;

-- Recrear la función devuelve EXECUTE a PUBLIC: hay que volver a cerrarlo.
revoke all on function public.public_site_by_slug(text) from public;
grant execute on function public.public_site_by_slug(text) to anon, authenticated;
