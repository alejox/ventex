-- Multi-business access model.
--
-- An Auth user is a global identity. Business authority lives in one
-- workspace_memberships row per workspace, and the active workspace is chosen
-- per JWT session. Existing business tables keep user_id = owner_user_id:
-- workspaces.id intentionally equals workspaces.owner_user_id.

create table public.workspaces (
  id uuid primary key references auth.users(id) on delete restrict,
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_id_is_owner check (id = owner_user_id)
);

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete restrict,
  staff_id uuid,
  invited_email text not null,
  member_kind text not null default 'member'
    check (member_kind in ('owner', 'member')),
  role text,
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'revoked')),
  provisional_auth_user boolean not null default false,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_memberships_email_normalized
    check (invited_email = lower(trim(invited_email)) and invited_email like '%@%'),
  constraint workspace_memberships_owner_shape
    check (
      (
        member_kind = 'owner'
        and auth_user_id = workspace_id
        and staff_id is null
        and status = 'active'
      )
      or (
        member_kind = 'member'
        and staff_id is not null
      )
    ),
  constraint workspace_memberships_lifecycle_shape
    check (
      (status = 'pending' and accepted_at is null and activated_at is null)
      or (status = 'active' and activated_at is not null)
      or status in ('suspended', 'revoked')
    )
);

create unique index workspace_memberships_workspace_auth_key
  on public.workspace_memberships (workspace_id, auth_user_id)
  where auth_user_id is not null;

create unique index workspace_memberships_workspace_email_key
  on public.workspace_memberships (workspace_id, invited_email);

create unique index workspace_memberships_workspace_staff_key
  on public.workspace_memberships (workspace_id, staff_id)
  where staff_id is not null;

create unique index workspace_memberships_identity_key
  on public.workspace_memberships (id, workspace_id, auth_user_id);

alter table public.workspace_memberships
  add constraint workspace_memberships_id_workspace_key
  unique (id, workspace_id);

alter table public.staff
  add constraint staff_id_user_id_key unique (id, user_id);

alter table public.workspace_memberships
  add constraint workspace_memberships_staff_workspace_fkey
  foreign key (staff_id, workspace_id)
  references public.staff(id, user_id)
  on delete restrict;

create table public.workspace_session_selections (
  session_id text primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  membership_id uuid not null,
  selected_at timestamptz not null default now(),
  constraint workspace_session_selections_membership_fkey
    foreign key (membership_id, workspace_id, auth_user_id)
    references public.workspace_memberships(id, workspace_id, auth_user_id)
    on delete cascade
);

create index workspace_session_selections_auth_user_idx
  on public.workspace_session_selections (auth_user_id);

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_session_selections enable row level security;

-- These authority tables have no direct client surface. All reads and writes
-- pass through fixed SECURITY DEFINER projections and validated RPCs.
revoke all on table public.workspaces from public, anon, authenticated;
revoke all on table public.workspace_memberships from public, anon, authenticated;
revoke all on table public.workspace_session_selections from public, anon, authenticated;
grant all on table public.workspaces to service_role;
grant all on table public.workspace_memberships to service_role;
grant all on table public.workspace_session_selections to service_role;

-- Owner businesses already use the owner's Auth id as every business table's
-- user_id. Preserve that key and create a uniform owner membership.
insert into public.workspaces (id, owner_user_id)
select p.id, p.id
from public.profiles p
where coalesce(p.is_worker, false) = false
  and (
    p.business_type is not null
    or exists (select 1 from public.settings s where s.user_id = p.id)
    or exists (select 1 from public.staff st where st.user_id = p.id)
    or exists (select 1 from public.sales sa where sa.user_id = p.id)
  )
on conflict (id) do nothing;

insert into public.workspace_memberships (
  workspace_id,
  auth_user_id,
  invited_email,
  member_kind,
  status,
  accepted_at,
  activated_at
)
select
  w.id,
  w.owner_user_id,
  lower(trim(u.email)),
  'owner',
  'active',
  coalesce(u.confirmed_at, now()),
  coalesce(u.confirmed_at, now())
from public.workspaces w
join auth.users u on u.id = w.owner_user_id
where u.email is not null
on conflict (workspace_id, invited_email) do nothing;

-- Compatibility backfill for installations that already had singular worker
-- columns. New authority never reads these profile fields.
insert into public.workspace_memberships (
  workspace_id,
  auth_user_id,
  staff_id,
  invited_email,
  member_kind,
  role,
  permissions,
  status,
  invited_at,
  accepted_at,
  activated_at,
  suspended_at
)
select
  p.workspace_id,
  p.id,
  p.staff_id,
  lower(trim(u.email)),
  'member',
  p.worker_role,
  coalesce(p.worker_permissions, '{}'::jsonb),
  case p.worker_access_status
    when 'pending' then 'pending'
    when 'suspended' then 'suspended'
    else 'active'
  end,
  coalesce(p.worker_invited_at, p.created_at, now()),
  case when p.worker_access_status = 'pending' then null else coalesce(u.confirmed_at, now()) end,
  case when p.worker_access_status = 'pending' then null else coalesce(p.worker_activated_at, u.confirmed_at, now()) end,
  p.worker_suspended_at
from public.profiles p
join auth.users u on u.id = p.id
join public.workspaces w on w.id = p.workspace_id
where p.is_worker = true
  and p.workspace_id is not null
  and p.staff_id is not null
  and u.email is not null
on conflict (workspace_id, invited_email) do nothing;

create or replace function public.ensure_owner_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
  if new.business_type is null or coalesce(new.is_worker, false) then
    return new;
  end if;

  select lower(trim(u.email)) into owner_email
  from auth.users u
  where u.id = new.id;

  if owner_email is null then
    raise exception 'OWNER_EMAIL_REQUIRED';
  end if;

  insert into public.workspaces (id, owner_user_id)
  values (new.id, new.id)
  on conflict (id) do nothing;

  insert into public.workspace_memberships (
    workspace_id,
    auth_user_id,
    invited_email,
    member_kind,
    status,
    accepted_at,
    activated_at
  )
  values (
    new.id,
    new.id,
    owner_email,
    'owner',
    'active',
    now(),
    now()
  )
  on conflict (workspace_id, invited_email) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_ensure_owner_workspace on public.profiles;
create trigger profiles_ensure_owner_workspace
  after insert or update of business_type on public.profiles
  for each row execute function public.ensure_owner_workspace();

revoke execute on function public.ensure_owner_workspace() from public, anon, authenticated;

create or replace function public.current_session_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'session_id', '');
$$;

revoke execute on function public.current_session_id() from public, anon;
grant execute on function public.current_session_id() to authenticated, service_role;

create or replace function public.get_active_membership_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.workspace_session_selections selection
  join public.workspace_memberships m
    on m.id = selection.membership_id
   and m.workspace_id = selection.workspace_id
   and m.auth_user_id = selection.auth_user_id
  where selection.session_id = public.current_session_id()
    and selection.auth_user_id = auth.uid()
    and m.status = 'active';
$$;

revoke execute on function public.get_active_membership_id() from public, anon;
grant execute on function public.get_active_membership_id() to authenticated, service_role;

create or replace function public.get_effective_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_session_selections selection
  join public.workspace_memberships m
    on m.id = selection.membership_id
   and m.workspace_id = selection.workspace_id
   and m.auth_user_id = selection.auth_user_id
  where selection.session_id = public.current_session_id()
    and selection.auth_user_id = auth.uid()
    and m.status = 'active';
$$;

revoke execute on function public.get_effective_user_id() from public, anon;
grant execute on function public.get_effective_user_id() to authenticated, service_role;

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
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships m
    where m.id = public.get_active_membership_id()
      and m.workspace_id = public.get_effective_user_id()
      and m.auth_user_id = auth.uid()
      and m.member_kind = 'owner'
      and m.status = 'active'
  );
$$;

