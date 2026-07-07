-- =====================================================================
-- Movimientos de inventario
-- Trazabilidad de entradas, salidas y ajustes de stock.
-- =====================================================================

create table if not exists public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  type           text not null check (type in ('in', 'out', 'adjust')),
  quantity       integer not null check (quantity > 0),
  reference_type text,
  reference_id   uuid,
  notes          text,
  created_at     timestamptz not null default now()
);

alter table public.inventory_movements enable row level security;

create policy "Users manage own inventory_movements" on public.inventory_movements
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_inventory_movements_user_id
  before insert on public.inventory_movements
  for each row execute function public.set_user_id();

create index if not exists inv_movements_product_id_idx  on public.inventory_movements (product_id);
create index if not exists inv_movements_user_id_idx     on public.inventory_movements (user_id);
create index if not exists inv_movements_created_at_idx  on public.inventory_movements (created_at desc);
