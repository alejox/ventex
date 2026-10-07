-- Recibir un pedido de compra en UNA transacción idempotente.
--
-- Antes eran dos llamadas desde el navegador: crear la compra (que suma stock)
-- y después marcar el pedido como recibido, sin mirar cuántas filas cambió.
-- Doble clic, dos pestañas o un reintento creaban DOS compras: stock y gasto
-- duplicados.
--
-- Ahora el pedido se bloquea (FOR UPDATE), se exige `issued` sin compra, se
-- crea la compra con `save_purchase_invoice` (líneas + stock + totales + último
-- costo) y se marca recibido con el vínculo a la factura. Una segunda llamada
-- sobre un pedido ya recibido devuelve la compra existente con
-- `already_received = true`, sin tocar nada.
--
-- Precio de las líneas: `purchase_order_items.unit_price` se carga desde
-- `products.purchase_price`, que en un producto por caja (units_per_package > 1)
-- es el costo de la CAJA, mientras que `quantity` está en unidades sueltas. La
-- compra se arma entonces en cajas + sueltas: cajas = floor(qty / upp),
-- precio de caja = unit_price del pedido, precio suelto = unit_price / upp.
-- Así el total no se infla ×upp y el último costo queda en la unidad correcta.
--
-- Líneas sin producto (texto libre): se omiten, igual que antes. Compras no
-- admite líneas sin producto (el formulario las rechaza), así que incluirlas
-- dejaría una compra que no se puede volver a editar. Si el pedido no tiene
-- NINGUNA línea con producto, se rechaza con PEDIDO_SIN_PRODUCTOS.

create or replace function public.receive_purchase_order(
  p_order_id uuid,
  p_issue_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := public.get_effective_user_id();
  o         record;
  v_items   jsonb;
  v_invoice uuid;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO: no tienes permiso para recibir pedidos' using errcode = '42501';
  end if;

  select po.id, po.status, po.invoice_id, po.distributor_id, po.order_number
    into o
    from public.purchase_orders po
   where po.id = p_order_id
     and po.user_id = v_tenant
     for update;

  if not found then
    raise exception 'PEDIDO_NO_ENCONTRADO: el pedido no existe en este negocio' using errcode = '22023';
  end if;

  -- Idempotencia: el segundo clic (o la segunda pestaña) devuelve la compra que
  -- ya se creó, sin duplicar stock ni gasto.
  if o.status = 'received' and o.invoice_id is not null then
    return jsonb_build_object('invoice_id', o.invoice_id, 'already_received', true);
  end if;

  if o.status <> 'issued' or o.invoice_id is not null then
    raise exception 'PEDIDO_NO_EMITIDO: solo se recibe un pedido emitido y pendiente'
      using errcode = '22023';
  end if;

  if o.distributor_id is null then
    raise exception 'PEDIDO_SIN_PROVEEDOR: asigna un proveedor al pedido antes de recibirlo'
      using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object(
           'product_id', poi.product_id,
           'description', poi.product_name,
           'quantity', poi.quantity,
           'package_quantity', case when x.u > 1 then floor(poi.quantity / x.u) else 0 end,
           'units_per_package', x.u,
           'package_price', case when x.u > 1 then poi.unit_price else 0 end,
           'unit_price', case when x.u > 1 then round(poi.unit_price / x.u, 2) else poi.unit_price end
         ) order by poi.product_name, poi.id)
    into v_items
    from public.purchase_order_items poi
    join public.products pr
      on pr.id = poi.product_id
     and pr.user_id = v_tenant
   cross join lateral (select greatest(coalesce(pr.units_per_package, 1), 1) as u) x
   where poi.purchase_order_id = p_order_id
     and poi.product_id is not null
     and poi.quantity > 0;

  if v_items is null then
    raise exception 'PEDIDO_SIN_PRODUCTOS: el pedido no tiene productos del catálogo para ingresar'
      using errcode = '22023';
  end if;

  v_invoice := public.save_purchase_invoice(
    null,
    jsonb_build_object(
      'distributor_id', o.distributor_id,
      'supplier_invoice_number', 'PED-' || o.order_number,
      'status', 'paid',
      'issue_date', coalesce(p_issue_date, current_date),
      'discount_amount', 0,
      'tax_rate', 0
    ),
    v_items
  );

  update public.purchase_orders
     set status = 'received',
         received_at = now(),
         invoice_id = v_invoice,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('invoice_id', v_invoice, 'already_received', false);
end;
$$;

revoke all on function public.receive_purchase_order(uuid, date) from public, anon;
grant execute on function public.receive_purchase_order(uuid, date) to authenticated;
