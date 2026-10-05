-- Expose only the clock preference, read live from settings for both projections.
-- No new columns, tenant policies, or client-side privileged access.
BEGIN;

create or replace function public.site_public_projection(p_user_id uuid)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'slug', s.slug, 'template', s.template, 'themeColors', coalesce(s.theme_colors, '{}'::jsonb),
    'businessName', coalesce(nullif(btrim(p.business_name), ''), 'Mi negocio'),
    'businessType', p.business_type, 'headline', s.headline, 'about', s.about,
    'heroImageUrl', s.hero_image_url,
    'heroFocusX', s.hero_focus_x, 'heroFocusY', s.hero_focus_y, 'heroOverlay', s.hero_overlay,
    'timeFormat', case when st.business_profile ->> 'timeFormat' = '24' then '24' else '12' end,
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
    'timeFormat', case when st.business_profile ->> 'timeFormat' = '24' then '24' else '12' end,
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

revoke all on function public.site_public_projection(uuid) from public, anon, authenticated;
revoke all on function public.public_site_by_slug(text) from public;
grant execute on function public.public_site_by_slug(text) to anon, authenticated;
COMMIT;
