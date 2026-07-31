-- Employee access is independent from employment status (`staff.status`).
-- Privileged lifecycle fields remain service-role-only: this migration does
-- not grant authenticated/anon UPDATE on any of them.

alter table public.profiles
  add column if not exists worker_access_status text,
  add column if not exists worker_invited_at timestamptz,
  add column if not exists worker_activated_at timestamptz,
  add column if not exists worker_suspended_at timestamptz;

update public.profiles
set worker_access_status = case when is_worker then 'active' else null end
where worker_access_status is null;

alter table public.profiles
  drop constraint if exists profiles_worker_access_status_check;

alter table public.profiles
  add constraint profiles_worker_access_status_check
  check (
    (
      is_worker = true
      and worker_access_status is not null
      and worker_access_status in ('pending', 'active', 'suspended')
    )
    or (coalesce(is_worker, false) = false and worker_access_status is null)
  );

create index if not exists profiles_worker_access_status_idx
  on public.profiles (workspace_id, worker_access_status)
  where is_worker = true;

-- Defense in depth for authenticated profile updates. Service-role requests do
-- not carry auth.uid(), so server-only administration remains possible.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.is_super_admin is distinct from old.is_super_admin
      or new.is_reseller is distinct from old.is_reseller
      or new.is_worker is distinct from old.is_worker
      or new.owner_id is distinct from old.owner_id
      or new.reseller_id is distinct from old.reseller_id
      or new.workspace_id is distinct from old.workspace_id
      or new.worker_username is distinct from old.worker_username
      or new.worker_role is distinct from old.worker_role
      or new.worker_access_status is distinct from old.worker_access_status
      or new.worker_invited_at is distinct from old.worker_invited_at
      or new.worker_activated_at is distinct from old.worker_activated_at
      or new.worker_suspended_at is distinct from old.worker_suspended_at
    then
      raise exception 'No puedes modificar privilegios del perfil'
        using errcode = '42501';
    end if;

    if old.id = auth.uid()
      and (
        new.worker_permissions is distinct from old.worker_permissions
        or new.staff_id is distinct from old.staff_id
      )
    then
      raise exception 'No puedes modificar tus propios permisos'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Replay-safe privilege normalization. Revoke table-level and historical
-- column-level grants before restoring only the established client allowlist.
revoke all privileges on table public.profiles from anon, authenticated;
do $$
declare
  column_name text;
begin
  for column_name in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I) on public.profiles from anon, authenticated',
      column_name
    );
  end loop;
end;
$$;

grant select (
  business_key
) on public.profiles to authenticated;

grant update (
  full_name,
  business_type,
  modules,
  business_name,
  business_key
) on public.profiles to authenticated;

grant all privileges on table public.profiles to service_role;

-- Privileged profile fields are never directly selectable by authenticated
-- clients. This fixed, current-user-only projection is the single read seam.
create or replace function public.current_user_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'business_type', p.business_type,
    'modules', p.modules,
    'is_super_admin', p.is_super_admin,
    'is_reseller', p.is_reseller,
    'is_worker', p.is_worker,
    'worker_access_status', p.worker_access_status,
    'workspace_id', p.workspace_id,
    'staff_id', p.staff_id,
    'worker_permissions', p.worker_permissions
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke execute on function public.current_user_profile() from public, anon;
grant execute on function public.current_user_profile() to authenticated, service_role;

-- An authenticated worker only receives a tenant identity while active.
-- Existing JWTs therefore lose all business-data authority immediately after
-- suspension, independently of Supabase Auth session/ban propagation.
create or replace function public.get_effective_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.is_worker = true and p.worker_access_status = 'active'
      then p.workspace_id
    when coalesce(p.is_worker, false) = false
      then auth.uid()
    else null
  end
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke execute on function public.get_effective_user_id() from public, anon;
grant execute on function public.get_effective_user_id() to authenticated;

-- Some newer policies call these aliases instead of get_effective_user_id().
-- Point every tenancy authority at the same lifecycle-aware decision.
create or replace function public.current_tenant()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select public.get_effective_user_id();
$$;

create or replace function public.is_tenant_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null
    and auth.uid() = public.get_effective_user_id();
$$;

revoke execute on function public.current_tenant() from public, anon;
grant execute on function public.current_tenant() to authenticated;
revoke execute on function public.is_tenant_owner() from public, anon;
grant execute on function public.is_tenant_owner() to authenticated;

