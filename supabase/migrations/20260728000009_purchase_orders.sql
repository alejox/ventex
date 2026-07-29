-- Órdenes de compra: el pedido de reposición deja de vivir solo en la pantalla.
--
-- Hasta ahora /dashboard/pedidos era una calculadora: sugería cantidades,
-- exportaba a Excel y mandaba WhatsApp, pero "Guardar como Borrador" y "Emitir
-- Orden de Compra" eran botones sin handler y recargar la página perdía todo.
--
-- Ciclo: draft -> issued -> received. Al recibir se genera la factura de compra
-- en invoices/invoice_items (que es lo que ya suma stock y costo), y se guarda
-- su id en invoice_id para poder ir del pedido a la compra.

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Consecutivo POR NEGOCIO, no global: cada dueño ve su #1, #2, #3.
  order_number bigint not null,
  distributor_id uuid references public.distributors(id) on delete set null,
  status text not null default 'draft',
  notes text,
  issued_at timestamptz,
  received_at timestamptz,
  -- La compra que nació de este pedido al recibirlo.
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_status_check
    check (status in ('draft', 'issued', 'received', 'cancelled'))
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  -- Si el producto se borra, la línea sobrevive: el pedido es un documento
  -- histórico y su nombre y sku quedan congelados como en sale_items.
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists purchase_orders_user_status_idx
  on public.purchase_orders (user_id, status, created_at desc);
create index if not exists purchase_order_items_order_idx
  on public.purchase_order_items (purchase_order_id);
create unique index if not exists purchase_orders_number_per_tenant
  on public.purchase_orders (user_id, order_number);

-- Tenencia: el trigger estándar del proyecto resuelve el negocio del worker.
create trigger set_purchase_orders_user_id
  before insert on public.purchase_orders
  for each row execute function public.set_user_id();

create trigger set_purchase_order_items_user_id
  before insert on public.purchase_order_items
  for each row execute function public.set_user_id();

-- El consecutivo se asigna en la base, no en el cliente: dos pestañas abriendo
-- pedidos a la vez no pueden quedarse con el mismo número. (Ver la migración
-- 20260728000010, que corrige cómo resuelve la tenencia.)
create or replace function public.set_purchase_order_number()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.order_number is null or new.order_number = 0 then
    select coalesce(max(order_number), 0) + 1 into new.order_number
    from public.purchase_orders
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger set_purchase_orders_number
  before insert on public.purchase_orders
  for each row execute function public.set_purchase_order_number();

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

create policy purchase_orders_tenant on public.purchase_orders
  for all to authenticated
  using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create policy purchase_order_items_tenant on public.purchase_order_items
  for all to authenticated
  using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

-- Sin GRANT no hay PostgREST: RLS filtra filas, pero el permiso es aparte.
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;
