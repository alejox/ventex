-- Domicilios: dirección, costo de envío, repartidor y seguimiento de estado.
--
-- `delivery_persons`: lista externa de domiciliarios (nombre + teléfono).
-- `deliveries`: un registro por venta con domicilio, vinculado a la venta y al repartidor.
--
-- Estados: pending → in_transit → delivered

create table if not exists public.delivery_persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id)
);

alter table public.delivery_persons enable row level security;

create policy "Tenant isolation for delivery_persons"
  on public.delivery_persons
  for all
  using (user_id = (select public.get_effective_user_id()))
  with check (user_id = (select public.get_effective_user_id()));

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  delivery_person_id uuid not null references public.delivery_persons(id),
  address text not null default '',
  fee numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'in_transit', 'delivered')),
  notes text,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id)
);

alter table public.deliveries enable row level security;

create policy "Tenant isolation for deliveries"
  on public.deliveries
  for all
  using (user_id = (select public.get_effective_user_id()))
  with check (user_id = (select public.get_effective_user_id()));