-- Inactive workers may read their own lifecycle state so the application can
-- explain the block, but they cannot mutate even the otherwise-safe profile
-- columns through a stale authenticated session.
drop policy if exists "profiles_owner" on public.profiles;
drop policy if exists profiles_select_self_or_owner on public.profiles;
drop policy if exists profiles_update_owner_or_active_self on public.profiles;

create policy profiles_select_self_or_owner on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (is_worker = true and workspace_id = (select auth.uid()))
  );

create policy profiles_update_owner_or_active_self on public.profiles
  for update to authenticated
  using (
    (
      id = (select auth.uid())
      and (
        coalesce(is_worker, false) = false
        or worker_access_status = 'active'
      )
    )
    or (
      is_worker = true
      and workspace_id = (select auth.uid())
      and (select auth.uid()) = public.get_effective_user_id()
    )
  )
  with check (
    (
      id = (select auth.uid())
      and (
        coalesce(is_worker, false) = false
        or worker_access_status = 'active'
      )
    )
    or (
      is_worker = true
      and workspace_id = (select auth.uid())
      and (select auth.uid()) = public.get_effective_user_id()
    )
  );

-- Direct worker_id checks must not outlive lifecycle revocation. Owners retain
-- authority over every shift in their tenant; active workers retain only their
-- own shift.
drop policy if exists shifts_update_own_or_owner on public.shifts;
create policy shifts_update_own_or_owner on public.shifts
  for update to authenticated
  using (
    public.get_effective_user_id() is not null
    and user_id = public.get_effective_user_id()
    and (
      worker_id = (select auth.uid())
      or (select auth.uid()) = public.get_effective_user_id()
    )
  )
  with check (
    public.get_effective_user_id() is not null
    and user_id = public.get_effective_user_id()
    and (
      worker_id = (select auth.uid())
      or (select auth.uid()) = public.get_effective_user_id()
    )
  );

