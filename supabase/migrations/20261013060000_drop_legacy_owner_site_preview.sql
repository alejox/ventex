-- `own_site_preview` / `site_public_projection` built the owner preview from the
-- pre-`published_config` columns of `business_sites`. Nothing calls them: the
-- editor renders its preview client-side (`LandingPreview`) and the app-side
-- caller `fetchOwnSitePreview` had no callers. No other function references
-- them (checked against pg_proc before dropping).
drop function if exists public.own_site_preview();
drop function if exists public.site_public_projection(uuid);