revoke execute on function public.current_tenant() from public, anon;
grant execute on function public.current_tenant() to authenticated, service_role;
revoke execute on function public.is_tenant_owner() from public, anon;
grant execute on function public.is_tenant_owner() to authenticated, service_role;

create or replace function public.worker_can(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when m.member_kind = 'owner' then true
      else coalesce((m.permissions ->> perm)::boolean, false)
    end
    from public.workspace_memberships m
    where m.id = public.get_active_membership_id()
      and m.workspace_id = public.get_effective_user_id()
      and m.auth_user_id = auth.uid()
      and m.status = 'active'
  ), false);
$$;

revoke execute on function public.worker_can(text) from public, anon;
grant execute on function public.worker_can(text) to authenticated, service_role;

create or replace function public.select_active_workspace(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  jwt_session_id text := public.current_session_id();
  selected_membership public.workspace_memberships;
begin
  if caller is null or jwt_session_id is null then
    raise exception 'AUTH_SESSION_REQUIRED' using errcode = '42501';
  end if;

  select m.* into selected_membership
  from public.workspace_memberships m
  where m.workspace_id = p_workspace_id
    and m.auth_user_id = caller
    and m.status = 'active';

  if not found then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  insert into public.workspace_session_selections (
    session_id,
    auth_user_id,
    workspace_id,
    membership_id,
    selected_at
  )
  values (
    jwt_session_id,
    caller,
    selected_membership.workspace_id,
    selected_membership.id,
    now()
  )
  on conflict (session_id) do update
  set auth_user_id = excluded.auth_user_id,
      workspace_id = excluded.workspace_id,
      membership_id = excluded.membership_id,
      selected_at = excluded.selected_at;

  return jsonb_build_object(
    'workspace_id', selected_membership.workspace_id,
    'membership_id', selected_membership.id,
    'member_kind', selected_membership.member_kind
  );
end;
$$;

revoke execute on function public.select_active_workspace(uuid) from public, anon;
grant execute on function public.select_active_workspace(uuid) to authenticated, service_role;

create or replace function public.clear_active_workspace()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.workspace_session_selections
  where session_id = public.current_session_id()
    and auth_user_id = auth.uid();
$$;

revoke execute on function public.clear_active_workspace() from public, anon;
grant execute on function public.clear_active_workspace() to authenticated, service_role;

create or replace function public.workspace_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with memberships as (
    select
      m.id,
      m.workspace_id,
      m.member_kind,
      m.role,
      m.permissions,
      m.status,
      m.staff_id,
      m.invited_email,
      owner_profile.business_name,
      owner_profile.business_type,
      owner_profile.modules,
      selection.session_id is not null as is_selected
    from public.workspace_memberships m
    join public.profiles owner_profile on owner_profile.id = m.workspace_id
    left join public.workspace_session_selections selection
      on selection.session_id = public.current_session_id()
     and selection.auth_user_id = auth.uid()
     and selection.membership_id = m.id
    where m.auth_user_id = auth.uid()
  )
  select jsonb_build_object(
    'active', (
      select to_jsonb(membership_row)
      from memberships membership_row
      where membership_row.status = 'active'
        and membership_row.is_selected
      limit 1
    ),
    'available', coalesce((
      select jsonb_agg(to_jsonb(membership_row) order by membership_row.business_name)
      from memberships membership_row
      where membership_row.status = 'active'
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(to_jsonb(membership_row) order by membership_row.business_name)
      from memberships membership_row
      where membership_row.status = 'pending'
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.workspace_context() from public, anon;
grant execute on function public.workspace_context() to authenticated, service_role;

create or replace function public.current_user_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', identity_profile.id,
    'full_name', identity_profile.full_name,
    'business_type', coalesce(owner_profile.business_type, identity_profile.business_type),
    'modules', coalesce(owner_profile.modules, identity_profile.modules, '{}'::jsonb),
    'business_name', coalesce(owner_profile.business_name, identity_profile.business_name),
    'is_super_admin', identity_profile.is_super_admin,
    'is_reseller', identity_profile.is_reseller,
    'is_worker', active_membership.member_kind = 'member',
    'worker_access_status', active_membership.status,
    'workspace_id', active_membership.workspace_id,
    'membership_id', active_membership.id,
    'membership_kind', active_membership.member_kind,
    'staff_id', active_membership.staff_id,
    'worker_role', active_membership.role,
    'worker_permissions', coalesce(active_membership.permissions, '{}'::jsonb)
  )
  from public.profiles identity_profile
  left join public.workspace_memberships active_membership
    on active_membership.id = public.get_active_membership_id()
   and active_membership.auth_user_id = auth.uid()
   and active_membership.status = 'active'
  left join public.profiles owner_profile
    on owner_profile.id = active_membership.workspace_id
  where identity_profile.id = auth.uid();
$$;

revoke execute on function public.current_user_profile() from public, anon;
grant execute on function public.current_user_profile() to authenticated, service_role;

create or replace function public.accept_workspace_invitation(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  membership public.workspace_memberships;
  caller_email text;
begin
  if caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select lower(trim(u.email)) into caller_email
  from auth.users u
  where u.id = caller
    and u.email_confirmed_at is not null;

  if caller_email is null then
    raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode = '42501';
  end if;

  select m.* into membership
  from public.workspace_memberships m
  join auth.users u on u.id = caller
  where m.id = p_membership_id
    and m.status = 'pending'
    and (m.auth_user_id is null or m.auth_user_id = caller)
    and lower(trim(u.email)) = m.invited_email
  for update;

  if not found then
    raise exception 'INVITATION_NOT_AVAILABLE' using errcode = '42501';
  end if;

  update public.workspace_memberships m
  set auth_user_id = caller,
      status = 'active',
      provisional_auth_user = false,
      accepted_at = now(),
      activated_at = now(),
      suspended_at = null,
      revoked_at = null,
      updated_at = now()
  where m.id = p_membership_id
    and m.status = 'pending';

  return jsonb_build_object(
    'membership_id', membership.id,
    'workspace_id', membership.workspace_id,
    'status', 'active'
  );
end;
$$;

revoke execute on function public.accept_workspace_invitation(uuid) from public, anon;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated, service_role;

-- Exact normalized lookup uses GoTrue's unique email index. It is callable
-- only with service_role and never exposes auth.users to browser sessions.
create or replace function public.find_auth_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(trim(u.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke execute on function public.find_auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_by_email(text) to service_role;

-- The old singular profile fields remain temporarily for rollback/read
-- compatibility. No new authority function above depends on them.

-- A stale session selection never grants profile access. Direct profile reads
-- stay limited to the identity itself or the owner of the selected workspace.
drop policy if exists profiles_select_self_or_owner on public.profiles;
drop policy if exists profiles_update_owner_or_active_self on public.profiles;

create policy profiles_select_self_or_selected_owner on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      id = public.get_effective_user_id()
      and public.get_effective_user_id() is not null
    )
  );

create policy profiles_update_identity_or_selected_owner on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    and (
      public.get_effective_user_id() is not null
      or business_type is null
    )
  )
  with check (
    id = auth.uid()
    and (
      public.get_effective_user_id() is not null
      or business_type is null
    )
  );

-- Storage ownership follows the selected workspace folder. Auth identity
-- folders are unsafe when one identity works in multiple businesses.
drop policy if exists "product_images_insert_own" on storage.objects;
drop policy if exists "product_images_update_own" on storage.objects;
drop policy if exists "product_images_delete_own" on storage.objects;
drop policy if exists "business_logos_insert_own" on storage.objects;
drop policy if exists "business_logos_update_own" on storage.objects;
drop policy if exists "business_logos_delete_own" on storage.objects;

create policy "product_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    public.get_effective_user_id() is not null
    and public.worker_can('inventory_edit')
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "product_images_update_own" on storage.objects
  for update to authenticated
  using (
    public.get_effective_user_id() is not null
    and public.worker_can('inventory_edit')
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  )
  with check (
    public.get_effective_user_id() is not null
    and public.worker_can('inventory_edit')
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "product_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    public.get_effective_user_id() is not null
    and public.worker_can('inventory_edit')
    and bucket_id = 'product-images'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "business_logos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    public.is_tenant_owner()
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "business_logos_update_own" on storage.objects
  for update to authenticated
  using (
    public.is_tenant_owner()
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  )
  with check (
    public.is_tenant_owner()
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

create policy "business_logos_delete_own" on storage.objects
  for delete to authenticated
  using (
    public.is_tenant_owner()
    and bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = public.get_effective_user_id()::text
  );

-- Membership attribution is immutable operational history. Historical rows
-- are backfilled from their workspace + Auth actor where possible.
alter table public.shifts add column membership_id uuid;
alter table public.sales add column membership_id uuid;
alter table public.cash_movements add column membership_id uuid;

update public.shifts shift_row
set membership_id = membership.id
from public.workspace_memberships membership
where shift_row.membership_id is null
  and membership.workspace_id = shift_row.user_id
  and membership.auth_user_id = shift_row.worker_id;

do $$
begin
  if exists (select 1 from public.shifts where membership_id is null) then
    raise exception 'Cannot backfill shifts.membership_id without an owning membership';
  end if;
end;
$$;

alter table public.shifts alter column membership_id set not null;
alter table public.shifts
  add constraint shifts_membership_fkey
  foreign key (membership_id, user_id, worker_id)
  references public.workspace_memberships(id, workspace_id, auth_user_id)
  on delete restrict;

alter table public.shifts
  add constraint shifts_id_workspace_membership_key
  unique (id, user_id, membership_id);

update public.sales sale_row
set membership_id = shift_row.membership_id
from public.shifts shift_row
where sale_row.shift_id = shift_row.id
  and sale_row.membership_id is null;

update public.sales sale_row
set membership_id = owner_membership.id
from public.workspace_memberships owner_membership
where sale_row.membership_id is null
  and sale_row.user_id = owner_membership.workspace_id
  and owner_membership.member_kind = 'owner';

do $$
begin
  if exists (select 1 from public.sales where membership_id is null) then
    raise exception 'Cannot backfill sales.membership_id without an owning membership';
  end if;
end;
$$;

alter table public.sales alter column membership_id set not null;
alter table public.sales
  add constraint sales_membership_fkey
  foreign key (membership_id, user_id)
  references public.workspace_memberships(id, workspace_id)
  on delete restrict;

update public.cash_movements movement
set membership_id = shift_row.membership_id
from public.shifts shift_row
where movement.shift_id = shift_row.id
  and movement.membership_id is null;

do $$
begin
  if exists (select 1 from public.cash_movements where membership_id is null) then
    raise exception 'Cannot backfill cash_movements.membership_id without a shift membership';
  end if;
end;
$$;

alter table public.cash_movements alter column membership_id set not null;
alter table public.cash_movements
  add constraint cash_movements_shift_context_fkey
  foreign key (shift_id, user_id, membership_id)
  references public.shifts(id, user_id, membership_id)
  on delete restrict;

drop index if exists public.shifts_one_open_per_worker;
create unique index shifts_one_open_per_workspace_membership
  on public.shifts (user_id, membership_id)
  where status = 'open';

create index sales_workspace_membership_idx
  on public.sales (user_id, membership_id, created_at desc);

-- RLS policies are permissive by default and combine with OR. Replacing only
-- the known policy name would leave dashboard-created or legacy policies as an
-- authorization bypass, so reset every policy on tenant-bearing app tables
-- before installing the selected-workspace permission matrix.
do $$
declare
  policy_row record;
  tenant_table text;
  tenant_tables constant text[] := array[
    'appointments',
    'cash_movements',
    'categories',
    'customer_payments',
    'customers',
    'deliveries',
    'delivery_persons',
    'distributors',
    'expenses',
    'inventory_movements',
    'invoice_items',
    'invoices',
    'notifications',
    'products',
    'purchase_order_items',
    'purchase_orders',
    'sale_items',
    'sale_payments',
    'sales',
    'services',
    'settings',
    'shifts',
    'staff',
    'vehicles'
  ];
begin
  for policy_row in
    select policy.schemaname, policy.tablename, policy.policyname
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any (tenant_tables)
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;

  foreach tenant_table in array tenant_tables
  loop
    execute format(
      'alter table public.%I enable row level security',
      tenant_table
    );
  end loop;
end;
$$;

create policy workspace_categories_read on public.categories
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('pos')
      or public.worker_can('catalogo')
      or public.worker_can('inventory')
      or public.worker_can('inventory_costs')
      or public.worker_can('inventory_edit')
      or public.worker_can('inventory_stock')
    )
  );
create policy workspace_categories_write on public.categories
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_edit')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_edit')
  );

create policy workspace_products_read on public.products
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('pos')
      or public.worker_can('catalogo')
      or public.worker_can('inventory')
      or public.worker_can('inventory_costs')
      or public.worker_can('inventory_edit')
      or public.worker_can('inventory_stock')
    )
  );
