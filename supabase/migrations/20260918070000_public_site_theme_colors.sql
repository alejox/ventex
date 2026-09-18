-- Allow each business to customize the visual colors of its public template.
-- The application accepts only six-digit hex colors; this constraint keeps
-- arbitrary CSS out of the public projection even if a client is bypassed.

alter table public.business_sites
  add column if not exists theme_colors jsonb not null default '{}'::jsonb;

alter table public.business_sites drop constraint if exists business_sites_theme_colors_valid;
alter table public.business_sites add constraint business_sites_theme_colors_valid
  check (
    jsonb_typeof(theme_colors) = 'object'
    and (not (theme_colors ? 'bg') or theme_colors ->> 'bg' ~ '^#[0-9A-Fa-f]{6}$')
    and (not (theme_colors ? 'surface') or theme_colors ->> 'surface' ~ '^#[0-9A-Fa-f]{6}$')
    and (not (theme_colors ? 'accent') or theme_colors ->> 'accent' ~ '^#[0-9A-Fa-f]{6}$')
    and (not (theme_colors ? 'text') or theme_colors ->> 'text' ~ '^#[0-9A-Fa-f]{6}$')
    and (not (theme_colors ? 'muted') or theme_colors ->> 'muted' ~ '^#[0-9A-Fa-f]{6}$')
    and (not (theme_colors ? 'border') or theme_colors ->> 'border' ~ '^#[0-9A-Fa-f]{6}$')
  );

comment on column public.business_sites.theme_colors is
  'Optional six-digit hex overrides for the public template color tokens.';

create or replace function public.site_public_projection(p_user_id uuid)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'slug', s.slug, 'template', s.template, 'themeColors', coalesce(s.theme_colors, '{}'::jsonb),
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
