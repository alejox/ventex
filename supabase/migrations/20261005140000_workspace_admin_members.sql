-- Administrador real: un miembro con poderes de dueño.
--
-- Hasta ahora había dos clases: el dueño (`member_kind = 'owner'`) y el
-- trabajador (`'member'`, limitado por `permissions`). El administrador es un
-- MIEMBRO con `is_admin = true`: conserva su staff/membresía (sigue siendo una
-- persona de Personal) pero para la base cuenta como dueño en todo lo que hoy
-- pregunta `is_tenant_owner()` / `worker_can()`.
--
-- Lo que NO hereda (se decide en la app, no aquí): facturación/licencia de
-- ePayco, cambiar el tipo de negocio/módulos, y crear o modificar accesos del
-- equipo — todo eso pasa por `requireSelectedWorkspaceOwner()`, que exige
-- `member_kind = 'owner'`. Por eso un administrador no puede ascender a nadie.
--
-- `workspace_memberships` no tiene GRANT para `authenticated`: solo
-- service_role (rutas /api/worker/*, que ya exigen al dueño) puede escribir
-- `is_admin`. Un cliente no se lo puede dar a sí mismo.

alter table public.workspace_memberships
  add column if not exists is_admin boolean not null default false;

alter table public.workspace_memberships
  drop constraint if exists workspace_memberships_admin_is_member;
alter table public.workspace_memberships
  add constraint workspace_memberships_admin_is_member
  check (not is_admin or member_kind = 'member');

-- ¿Dueño del negocio, o administrador activo de él?
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
      and m.status = 'active'
      and (m.member_kind = 'owner' or (m.member_kind = 'member' and m.is_admin))
  );
$$;

revoke execute on function public.is_tenant_owner() from public, anon;
grant execute on function public.is_tenant_owner() to authenticated, service_role;

-- Solo el dueño real, para lo que un administrador no debe poder hacer.
create or replace function public.is_workspace_owner()
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

revoke execute on function public.is_workspace_owner() from public, anon;
grant execute on function public.is_workspace_owner() to authenticated, service_role;

create or replace function public.worker_can(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when m.member_kind = 'owner' or m.is_admin then true
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

-- `is_worker` deja de ser true para un administrador: toda la app lo usa como
-- "no es dueño" (turno de caja, Personal, Ajustes...), y el admin se comporta
-- como el dueño en eso. `membership_kind` sigue diciendo 'member'.
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
    'phone', coalesce(owner_profile.phone, identity_profile.phone),
    'is_super_admin', identity_profile.is_super_admin,
    'is_reseller', identity_profile.is_reseller,
    'is_worker', active_membership.member_kind = 'member' and not active_membership.is_admin,
    'is_workspace_admin', coalesce(active_membership.is_admin, false),
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

-- `create_sale` decide si exige turno con `v_is_worker := v_member_kind = 'member'`.
-- Un administrador está exento igual que el dueño (la app no le muestra turno).
-- En vez de copiar la función entera, se parchea esa única línea sobre la
-- definición viva, y se aborta si no se la encuentra: mejor fallar la migración
-- que dejar a un administrador bloqueado en el cobro.
do $$
declare
  fn record;
  patched integer := 0;
  src text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_sale'
  loop
    src := pg_get_functiondef(fn.oid);
    if position('v_is_worker := v_member_kind = ''member'';' in src) > 0 then
      execute replace(
        src,
        'v_is_worker := v_member_kind = ''member'';',
        'v_is_worker := v_member_kind = ''member'' and not public.is_tenant_owner();'
      );
      patched := patched + 1;
    elsif position('v_member_kind = ''member'' and not public.is_tenant_owner();' in src) > 0 then
      patched := patched + 1; -- ya parcheada (re-ejecución)
    end if;
  end loop;

  if patched = 0 then
    raise exception 'create_sale: no se encontró la línea de v_is_worker para parchear';
  end if;
end;
$$;