create policy workspace_products_write on public.products
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_edit')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_edit')
  );

create policy workspace_services_read on public.services
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('pos')
      or public.worker_can('catalogo')
      or public.worker_can('calendar')
      or public.worker_can('services')
    )
  );
create policy workspace_services_write on public.services
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('services')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('services')
  );

create policy workspace_customers_read on public.customers
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('customers')
      or public.worker_can('pos')
      or public.worker_can('calendar')
    )
  );
create policy workspace_customers_write on public.customers
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('customers')
      or public.worker_can('pos')
      or public.worker_can('calendar')
    )
  )
  with check (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('customers')
      or public.worker_can('pos')
      or public.worker_can('calendar')
    )
  );

create policy workspace_customer_payments_read on public.customer_payments
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('customers')
  );
create policy workspace_customer_payments_insert on public.customer_payments
  for insert to authenticated
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('customers')
  );

create policy workspace_appointments_read on public.appointments
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('calendar')
  );
create policy workspace_appointments_write on public.appointments
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('calendar')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('calendar')
  );

create policy workspace_vehicles_read on public.vehicles
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('vehicles')
      or public.worker_can('calendar')
    )
  );
create policy workspace_vehicles_write on public.vehicles
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('vehicles')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('vehicles')
  );

create policy workspace_staff_read on public.staff
  for select to authenticated
  using (user_id = public.get_effective_user_id());
create policy workspace_staff_owner_write on public.staff
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.is_tenant_owner()
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.is_tenant_owner()
  );

create policy workspace_settings_read on public.settings
  for select to authenticated
  using (user_id = public.get_effective_user_id());
create policy workspace_settings_write on public.settings
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('settings')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('settings')
  );

create policy workspace_sales_read on public.sales
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('sales')
      or public.worker_can('pos')
      or public.worker_can('panel')
    )
  );
create policy workspace_sale_items_read on public.sale_items
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('sales')
      or public.worker_can('pos')
      or public.worker_can('panel')
    )
  );
create policy workspace_sale_payments_read on public.sale_payments
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('sales')
      or public.worker_can('pos')
      or public.worker_can('panel')
    )
  );

create policy workspace_expenses_read on public.expenses
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('panel')
  );
create policy workspace_expenses_owner_write on public.expenses
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.is_tenant_owner()
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.is_tenant_owner()
  );

create policy workspace_invoices_read on public.invoices
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('billing')
      or public.worker_can('inventory_stock')
      or public.worker_can('panel')
    )
  );
create policy workspace_invoices_write on public.invoices
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('billing')
      or public.worker_can('inventory_stock')
    )
  )
  with check (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('billing')
      or public.worker_can('inventory_stock')
    )
  );
create policy workspace_invoice_items_read on public.invoice_items
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('billing')
      or public.worker_can('inventory_stock')
      or public.worker_can('panel')
    )
  );
