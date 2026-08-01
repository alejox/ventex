-- Teléfono de contacto del perfil (dueño y cuentas directas).
-- Se copia del raw_user_meta_data al registrarse y lo puede editar el dueño
-- vía grant de columna (mismo patrón que full_name/business_name).
alter table public.profiles add column phone text;

-- El trigger de alta copia el teléfono enviado en el signup (opcional).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, business_type, modules, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'business_type',
    coalesce(new.raw_user_meta_data->'modules', '{}'::jsonb),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- El dueño puede actualizar su propio teléfono (replay-safe: revoke previo).
revoke update (phone) on public.profiles from authenticated;
grant update (phone) on public.profiles to authenticated;

-- Se expone en la única proyección de lectura del perfil.
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
