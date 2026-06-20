-- =====================================================================
-- Vehículos (lavaautos): entidad propia para historial por placa.
-- Convención: RLS FOR ALL TO authenticated con (select auth.uid()),
-- trigger set_user_id, e índices en FKs. Placa única por cuenta.
-- =====================================================================
create table if not exists public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plate       text not null,
  make_model  text,
  color       text,
  customer_id uuid references public.customers(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, plate)
);

alter table public.vehicles enable row level security;

create policy "Users manage own vehicles" on public.vehicles
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_vehicles_user_id before insert on public.vehicles
  for each row execute function public.set_user_id();

create index if not exists vehicles_user_id_idx     on public.vehicles (user_id);
create index if not exists vehicles_customer_id_idx  on public.vehicles (customer_id);

-- Enlazar la cita al vehículo (además del snapshot placa/modelo ya existente).
alter table public.appointments
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;

create index if not exists appointments_vehicle_id_idx on public.appointments (vehicle_id);