create policy workspace_invoice_items_write on public.invoice_items
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('billing')
      or public.worker_can('inventory_stock')
    )
  )
  with check (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('billing')
      or public.worker_can('inventory_stock')
    )
  );

create policy workspace_distributors_read on public.distributors
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('inventory')
      or public.worker_can('inventory_stock')
    )
  );
create policy workspace_distributors_write on public.distributors
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  );
create policy workspace_purchase_orders_read on public.purchase_orders
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('inventory')
      or public.worker_can('inventory_stock')
    )
  );
create policy workspace_purchase_orders_write on public.purchase_orders
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  );
create policy workspace_purchase_order_items_read on public.purchase_order_items
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('inventory')
      or public.worker_can('inventory_stock')
    )
  );
create policy workspace_purchase_order_items_write on public.purchase_order_items
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  );

create policy workspace_inventory_movements_read on public.inventory_movements
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  );
create policy workspace_inventory_movements_insert on public.inventory_movements
  for insert to authenticated
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('inventory_stock')
  );

create policy workspace_delivery_persons_read on public.delivery_persons
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('pos')
  );
create policy workspace_delivery_persons_write on public.delivery_persons
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('pos')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('pos')
  );
create policy workspace_deliveries_read on public.deliveries
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('pos')
  );
create policy workspace_deliveries_write on public.deliveries
  for all to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.worker_can('pos')
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.worker_can('pos')
  );

create policy workspace_shifts_read on public.shifts
  for select to authenticated
  using (
    public.get_effective_user_id() is not null
    and user_id = public.get_effective_user_id()
    and public.worker_can('pos')
  );

create policy workspace_cash_movements_read on public.cash_movements
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      public.is_tenant_owner()
      or membership_id = public.get_active_membership_id()
    )
    and public.worker_can('pos')
  );

create policy workspace_notifications_read on public.notifications
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.is_tenant_owner()
  );
create policy workspace_notifications_acknowledge on public.notifications
  for update to authenticated
  using (
    user_id = public.get_effective_user_id()
    and public.is_tenant_owner()
  )
  with check (
    user_id = public.get_effective_user_id()
    and public.is_tenant_owner()
  );

-- Ledger writes are RPC-only. SECURITY DEFINER functions above/below validate
-- selected workspace, membership, shift and permission before mutating them.
revoke insert, update, delete on public.cash_movements from authenticated;
revoke insert, update, delete on public.shifts from authenticated;
revoke insert, update, delete on public.sales from authenticated;
revoke insert, update, delete on public.sale_items from authenticated;
revoke insert, update, delete on public.sale_payments from authenticated;
revoke insert, update, delete on public.notifications from authenticated;
revoke all on table public.cash_movements, public.shifts, public.sales,
  public.sale_items, public.sale_payments, public.notifications from public;
revoke all on table public.cash_movements, public.shifts, public.sales,
  public.sale_items, public.sale_payments, public.notifications from anon;
grant select on public.cash_movements, public.shifts, public.sales,
  public.sale_items, public.sale_payments, public.notifications
  to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.open_shift(p_opening_cash numeric)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  opened_shift public.shifts;
begin
  if caller is null or workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'La base de caja no puede ser negativa';
  end if;
  if exists (
    select 1
    from public.shifts shift_row
    where shift_row.user_id = workspace
      and shift_row.membership_id = membership_id
      and shift_row.status = 'open'
  ) then
    raise exception 'Ya tienes un turno abierto';
  end if;

  insert into public.shifts (
    user_id,
    worker_id,
    membership_id,
    opening_cash
  )
  values (
    workspace,
    caller,
    membership_id,
    p_opening_cash
  )
  returning * into opened_shift;

  return json_build_object(
    'id', opened_shift.id,
    'workspace_id', opened_shift.user_id,
    'membership_id', opened_shift.membership_id,
    'opened_at', opened_shift.opened_at,
    'opening_cash', opened_shift.opening_cash
  );
end;
$$;

create or replace function public.current_shift()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  sale_count integer;
  sale_total numeric;
  cash_total numeric;
  withdrawal_total numeric;
  totals jsonb;
begin
  if workspace is null or membership_id is null then
    return null;
  end if;
  if not public.worker_can('pos') then
    return null;
  end if;

  select * into active_shift
  from public.shifts shift_row
  where shift_row.user_id = workspace
    and shift_row.membership_id = membership_id
    and shift_row.status = 'open';

  if not found then
    return null;
  end if;

  select
    count(*)::integer,
    coalesce(sum(sale_row.total), 0)
  into sale_count, sale_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = membership_id
    and sale_row.status = 'completed';

  -- A voided cash sale still put cash in the drawer before the refund.
  -- Include that inflow here; void_sale records the matching positive cash
  -- withdrawal, so expected cash nets to zero instead of counting either side
  -- twice. Split sales contribute only their efectivo payment rows.
  select coalesce(sum(
      case
        when sale_row.payment_method = 'efectivo' then sale_row.total
        when sale_row.payment_method = 'split' then coalesce((
          select sum(payment.amount)
          from public.sale_payments payment
          where payment.sale_id = sale_row.id
            and payment.user_id = workspace
            and payment.payment_method = 'efectivo'
        ), 0)
        else 0
      end
    ), 0)
  into cash_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = membership_id
    and sale_row.status in ('completed', 'void');

  select coalesce(sum(movement.amount), 0)
  into withdrawal_total
  from public.cash_movements movement
  where movement.shift_id = active_shift.id
    and movement.membership_id = membership_id;

  select coalesce(jsonb_object_agg(payment_method, method_total), '{}'::jsonb)
  into totals
  from (
    select sale_row.payment_method, sum(sale_row.total) as method_total
    from public.sales sale_row
    where sale_row.shift_id = active_shift.id
      and sale_row.user_id = workspace
      and sale_row.membership_id = membership_id
      and sale_row.status = 'completed'
    group by sale_row.payment_method
  ) grouped_sales;

  return json_build_object(
    'id', active_shift.id,
    'workspace_id', active_shift.user_id,
    'membership_id', active_shift.membership_id,
    'opened_at', active_shift.opened_at,
    'opening_cash', active_shift.opening_cash,
    'sales_count', sale_count,
    'sales_total', sale_total,
    'cash_total', cash_total,
    'withdrawals_total', withdrawal_total,
    'expected_cash', active_shift.opening_cash + cash_total - withdrawal_total,
    'totals_by_method', totals
  );
end;
$$;

