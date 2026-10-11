-- Instagram account connection (Instagram API with Instagram Login).
--
-- One row per tenant. The owner connects their professional account once; a
-- daily cron (`/api/instagram/sync`) refreshes the long-lived token and caches
-- the latest post permalinks, which the public site renders with embed.js.
--
-- Security model:
-- * `access_token` is NEVER readable by `anon` or `authenticated`. Every write
--   happens server-side with the service-role client (route handlers), and the
--   browser only gets column-level SELECT on the status columns.
-- * The public site reads ONLY the cached permalinks, through a SECURITY
--   DEFINER function that resolves a PUBLISHED site by slug — the same filter
--   as `public_site_by_slug`.
-- * Tenancy keys off `get_effective_user_id()`, never bare `auth.uid()`.
BEGIN;

create table if not exists public.instagram_connections (
  user_id uuid primary key default public.get_effective_user_id()
    references auth.users (id) on delete cascade,
  ig_user_id text not null,
  username text,
  access_token text not null,
  token_expires_at timestamptz not null,
  token_refreshed_at timestamptz not null default now(),
  media_permalinks text[] not null default '{}',
  media_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.instagram_connections is
  'Connected Instagram professional account per tenant. access_token is service-role only.';

drop trigger if exists instagram_connections_touch_updated_at on public.instagram_connections;
create trigger instagram_connections_touch_updated_at
  before update on public.instagram_connections
  for each row execute function public.touch_updated_at();

alter table public.instagram_connections enable row level security;

-- Start from nothing, then grant only the status columns.
revoke all on table public.instagram_connections from public, anon, authenticated;
grant select (
  user_id, username, token_expires_at, media_permalinks, media_synced_at,
  last_error, created_at, updated_at
) on table public.instagram_connections to authenticated;
grant all on table public.instagram_connections to service_role;

drop policy if exists instagram_connections_tenant_read on public.instagram_connections;
create policy instagram_connections_tenant_read
  on public.instagram_connections
  for select
  to authenticated
  using (user_id = public.get_effective_user_id());

-- Disconnect: owner (or workspace admin) only, removes the tenant's row and
-- with it the token. Revoking the app on Instagram's side stays the owner's call.
create or replace function public.disconnect_instagram()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_tenant_owner() then
    raise exception 'Solo el dueño del negocio puede desconectar Instagram.'
      using errcode = '42501';
  end if;

  delete from public.instagram_connections
  where user_id = public.get_effective_user_id();
end;
$$;

revoke all on function public.disconnect_instagram() from public, anon;
grant execute on function public.disconnect_instagram() to authenticated;

-- Public read: cached permalinks of the tenant behind a PUBLISHED site.
create or replace function public.public_instagram_permalinks(p_slug text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select c.media_permalinks
    from public.business_sites s
    join public.instagram_connections c on c.user_id = s.user_id
    where s.slug = lower(btrim(p_slug))
      and s.published
      and s.published_config is not null
    limit 1
  ), '{}'::text[]);
$$;

revoke all on function public.public_instagram_permalinks(text) from public;
grant execute on function public.public_instagram_permalinks(text) to anon, authenticated;

COMMIT;
