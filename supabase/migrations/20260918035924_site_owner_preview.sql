-- Vista previa del micrositio para su propio dueño, incluso sin publicar.
--
-- El problema: el selector de Diseño obliga a elegir plantilla a ciegas, y el
-- único enlace al sitio aparece cuando `published` ya está en true. Es decir,
-- para ver cómo queda había que publicarlo — mostrárselo al mundo primero y
-- mirarlo después.
--
-- La proyección se EXTRAE a una función propia en vez de copiarla: dos copias
-- del mismo jsonb_build_object se desincronizan en el primer campo nuevo, y la
-- que se olvida es siempre la que nadie mira (la vista previa), así que el dueño
-- terminaría aprobando un diseño que no es el que se publica.

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
  where s.user_id = p_user_id;
$$;

-- Ayudante interno: nadie la llama desde PostgREST. Sin este REVOKE, cualquier
-- visitante anónimo podría pedir la proyección de un inquilino arbitrario
-- pasando su uuid — saltándose el filtro de `published`, que es justamente lo
-- que las dos funciones de abajo existen para aplicar.
revoke all on function public.site_public_projection(uuid) from public, anon, authenticated;

create or replace function public.public_site_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.site_public_projection(s.user_id)
  from public.business_sites s
  where s.slug = lower(btrim(p_slug))
    and s.published;
$$;

grant execute on function public.public_site_by_slug(text) to anon, authenticated;

-- Borrador del inquilino que está autenticado. No recibe slug a propósito: si lo
-- recibiera sería un parámetro que alguien podría cambiar, y la única respuesta
-- correcta es siempre la del propio negocio. `business_sites` tiene UNIQUE
-- (user_id), así que el inquilino identifica una sola fila.
--
-- get_effective_user_id() y no auth.uid(): un trabajador tiene su propia cuenta
-- pero el sitio es del dueño (ver AGENTS.md, Tenancy).
create or replace function public.own_site_preview()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.site_public_projection(s.user_id)
  from public.business_sites s
  where s.user_id = public.get_effective_user_id();
$$;

revoke all on function public.own_site_preview() from public, anon;
grant execute on function public.own_site_preview() to authenticated;

comment on function public.own_site_preview() is
  'Proyección pública del micrositio del inquilino autenticado, ignorando `published`, para la vista previa del dueño.';