create or replace function public.close_shift(
  p_closing_cash numeric,
  p_notes text default null,
  p_shift_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  sale_count integer;
  sale_total numeric;
  cash_total numeric;
  withdrawal_total numeric;
  totals jsonb;
  expected numeric;
  cash_difference numeric;
  closed_time timestamptz := now();
begin
  if workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'El efectivo contado no puede ser negativo';
  end if;

  if p_shift_id is not null then
    if not public.is_tenant_owner() then
      raise exception 'OWNER_REQUIRED' using errcode = '42501';
    end if;
    select * into active_shift
    from public.shifts shift_row
    where shift_row.id = p_shift_id
      and shift_row.user_id = workspace
      and shift_row.status = 'open'
    for update;
  else
    select * into active_shift
    from public.shifts shift_row
    where shift_row.user_id = workspace
      and shift_row.membership_id = membership_id
      and shift_row.status = 'open'
    for update;
  end if;

  if not found then
    raise exception 'Turno no encontrado o ya cerrado';
  end if;

  select
    count(*)::integer,
    coalesce(sum(sale_row.total), 0)
  into sale_count, sale_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = active_shift.membership_id
    and sale_row.status = 'completed';

  select coalesce(sum(
      case
        when sale_row.payment_method = 'efectivo' then sale_row.total
        when sale_row.payment_method = 'split' then coalesce((
          select sum(payment.amount)
          from public.sale_payments payment
          where payment.sale_id = sale_row.id
            and payment.user_id = workspace
            and payment.payment_method = 'efectivo'
        ), 0)
        else 0
      end
    ), 0)
  into cash_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = active_shift.membership_id
    and sale_row.status in ('completed', 'void');

  select coalesce(sum(movement.amount), 0)
  into withdrawal_total
  from public.cash_movements movement
  where movement.shift_id = active_shift.id
    and movement.membership_id = active_shift.membership_id;

  select coalesce(jsonb_object_agg(payment_method, method_total), '{}'::jsonb)
  into totals
  from (
    select sale_row.payment_method, sum(sale_row.total) as method_total
    from public.sales sale_row
    where sale_row.shift_id = active_shift.id
      and sale_row.user_id = workspace
      and sale_row.membership_id = active_shift.membership_id
      and sale_row.status = 'completed'
    group by sale_row.payment_method
  ) grouped_sales;

  expected := active_shift.opening_cash + cash_total - withdrawal_total;
  cash_difference := p_closing_cash - expected;

  if cash_difference <> 0 and nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'JUSTIFICACION_REQUERIDA';
  end if;

  update public.shifts
  set status = 'closed',
      closed_at = closed_time,
      closing_cash = p_closing_cash,
      expected_cash = expected,
      difference = cash_difference,
      sales_total = sale_total,
      sales_count = sale_count,
      withdrawals_total = withdrawal_total,
      totals_by_method = totals,
      notes = coalesce(p_notes, notes)
  where id = active_shift.id;

  if cash_difference <> 0 then
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      severity,
      data
    )
    values (
      workspace,
      'shift_discrepancy',
      'Descuadre de caja',
      format('El turno cerró con una diferencia de %s', cash_difference),
      'warning',
      jsonb_build_object(
        'shift_id', active_shift.id,
        'membership_id', active_shift.membership_id,
        'difference', cash_difference
      )
    );
  end if;

  return json_build_object(
    'id', active_shift.id,
    'workspace_id', active_shift.user_id,
    'membership_id', active_shift.membership_id,
    'opened_at', active_shift.opened_at,
    'closed_at', closed_time,
    'opening_cash', active_shift.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', expected,
    'difference', cash_difference,
    'sales_total', sale_total,
    'sales_count', sale_count,
    'withdrawals_total', withdrawal_total,
    'totals_by_method', totals
  );
end;
$$;

create or replace function public.register_cash_withdrawal(
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  movement_id uuid;
begin
  if workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El retiro debe ser mayor a cero';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del retiro es obligatorio';
  end if;

  select * into active_shift
  from public.shifts shift_row
  where shift_row.user_id = workspace
    and shift_row.membership_id = membership_id
    and shift_row.status = 'open'
  for update;

  if not found then
    raise exception 'No tienes un turno abierto';
  end if;

  insert into public.cash_movements (
    amount,
    reason,
    shift_id,
    user_id,
    worker_id,
    membership_id
  )
  values (
    p_amount,
    trim(p_reason),
    active_shift.id,
    workspace,
    auth.uid(),
    membership_id
  )
  returning id into movement_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    severity,
    data
  )
  values (
    workspace,
    'cash_withdrawal',
    'Retiro de caja',
    format('Se retiraron %s de la caja: %s', p_amount, trim(p_reason)),
    'info',
    jsonb_build_object(
      'shift_id', active_shift.id,
      'membership_id', membership_id,
      'cash_movement_id', movement_id,
      'amount', p_amount
    )
  );

  return movement_id;
end;
$$;

revoke execute on function public.open_shift(numeric) from public, anon;
grant execute on function public.open_shift(numeric) to authenticated;
revoke execute on function public.current_shift() from public, anon;
grant execute on function public.current_shift() to authenticated;
revoke execute on function public.close_shift(numeric, text, uuid) from public, anon;
grant execute on function public.close_shift(numeric, text, uuid) to authenticated;
revoke execute on function public.register_cash_withdrawal(numeric, text) from public, anon;
grant execute on function public.register_cash_withdrawal(numeric, text) to authenticated;


-- Rebind transactional sale creation to the selected membership. Tax-inclusive
-- pricing and the 0.19 default remain byte-for-byte equivalent to the prior RPC.
drop function if exists public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid);