-- Storage was the other direct auth.uid() mutation shortcut. Keep the existing
-- per-user folder model, but require an active lifecycle-derived tenant.
drop policy if exists "product_images_insert_own" on storage.objects;
create policy "product_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    public.get_effective_user_id() is not null
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "product_images_update_own" on storage.objects;
create policy "product_images_update_own" on storage.objects
  for update to authenticated
  using (
    public.get_effective_user_id() is not null
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    public.get_effective_user_id() is not null
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "product_images_delete_own" on storage.objects;
create policy "product_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    public.get_effective_user_id() is not null
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Normalize every mutation policy that targets business logos, regardless of
-- its historical name. SELECT policies are deliberately untouched because the
-- bucket's public-read behavior is part of the product contract.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and (
        coalesce(qual, '') like '%business-logos%'
        or coalesce(with_check, '') like '%business-logos%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end;
$$;

create policy "business_logos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    public.get_effective_user_id() is not null
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "business_logos_update_own" on storage.objects
  for update to authenticated
  using (
    public.get_effective_user_id() is not null
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    public.get_effective_user_id() is not null
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "business_logos_delete_own" on storage.objects
  for delete to authenticated
  using (
    public.get_effective_user_id() is not null
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Keep the legacy RPC name safe for old clients: suspension preserves the
-- worker identity, workspace, staff link, role, permissions, and history.
create or replace function public.deactivate_worker(p_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set worker_access_status = 'suspended',
      worker_suspended_at = now()
  where id = p_worker_id
    and is_worker = true
    and worker_access_status = 'active'
    and workspace_id = auth.uid();

  if not found then
    raise exception 'TRABAJADOR_NO_ENCONTRADO';
  end if;
end;
$$;

revoke execute on function public.deactivate_worker(uuid) from public, anon;
grant execute on function public.deactivate_worker(uuid) to authenticated;

-- Explicitly document the privilege boundary and protect against a future
-- broad grant accidentally exposing the lifecycle columns.
revoke update (
  worker_access_status,
  worker_invited_at,
  worker_activated_at,
  worker_suspended_at
) on public.profiles from anon, authenticated;

-- Username lookup is no longer part of the active login surface.
revoke execute on function public.worker_login(text, text) from public, anon, authenticated;
revoke execute on function public.staff_login(text, text) from public, anon, authenticated;
revoke execute on function public.staff_login_email(text, text) from public, anon, authenticated;

-- Fail closed if a replay or earlier grant leaves the profile boundary weaker
-- than intended. Lifecycle status is the only new client-readable column;
-- lifecycle timestamps remain server-only.
do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    or has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    or has_table_privilege('authenticated', 'public.profiles', 'DELETE')
  then
    raise exception 'profiles grant assertion failed: broad authenticated mutation remains';
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'business_key', 'UPDATE')
  then
    raise exception 'profiles grant assertion failed: safe update allowlist incomplete';
  end if;

  if has_column_privilege('authenticated', 'public.profiles', 'is_worker', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'is_super_admin', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'is_reseller', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'owner_id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'reseller_id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'workspace_id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_username', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_role', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'staff_id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_permissions', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_access_status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_invited_at', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_activated_at', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_suspended_at', 'UPDATE')
  then
    raise exception 'profiles grant assertion failed: privileged mutation exposed';
  end if;

  if has_column_privilege('authenticated', 'public.profiles', 'id', 'INSERT')
    or has_column_privilege('authenticated', 'public.profiles', 'full_name', 'INSERT')
  then
    raise exception 'profiles grant assertion failed: authenticated insert exposed';
  end if;

  if has_column_privilege('authenticated', 'public.profiles', 'is_super_admin', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'is_reseller', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'is_worker', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'owner_id', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'reseller_id', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'workspace_id', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_username', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_role', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'staff_id', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_permissions', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_access_status', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_invited_at', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_activated_at', 'SELECT')
    or has_column_privilege('authenticated', 'public.profiles', 'worker_suspended_at', 'SELECT')
  then
    raise exception 'profiles grant assertion failed: privileged direct read exposed';
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'business_key', 'SELECT')
    or has_column_privilege('anon', 'public.profiles', 'worker_access_status', 'SELECT')
  then
    raise exception 'profiles grant assertion failed: safe direct read model is invalid';
  end if;

  if not has_column_privilege('service_role', 'public.profiles', 'worker_access_status', 'UPDATE')
    or not has_column_privilege('service_role', 'public.profiles', 'worker_suspended_at', 'UPDATE')
  then
    raise exception 'profiles grant assertion failed: service_role lifecycle mutation missing';
  end if;

  if to_regprocedure('public.guard_profile_privileges()') is null
    or not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.profiles'::regclass
        and tgname = 'profiles_guard_privileges'
        and tgenabled <> 'D'
    )
  then
    raise exception 'profiles guard assertion failed: trigger missing or disabled';
  end if;

  if to_regprocedure('public.current_user_profile()') is null
    or not (
      select p.prosecdef
      from pg_proc p
      where p.oid = 'public.current_user_profile()'::regprocedure
    )
    or not exists (
      select 1
      from pg_proc p,
        unnest(coalesce(p.proconfig, array[]::text[])) config
      where p.oid = 'public.current_user_profile()'::regprocedure
        and config like 'search_path=%'
    )
    or position(
      'auth.uid()' in pg_get_functiondef('public.current_user_profile()'::regprocedure)
    ) = 0
    or position(
      'where p.id = auth.uid()' in lower(
        pg_get_functiondef('public.current_user_profile()'::regprocedure)
      )
    ) = 0
    or not has_function_privilege(
      'authenticated',
      'public.current_user_profile()',
      'EXECUTE'
    )
    or has_function_privilege('anon', 'public.current_user_profile()', 'EXECUTE')
  then
    raise exception 'current profile projection assertion failed';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_owner_or_active_self'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shifts'
      and policyname = 'shifts_update_own_or_owner'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_update_own'
  )
  then
    raise exception 'lifecycle policy assertion failed: guarded mutation policy missing';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'business_logos_insert_own',
        'business_logos_update_own',
        'business_logos_delete_own'
      )
  ) <> 3
    or exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and cmd in ('INSERT', 'UPDATE', 'DELETE')
        and (
          coalesce(qual, '') like '%business-logos%'
          or coalesce(with_check, '') like '%business-logos%'
        )
        and (
          coalesce(qual, '') || ' ' || coalesce(with_check, '')
        ) not like '%get_effective_user_id%'
    )
  then
    raise exception 'business logo policy assertion failed: lifecycle guard missing';
  end if;
end;
$$;
