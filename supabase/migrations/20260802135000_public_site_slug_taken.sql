-- Slug availability check for the owner's configuration screen.
--
-- It cannot be a plain SELECT from the client: business_sites RLS only lets a
-- tenant see its OWN row, so an unpublished slug owned by somebody else would
-- look free and then fail against the unique index. And public_site_by_slug()
-- is no substitute either — it filters on `published`.
--
-- Returns a bare boolean and nothing else, so it leaks no information about who
-- owns the slug or what their site looks like.
create or replace function public.public_site_slug_taken(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.business_sites
     where slug = lower(btrim(p_slug))
  );
$$;

revoke all on function public.public_site_slug_taken(text) from public;
grant execute on function public.public_site_slug_taken(text) to anon, authenticated;