create or replace function public.create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_items jsonb,
  p_staff_id uuid default null::uuid,
  p_transfer_method text default null::text,
  p_card_method text default null::text,
  p_payments jsonb default null::jsonb,
  p_client_sale_id uuid default null::uuid,
  p_expected_workspace_id uuid default null::uuid,
  p_expected_membership_id uuid default null::uuid,
  p_expected_shift_id uuid default null::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  declare
    v_auth        uuid := (select auth.uid());
    v_uid         uuid := public.get_effective_user_id();
    v_membership_id uuid := public.get_active_membership_id();
    v_member_kind text;
    v_is_worker   boolean := false;
    v_shift_id    uuid;
    v_sale_id     uuid;
    v_gross       numeric(12,2) := 0;
    v_discount    numeric(12,2) := coalesce(p_discount_amount, 0);
    v_neto        numeric(12,2);
    v_tax_rate    numeric(5,4);
    v_include_tax boolean := true;
    v_allow_over  boolean := true;
    v_tax_exempt  boolean := false;
    v_base        numeric(12,2);
    v_tax_amount  numeric(12,2);
    v_total       numeric(12,2);
    v_stored_rate numeric(5,4);
    v_item        jsonb;
    v_product     public.products%rowtype;
    v_service     public.services%rowtype;
    v_is_service  boolean;
    v_qty         integer;
    v_item_staff_id uuid;
    v_kind        text;
    v_unit_price  numeric(12,2);
    v_units       integer;
    v_stock_delta integer;
    v_line_total  numeric(12,2);
    v_commission  numeric(12,2);
    v_effective_payment text;
    v_effective_transfer text;
    v_effective_card text;
    v_split        jsonb;
    v_split_sum    numeric(12,2) := 0;
    v_credit_limit numeric(12,2);
    v_current_balance numeric(12,2);
  begin
    if v_auth is null then
      raise exception 'No autenticado';
    end if;
    if v_uid is null or v_membership_id is null then
      raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
    end if;
    if p_expected_workspace_id is null
      or p_expected_membership_id is null
    then
      raise exception 'CONTEXTO_DE_TRABAJO_REQUERIDO' using errcode = '42501';
    end if;
    if p_expected_workspace_id is distinct from v_uid then
      raise exception 'CONTEXTO_DE_TRABAJO_CAMBIO' using errcode = '42501';
    end if;
    if p_expected_membership_id is distinct from v_membership_id then
      raise exception 'CONTEXTO_DE_TRABAJO_CAMBIO' using errcode = '42501';
    end if;

    select m.member_kind into v_member_kind
    from public.workspace_memberships m
    where m.id = v_membership_id
      and m.workspace_id = v_uid
      and m.auth_user_id = v_auth
      and m.status = 'active';
    if not found then
      raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
    end if;
    v_is_worker := v_member_kind = 'member';
    if not public.worker_can('pos') then
      raise exception 'SIN_PERMISO' using errcode = '42501';
    end if;
    if p_items is null or jsonb_array_length(p_items) = 0 then
      raise exception 'La venta no tiene productos';
    end if;

    -- Idempotencia. Va ANTES de toda validacion a proposito: el reintento de
    -- una venta que ya quedo registrada no puede fallar por tope de plan, por
    -- stock ni por cupo de credito. Ya paso; solo hay que devolver su id.
    if p_client_sale_id is not null then
      select s.id into v_sale_id
      from public.sales s
      where s.user_id = v_uid and s.client_sale_id = p_client_sale_id;
      if found then
        return v_sale_id;
      end if;
      v_sale_id := null;
    end if;

    -- Tope de ventas del plan. Se evalua antes de tocar nada.
    -- p_add = 0: mide lo YA acumulado en el mes. El total de esta venta todavia
    -- no existe (se calcula al final), asi que no hay nada que sumarle.
    perform public.assert_monthly_sales_limit(v_uid, 0);

    if p_payments is not null and jsonb_array_length(p_payments) > 0 then
      for v_split in select * from jsonb_array_elements(p_payments)
      loop
        if (v_split->>'amount')::numeric <= 0 then
          raise exception 'Cada split debe tener un monto mayor a cero';
        end if;
        if v_split->>'payment_method' is null then
          raise exception 'Cada split debe tener un método de pago';
        end if;
      end loop;
    end if;

    if p_payments is not null and jsonb_array_length(p_payments) > 0 then
      v_effective_payment := 'split';
      v_effective_transfer := null;
      v_effective_card := null;
    else
      v_effective_payment := coalesce(p_payment_method, 'efectivo');
      if v_effective_payment = 'transferencia' then
        v_effective_transfer := p_transfer_method;
        v_effective_card := null;
      elsif v_effective_payment = 'tarjeta' then
        v_effective_transfer := null;
        v_effective_card := p_card_method;
      else
        v_effective_transfer := null;
        v_effective_card := null;
      end if;
    end if;

    -- Resolve the open shift inside the selected membership only. The
    -- expected context freezes offline sales against workspace switches.
    if v_effective_payment != 'credito' or p_expected_shift_id is not null then
      select shift_row.id into v_shift_id
      from public.shifts shift_row
      where shift_row.user_id = v_uid
        and shift_row.membership_id = v_membership_id
        and shift_row.worker_id = v_auth
        and shift_row.status = 'open';
    end if;

    if p_expected_shift_id is distinct from v_shift_id then
      raise exception 'CONTEXTO_DE_TRABAJO_CAMBIO' using errcode = '42501';
    end if;

    if v_is_worker and v_effective_payment != 'credito' and v_shift_id is null then
      raise exception 'Debes abrir turno antes de cobrar';
    end if;

    if p_staff_id is not null then
      perform 1 from public.staff where id = p_staff_id and user_id = v_uid;
      if not found then p_staff_id := null; end if;
    end if;

    -- Fiar requiere cliente
    if v_effective_payment = 'credito' and p_customer_id is null then
      raise exception 'El fiado requiere un cliente asignado';
    end if;

    select coalesce(s.tax_rate, 0.19),
           coalesce(s.include_tax, true),
           coalesce(s.allow_oversell, true)
      into v_tax_rate, v_include_tax, v_allow_over
    from public.settings s where s.user_id = v_uid;
    v_tax_rate := coalesce(v_tax_rate, 0.19);

    if p_customer_id is not null then
      select coalesce(c.tax_exempt, false) into v_tax_exempt
      from public.customers c where c.id = p_customer_id and c.user_id = v_uid;
    end if;

    if not v_include_tax or v_tax_exempt then
      v_stored_rate := 0;
    else
      v_stored_rate := v_tax_rate;
    end if;

    insert into public.sales (user_id, customer_id, staff_id, payment_method, transfer_method, card_method, discount_amount, tax_rate, shift_id, client_sale_id, membership_id)
    values (v_uid, p_customer_id, p_staff_id, v_effective_payment, v_effective_transfer, v_effective_card, v_discount, v_stored_rate, v_shift_id, p_client_sale_id, v_membership_id)
    returning id into v_sale_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_qty := (v_item->>'quantity')::integer;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Cantidad inválida en la venta';
      end if;

      v_item_staff_id := (v_item->>'staff_id')::uuid;
      if v_item_staff_id is not null then
        perform 1 from public.staff where id = v_item_staff_id and user_id = v_uid;
        if not found then v_item_staff_id := null; end if;
      end if;

      v_is_service := (v_item ? 'service_id') and (v_item->>'service_id') is not null;

      if v_is_service then
        select * into v_service from public.services
        where id = (v_item->>'service_id')::uuid and user_id = v_uid;
        if not found then
          raise exception 'Servicio no encontrado: %', v_item->>'service_id';
        end if;

        v_line_total := v_service.price * v_qty;

        -- Sin persona atribuida no hay a quién comisionar.
        if v_item_staff_id is not null and coalesce(v_service.has_commission, false) then
          if v_service.commission_type = 'fixed' then
            v_commission := round(coalesce(v_service.commission_value, 0) * v_qty, 2);
          else
            v_commission := round(v_line_total * coalesce(v_service.commission_value, 0) / 100, 2);
          end if;
        else
          v_commission := 0;
        end if;

        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount)
        values
          (v_uid, v_sale_id, null, v_service.id, v_service.name, null,
           v_service.price, v_qty, v_line_total, v_item_staff_id, 'unit', 1, v_commission);

        v_gross := v_gross + v_line_total;
      else
        select * into v_product from public.products
        where id = (v_item->>'product_id')::uuid and user_id = v_uid
        for update;
        if not found then
          raise exception 'Producto no encontrado';
        end if;

        v_kind := coalesce(v_item->>'kind', 'unit');
        if v_kind = 'package' then
          if v_product.package_price is null then
            raise exception 'SIN_PRECIO_CAJA: % no tiene precio por caja', v_product.name;
          end if;
          v_unit_price := v_product.package_price;
          v_units      := greatest(coalesce(v_product.units_per_package, 1), 1);
        else
          v_kind       := 'unit';
          v_unit_price := v_product.price;
          v_units      := 1;
        end if;

        v_stock_delta := v_qty * v_units;

        if not v_allow_over and (v_product.stock_level - v_stock_delta) < 0 then
          raise exception 'STOCK_INSUFICIENTE: % — hay % unidades y se intentan vender %',
            v_product.name, v_product.stock_level, v_stock_delta;
        end if;

        v_line_total := v_unit_price * v_qty;

        if v_item_staff_id is not null and coalesce(v_product.has_commission, false) then
          if v_product.commission_type = 'fixed' then
            v_commission := round(coalesce(v_product.commission_value, 0) * v_qty, 2);
          else
            v_commission := round(v_line_total * coalesce(v_product.commission_value, 0) / 100, 2);
          end if;
        else
          v_commission := 0;
        end if;

        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount)
        values
          (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
           v_unit_price, v_qty, v_line_total, v_item_staff_id, v_kind, v_units, v_commission);

        v_gross := v_gross + v_line_total;

        update public.products
          set stock_level = stock_level - v_stock_delta, updated_at = now()
        where id = v_product.id and user_id = v_uid;
      end if;
    end loop;

    v_neto := greatest(v_gross - v_discount, 0);

    if not v_include_tax then
      v_base := v_neto;
      v_tax_amount := 0;
      v_total := v_neto;
    elsif v_tax_exempt then
      v_base := round(v_neto / (1 + v_tax_rate), 2);
      v_tax_amount := 0;
      v_total := v_base;
    else
      v_base := round(v_neto / (1 + v_tax_rate), 2);
      v_tax_amount := round(v_neto - v_base, 2);
      v_total := v_neto;
    end if;

    update public.sales
      set subtotal = v_base, tax_amount = v_tax_amount, total = v_total
    where id = v_sale_id and user_id = v_uid;

    -- Aumentar balance de crédito si es fiado
    if v_effective_payment = 'credito' then
      select credit_limit, credit_balance
      into v_credit_limit, v_current_balance
      from public.customers where id = p_customer_id and user_id = v_uid;

      if v_credit_limit is not null and (v_current_balance + v_total) > v_credit_limit then
        raise exception 'El cliente excede su cupo de crédito ($%)', v_credit_limit;
      end if;

      update public.customers
      set credit_balance = credit_balance + v_total
      where id = p_customer_id and user_id = v_uid;
    end if;

    if p_payments is not null and jsonb_array_length(p_payments) > 0 then
      v_split_sum := 0;
      for v_split in select * from jsonb_array_elements(p_payments)
      loop
        v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

        insert into public.sale_payments (sale_id, payment_method, amount, transfer_method, card_method, user_id)
        values (
          v_sale_id,
          v_split->>'payment_method',
          (v_split->>'amount')::numeric,
          case when v_split->>'payment_method' = 'transferencia' then v_split->>'transfer_method' else null end,
          case when v_split->>'payment_method' = 'tarjeta' then v_split->>'card_method' else null end,
          v_uid
        );
      end loop;

      if abs(v_split_sum - v_total) > 0.01 then
        raise exception 'La suma de los pagos (%) no coincide con el total (%)', v_split_sum, v_total;
      end if;
    else
      insert into public.sale_payments (sale_id, payment_method, amount, transfer_method, card_method, user_id)
      values (
        v_sale_id,
        v_effective_payment,
        v_total,
        v_effective_transfer,
        v_effective_card,
        v_uid
      );
    end if;

    return v_sale_id;

  exception
    -- Dos reintentos EN PARALELO con la misma clave: el segundo se bloquea en
    -- el indice unico hasta que el primero termina y despues choca. El bloque
    -- deshace su trabajo a medias (incluido el descuento de stock) y devuelve
    -- la venta del que gano. Cualquier otra violacion de unicidad se re-lanza.
    when unique_violation then
      if p_client_sale_id is not null then
        select s.id into v_sale_id
        from public.sales s
        where s.user_id = v_uid and s.client_sale_id = p_client_sale_id;
        if found then
          return v_sale_id;
        end if;
      end if;
      raise;
  end;
