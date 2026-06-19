-- Perfil de cuenta: fuente de verdad de tipo de negocio y módulos habilitados.
-- Relación 1:1 con auth.users (id = auth.users.id), patrón estándar de Supabase.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  business_type text,
  modules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Política única FOR ALL TO authenticated (convención del proyecto).
create policy "profiles_owner" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update, delete on public.profiles to authenticated;

-- updated_at automático (search_path inmutable por seguridad).
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crear perfil automáticamente al registrarse, copiando la metadata del signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, business_type, modules)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'business_type',
    coalesce(new.raw_user_meta_data->'modules', '{}'::jsonb)
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- Solo debe ejecutarse por el trigger, no vía RPC público.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill de usuarios existentes.
insert into public.profiles (id, full_name, business_type, modules)
select
  u.id,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'business_type',
  coalesce(u.raw_user_meta_data->'modules', '{}'::jsonb)
from auth.users u
on conflict (id) do nothing;
