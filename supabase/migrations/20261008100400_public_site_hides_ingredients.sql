-- Recetas y producción (5/5): el sitio público no muestra insumos.
--
-- * Un producto "Solo insumo" (products.is_ingredient) no se vende: fuera del
--   catálogo público, igual que del POS.
-- * inStock: un producto que no controla stock (tracks_stock = false; entre
--   ellos los que tienen receta de venta, cuyo stock está en sus insumos)
--   aparecía como AGOTADO porque su stock_level queda en 0. Ahora está
--   disponible; solo el que controla stock depende de stock_level > 0.

CREATE OR REPLACE FUNCTION public.site_public_projection(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        'inStock', (not coalesce(pr.tracks_stock, true)) or coalesce(pr.stock_level,0) > 0) order by pr.name), '[]'::jsonb)
        from public.products pr where pr.user_id = s.user_id and coalesce(pr.status,'active') = 'active'
        and not coalesce(pr.is_ingredient, false)),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', stf.id, 'fullName', stf.full_name,
        'role', stf.role, 'photoUrl', stf.photo_url) order by stf.full_name), '[]'::jsonb)
        from public.staff stf where stf.user_id = s.user_id and stf.show_on_website
        and coalesce(stf.is_active,true) and coalesce(stf.status,'active') = 'active')
  )
  from public.business_sites s
  join public.profiles p on p.id = s.user_id
  left join public.settings st on st.user_id = s.user_id
  where s.user_id = p_user_id;
$function$;