$function$;

revoke execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.can_write_settings()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_tenant_owner() or public.worker_can('settings');
$$;

create or replace function public.staff_can(section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.worker_can(section);
$$;

create or replace function public.staff_can_action(
  section text,
  action text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.worker_can(
    case
      when action is null or action = '' then section
      else section || '_' || action
    end
  ) or public.worker_can(section);
$$;

revoke execute on function public.can_write_settings() from public, anon;
grant execute on function public.can_write_settings() to authenticated;
revoke execute on function public.staff_can(text) from public, anon;
grant execute on function public.staff_can(text) to authenticated;
revoke execute on function public.staff_can_action(text, text) from public, anon;
grant execute on function public.staff_can_action(text, text) to authenticated;

-- The old RPC addresses a global worker profile id and is ambiguous once one
-- identity has multiple memberships. Keep it unavailable; lifecycle writes use
-- the owner-validated route and membership id.
revoke execute on function public.deactivate_worker(uuid) from public, anon, authenticated;

create or replace function public.register_customer_payment(
  p_customer_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
begin
  if caller is null or workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('customers') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor que cero';
  end if;

  update public.customers customer
  set credit_balance = greatest(
    coalesce(customer.credit_balance, 0) - p_amount,
    0
  )
  where customer.id = p_customer_id
    and customer.user_id = workspace;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$$;

revoke execute on function public.register_customer_payment(uuid, numeric) from public, anon;
grant execute on function public.register_customer_payment(uuid, numeric) to authenticated;

create or replace function public.increment_stock(
  p_product_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
begin
  if caller is null or workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'La cantidad no puede ser cero';
  end if;

  update public.products product
  set stock_level = product.stock_level + p_quantity
  where product.id = p_product_id
    and product.user_id = workspace;

  if not found then
    raise exception 'Producto no encontrado';
  end if;
end;
$$;

revoke execute on function public.increment_stock(uuid, integer) from public, anon;
grant execute on function public.increment_stock(uuid, integer) to authenticated;

-- Reconcile workspace-sensitive SECURITY DEFINER functions that existed in
-- production before their definitions were captured in repository migrations.
-- Keep their client surface authenticated-only without assuming every clean
-- install already has every legacy function.
do $$
declare
  function_row record;
begin
  for function_row in
    select function_def.oid::regprocedure as signature
    from pg_catalog.pg_proc function_def
    join pg_catalog.pg_namespace namespace_def
      on namespace_def.oid = function_def.pronamespace
    where namespace_def.nspname = 'public'
      and function_def.prosecdef
      and function_def.proname = any (array[
        'ensure_license_current',
        'generate_business_key',
        'get_product_costs',
        'increment_stock',
        'my_subscription',
        'sales_summary'
      ])
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      function_row.signature
    );
    execute format(
      'grant execute on function %s to authenticated',
      function_row.signature
    );
  end loop;

end;
$$;

create or replace function public.void_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  member_kind text;
  active_shift_id uuid;
  cash_refund numeric := 0;
  sale_row record;
  item_row record;
  return_units integer;
begin
  if caller is null or workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  select m.member_kind into member_kind
  from public.workspace_memberships m
  where m.id = membership_id
    and m.workspace_id = workspace
    and m.auth_user_id = caller
    and m.status = 'active';

  if not found or (
    member_kind = 'member'
    and not public.worker_can('sales')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  select
    sale.id,
    sale.status,
    sale.total,
    sale.payment_method,
    sale.shift_id,
    sale.sale_number
  into sale_row
  from public.sales sale
  where sale.id = p_sale_id
    and sale.user_id = workspace
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if sale_row.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas';
  end if;

  if sale_row.payment_method = 'efectivo' then
    cash_refund := sale_row.total;
  elsif sale_row.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into cash_refund
    from public.sale_payments payment
    where payment.sale_id = sale_row.id
      and payment.user_id = workspace
      and payment.payment_method = 'efectivo';
  end if;

  if cash_refund > 0 then
    select shift_row.id into active_shift_id
    from public.shifts shift_row
    where shift_row.user_id = workspace
      and shift_row.membership_id = membership_id
      and shift_row.worker_id = caller
      and shift_row.status = 'open';
    if active_shift_id is null then
      raise exception 'Debes abrir turno antes de devolver efectivo';
    end if;
  end if;

  update public.sales
  set status = 'void'
  where id = p_sale_id
    and user_id = workspace;

  for item_row in
    select
      item.product_id,
      item.quantity,
      item.unit_kind,
      item.units_per_item
    from public.sale_items item
    where item.sale_id = p_sale_id
      and item.user_id = workspace
      and item.product_id is not null
  loop
    return_units := case
      when item_row.unit_kind = 'package'
        then item_row.quantity * item_row.units_per_item
      else item_row.quantity
    end;

    update public.products
    set stock_level = stock_level + return_units
    where id = item_row.product_id
      and user_id = workspace;

    insert into public.inventory_movements (
      product_id,
      quantity,
      type,
      reference_type,
      reference_id,
      created_by,
      user_id,
      notes
    )
    values (
      item_row.product_id,
      return_units,
      'in',
      'sale_void',
      p_sale_id,
      caller,
      workspace,
      'Anulación de venta #' || sale_row.sale_number::text
    );
  end loop;

  if cash_refund > 0 then
    insert into public.cash_movements (
      amount,
      reason,
      shift_id,
      user_id,
      worker_id,
      membership_id
    )
    values (
      cash_refund,
      'Devolución - Venta #' || sale_row.sale_number::text || ' anulada',
      active_shift_id,
      workspace,
      caller,
      membership_id
    );
  end if;
end;
$$;

revoke execute on function public.void_sale(uuid) from public, anon;
grant execute on function public.void_sale(uuid) to authenticated;

-- Fail-closed structural assertions. Runtime behavior is exercised after
-- remote application; these checks prevent a migration from exposing the
-- authority tables or leaving the old singular helper in control.
do $$
declare
  helper_definition text;
begin
  if has_table_privilege('authenticated', 'public.workspace_memberships', 'SELECT')
    or has_table_privilege('authenticated', 'public.workspace_memberships', 'INSERT')
    or has_table_privilege('authenticated', 'public.workspace_memberships', 'UPDATE')
    or has_table_privilege('authenticated', 'public.workspace_session_selections', 'SELECT')
  then
    raise exception 'membership authority assertion failed: direct client table privilege remains';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.find_auth_user_by_email(text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.find_auth_user_by_email(text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.find_auth_user_by_email(text)',
    'EXECUTE'
  ) then
    raise exception 'membership authority assertion failed: auth email lookup grant is unsafe';
  end if;

  select lower(pg_get_functiondef('public.get_effective_user_id()'::regprocedure))
  into helper_definition;

  if position('workspace_session_selections' in helper_definition) = 0
    or position('workspace_memberships' in helper_definition) = 0
    or position('m.status = ''active''' in helper_definition) = 0
    or position('profiles' in helper_definition) > 0
  then
    raise exception 'membership authority assertion failed: effective workspace helper is singular or incomplete';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_def
    where constraint_def.conrelid = 'public.workspace_memberships'::regclass
      and constraint_def.conname = 'workspace_memberships_staff_workspace_fkey'
      and constraint_def.contype = 'f'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint constraint_def
    where constraint_def.conrelid = 'public.workspace_session_selections'::regclass
      and constraint_def.conname = 'workspace_session_selections_membership_fkey'
      and constraint_def.contype = 'f'
  ) then
    raise exception 'membership authority assertion failed: composite ownership constraint missing';
  end if;

  if not (
    select table_def.relrowsecurity
    from pg_catalog.pg_class table_def
    where table_def.oid = 'public.workspace_memberships'::regclass
  ) or not (
    select table_def.relrowsecurity
    from pg_catalog.pg_class table_def
    where table_def.oid = 'public.workspace_session_selections'::regclass
  ) then
    raise exception 'membership authority assertion failed: RLS is disabled';
  end if;

  if has_function_privilege('authenticated', 'public.deactivate_worker(uuid)', 'EXECUTE') then
    raise exception 'membership authority assertion failed: singular lifecycle RPC remains callable';
  end if;

  if has_table_privilege('authenticated', 'public.cash_movements', 'INSERT')
    or has_table_privilege('authenticated', 'public.cash_movements', 'UPDATE')
    or has_table_privilege('authenticated', 'public.cash_movements', 'DELETE')
    or has_table_privilege('authenticated', 'public.shifts', 'INSERT')
    or has_table_privilege('authenticated', 'public.shifts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.shifts', 'DELETE')
    or has_table_privilege('authenticated', 'public.sales', 'INSERT')
    or has_table_privilege('authenticated', 'public.sales', 'UPDATE')
    or has_table_privilege('authenticated', 'public.sales', 'DELETE')
    or has_table_privilege('authenticated', 'public.sale_items', 'INSERT')
    or has_table_privilege('authenticated', 'public.sale_items', 'UPDATE')
    or has_table_privilege('authenticated', 'public.sale_items', 'DELETE')
    or has_table_privilege('authenticated', 'public.sale_payments', 'INSERT')
    or has_table_privilege('authenticated', 'public.sale_payments', 'UPDATE')
    or has_table_privilege('authenticated', 'public.sale_payments', 'DELETE')
  then
    raise exception 'membership authority assertion failed: direct ledger DML grant remains';
  end if;

  if has_table_privilege('authenticated', 'public.notifications', 'INSERT')
    or has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
    or has_table_privilege('authenticated', 'public.notifications', 'DELETE')
    or not has_column_privilege(
      'authenticated',
      'public.notifications',
      'read_at',
      'UPDATE'
    )
    or has_column_privilege(
      'authenticated',
      'public.notifications',
      'title',
      'UPDATE'
    )
  then
    raise exception 'membership authority assertion failed: notification grants are unsafe';
  end if;

  if has_table_privilege('anon', 'public.cash_movements', 'SELECT')
    or has_table_privilege('anon', 'public.cash_movements', 'INSERT')
    or has_table_privilege('anon', 'public.cash_movements', 'UPDATE')
    or has_table_privilege('anon', 'public.cash_movements', 'DELETE')
    or has_table_privilege('anon', 'public.shifts', 'SELECT')
    or has_table_privilege('anon', 'public.shifts', 'INSERT')
    or has_table_privilege('anon', 'public.shifts', 'UPDATE')
    or has_table_privilege('anon', 'public.shifts', 'DELETE')
    or has_table_privilege('anon', 'public.sales', 'SELECT')
    or has_table_privilege('anon', 'public.sales', 'INSERT')
    or has_table_privilege('anon', 'public.sales', 'UPDATE')
    or has_table_privilege('anon', 'public.sales', 'DELETE')
    or has_table_privilege('anon', 'public.sale_items', 'SELECT')
    or has_table_privilege('anon', 'public.sale_items', 'INSERT')
    or has_table_privilege('anon', 'public.sale_items', 'UPDATE')
    or has_table_privilege('anon', 'public.sale_items', 'DELETE')
    or has_table_privilege('anon', 'public.sale_payments', 'SELECT')
    or has_table_privilege('anon', 'public.sale_payments', 'INSERT')
    or has_table_privilege('anon', 'public.sale_payments', 'UPDATE')
    or has_table_privilege('anon', 'public.sale_payments', 'DELETE')
    or has_table_privilege('anon', 'public.notifications', 'SELECT')
    or has_table_privilege('anon', 'public.notifications', 'INSERT')
    or has_table_privilege('anon', 'public.notifications', 'UPDATE')
    or has_table_privilege('anon', 'public.notifications', 'DELETE')
  then
    raise exception 'membership authority assertion failed: anonymous ledger privilege remains';
  end if;

  if (
    to_regprocedure('public.increment_stock(uuid,integer)') is not null
    and (
      has_function_privilege('anon', 'public.increment_stock(uuid,integer)', 'EXECUTE')
      or not has_function_privilege(
        'authenticated',
        'public.increment_stock(uuid,integer)',
        'EXECUTE'
      )
    )
  ) then
    raise exception 'membership authority assertion failed: stock RPC grant is unsafe';
  end if;

  if has_function_privilege(
    'anon',
    'public.register_customer_payment(uuid,numeric)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.register_customer_payment(uuid,numeric)',
    'EXECUTE'
  ) then
    raise exception 'membership authority assertion failed: customer payment RPC grant is unsafe';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc function_def
    join pg_catalog.pg_namespace namespace_def
      on namespace_def.oid = function_def.pronamespace
    where namespace_def.nspname = 'public'
      and function_def.prosecdef
      and function_def.proname = any (array[
        'ensure_license_current',
        'generate_business_key',
        'get_product_costs',
        'increment_stock',
        'my_subscription',
        'sales_summary'
      ])
      and has_function_privilege('anon', function_def.oid, 'EXECUTE')
  ) then
    raise exception 'membership authority assertion failed: anonymous SECURITY DEFINER execute remains';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any (array[
        'appointments',
        'cash_movements',
        'categories',
        'customer_payments',
        'customers',
        'deliveries',
        'delivery_persons',
        'distributors',
        'expenses',
        'inventory_movements',
        'invoice_items',
        'invoices',
        'notifications',
        'products',
        'purchase_order_items',
        'purchase_orders',
        'sale_items',
        'sale_payments',
        'sales',
        'services',
        'settings',
        'shifts',
        'staff',
        'vehicles'
      ])
      and (
        left(policy.policyname, 10) <> 'workspace_'
        or (
          coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
        ) not like '%get_effective_user_id%'
      )
  ) then
    raise exception 'membership authority assertion failed: legacy or unscoped tenant policy remains';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'shifts'
      and indexname = 'shifts_one_open_per_workspace_membership'
  ) then
    raise exception 'membership authority assertion failed: workspace shift uniqueness missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.cmd in ('INSERT', 'UPDATE', 'DELETE')
      and policy.policyname in (
        'product_images_insert_own',
        'product_images_update_own',
        'product_images_delete_own',
        'business_logos_insert_own',
        'business_logos_update_own',
        'business_logos_delete_own'
      )
      and (
        coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
      ) not like '%get_effective_user_id%'
  ) then
    raise exception 'membership authority assertion failed: storage policy is identity-scoped';
  end if;
end;
$$;
