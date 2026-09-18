-- El dueño ajusta su propia foto de encabezado.
--
-- Cuando el hero usaba la foto de referencia, el encuadre y el oscurecido los
-- elegía la plantilla: estaban afinados para ESA foto. En cuanto el negocio sube
-- la suya eso deja de valer — el sujeto puede estar a la derecha, el fondo puede
-- ser muy claro justo donde va el titular, y el recorte centrado le puede
-- cortar la cara a alguien.
--
-- Dos controles, que son exactamente las dos decisiones que hay que tomar:
--
-- `hero_focus_x/y`: qué punto de la foto NUNCA se recorta. Es `object-position`
--   en porcentaje. Con una foto apaisada en un panel alto se recorta a lo
--   ancho, y con una vertical a lo alto: un solo punto cubre los dos casos.
--
-- `hero_overlay`: cuánto oscurecer DE MÁS, encima de lo que ya hace la
--   plantilla. Arranca en 0, así que ningún sitio publicado cambia de aspecto
--   con esta migración. Solo suma: no se puede aclarar por debajo de lo que la
--   plantilla necesita para que su texto se lea, porque ese piso no es
--   estético, es de contraste.

alter table public.business_sites
  add column if not exists hero_focus_x smallint not null default 50,
  add column if not exists hero_focus_y smallint not null default 50,
  add column if not exists hero_overlay smallint not null default 0;

alter table public.business_sites drop constraint if exists business_sites_hero_focus_range;
alter table public.business_sites add constraint business_sites_hero_focus_range
  check (hero_focus_x between 0 and 100 and hero_focus_y between 0 and 100);

-- Tope en 70 y no en 100: con la foto totalmente negra el hero deja de ser una
-- foto y el dueño estaría eligiendo un rectángulo oscuro sin saberlo.
alter table public.business_sites drop constraint if exists business_sites_hero_overlay_range;
alter table public.business_sites add constraint business_sites_hero_overlay_range
  check (hero_overlay between 0 and 70);

comment on column public.business_sites.hero_focus_x is
  'Punto focal horizontal de la foto del hero, 0-100. Es object-position.';
comment on column public.business_sites.hero_overlay is
  'Oscurecido EXTRA sobre el que ya aplica la plantilla, 0-70. Solo suma.';

-- La proyección pública expone los tres. El cuerpo completo está en
-- 20260918053239_services_image_url.sql.
create or replace function public.site_public_projection(p_user_id uuid)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'slug', s.slug, 'template', s.template,
    'businessName', coalesce(nullif(btrim(p.business_name), ''), 'Mi negocio'),
    'businessType', p.business_type, 'headline', s.headline, 'about', s.about,
    'heroImageUrl', s.hero_image_url,
    'heroFocusX', s.hero_focus_x, 'heroFocusY', s.hero_focus_y, 'heroOverlay', s.hero_overlay,
    'logoUrl', st.business_profile ->> 'logoUrl',
    'whatsapp', s.whatsapp, 'address', s.address,
    'instagram', s.instagram, 'facebook', s.facebook, 'tiktok', s.tiktok,
    'youtube', s.youtube, 'twitter', s.twitter, 'linkedin', s.linkedin,
    'telegram', s.telegram, 'website', s.website,
    'bookingEnabled', s.booking_enabled, 'timezone', s.timezone,
    'footerNote', s.footer_note, 'copy', coalesce(s.site_copy, '{}'::jsonb),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('weekday', h.weekday, 'isOpen', h.is_open,
        'opensAt', to_char(h.opens_at,'HH24:MI'), 'closesAt', to_char(h.closes_at,'HH24:MI'))
        order by h.weekday), '[]'::jsonb) from public.business_hours h where h.user_id = s.user_id),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name,
        'description', sv.description, 'price', sv.price,
        'durationMinutes', coalesce(sv.duration_minutes, 30), 'icon', sv.icon, 'imageUrl', sv.image_url)
        order by sv.name), '[]'::jsonb) from public.services sv
        where sv.user_id = s.user_id and coalesce(sv.status,'active') = 'active'),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name,
        'price', pr.price, 'imageUrl', pr.image_url, 'icon', pr.icon, 'unit', pr.unit,
        'inStock', coalesce(pr.stock_level,0) > 0) order by pr.name), '[]'::jsonb)
        from public.products pr where pr.user_id = s.user_id and coalesce(pr.status,'active') = 'active'),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', stf.id, 'fullName', stf.full_name,
        'role', stf.role, 'photoUrl', stf.photo_url) order by stf.full_name), '[]'::jsonb)
        from public.staff stf where stf.user_id = s.user_id
        and coalesce(stf.is_active,true) and coalesce(stf.status,'active') = 'active')
  )
  from public.business_sites s
  join public.profiles p on p.id = s.user_id
  left join public.settings st on st.user_id = s.user_id
  where s.user_id = p_user_id;
$$;

revoke all on function public.site_public_projection(uuid) from public, anon, authenticated;
