-- Recibir pedido: elegir estado (pagada/pendiente) y tasa de IVA de la compra.
--
-- `receive_purchase_order` creaba SIEMPRE la compra como pagada y sin IVA. Un
-- pedido que se recibe a crédito quedaba como gasto pagado, y uno con IVA
-- registraba un costo menor al facturado.
--
-- Parámetros nuevos al final, con default = comportamiento anterior
-- ('paid', 0), así que un cliente viejo que llama con (p_order_id,
-- p_issue_date) sigue resolviendo a esta función. La firma vieja se dropea en
-- la misma migración: si convivieran, toda llamada con dos argumentos sería
-- ambigua. Los valores los valida `save_purchase_invoice`
-- (ESTADO_COMPRA_INVALIDO / TASA_IVA_INVALIDA).

drop function if exists public.receive_purchase_order(uuid, date);

create or replace function public.receive_purchase_order(
  p_order_id   uuid,
  p_issue_date date default null,
  p_status     text default 'paid',
  p_tax_rate   numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      'status', coalesce(nullif(p_status, ''), 'paid'),
      'issue_date', coalesce(p_issue_date, current_date),
      'discount_amount', 0,
      'tax_rate', coalesce(p_tax_rate, 0)
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
$function$;

revoke all on function public.receive_purchase_order(uuid, date, text, numeric) from public, anon;
grant execute on function public.receive_purchase_order(uuid, date, text, numeric) to authenticated;
