-- Nuevo estado 'completed' para los pedidos de reposicion.
--
-- Cierra un pedido SIN efectos colaterales: no crea factura de compra ni mueve
-- stock. Es lo que lo diferencia de 'received', que si hace las dos cosas
-- (ver receivePurchaseOrder en services/purchase-orders.service.ts).
--
-- Para que sirve: mientras un pedido esta en 'draft' o 'issued', sus productos
-- dejan de sugerirse como "falta" y asi no se piden dos veces. Completarlo o
-- cancelarlo los devuelve a la sugerencia.
alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;

alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status = any (array['draft'::text, 'issued'::text, 'received'::text, 'completed'::text, 'cancelled'::text]));

-- Cuando se cerro. Nullable porque solo lo tienen los pedidos completados,
-- igual que issued_at y received_at para sus propios estados.
alter table public.purchase_orders
  add column if not exists completed_at timestamptz;

comment on column public.purchase_orders.completed_at is
  'Instante en que el pedido se marco como completado. Null salvo status = completed.';
