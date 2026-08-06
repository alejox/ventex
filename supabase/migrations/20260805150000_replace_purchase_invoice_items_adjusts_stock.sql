-- Editar una compra ahora ajusta el stock.
--
-- Hasta acá `replace_purchase_invoice_items` borraba e insertaba las líneas y no
-- tocaba inventario. Consecuencias reales que se vieron en producción:
--
--   * Agregar una línea al editar creaba la fila pero NO sumaba stock. El
--     producto quedaba "comprado" en la factura y ausente del inventario.
--   * Peor: al anular, `cancelPurchaseInvoice` devuelve TODO lo que encuentra en
--     `invoice_items` porque asume que todo eso entró alguna vez. Con una línea
--     agregada por edición esa premisa es falsa, así que la anulación restaba
--     stock que nunca se había sumado. Así un producto terminó en -1.
--
-- La corrección va acá adentro y no en el cliente a propósito: el ajuste tiene
-- que ser atómico con el reemplazo de líneas. Partido en dos llamadas desde el
-- navegador, un fallo entre medio deja las líneas nuevas con el stock viejo —
-- exactamente la clase de bug que esta RPC ya existía para evitar.
--
-- El ajuste es por DELTA, no por reposición: se compara la cantidad agregada por
-- producto antes y después, y solo se mueve la diferencia. Cambiar 10 por 12
-- suma 2; no resta 10 y suma 12. Eso mantiene el historial legible y evita dos
-- movimientos por cada edición trivial.

create or replace function public.replace_purchase_invoice_items(p_invoice_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant         uuid := public.get_effective_user_id();
  v_invoice_number bigint;
  v_status         text;
  v_old            jsonb;
  v_new            jsonb;
  v_row            record;
  v_delta          integer;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  -- `for update` serializa dos ediciones simultáneas de la misma compra: sin el
  -- lock, ambas leerían el mismo "antes" y el segundo delta saldría mal.
  select i.invoice_number, i.status
    into v_invoice_number, v_status
    from public.invoices i
   where i.id = p_invoice_id
     and i.user_id = v_tenant
     and i.type = 'compra'
     for update;

  if not found then
    raise exception 'Factura de compra no encontrada';
  end if;

  -- Una compra anulada ya devolvió su stock. Reescribir sus líneas volvería a
  -- mover inventario sobre una factura que contablemente no existe.
  if v_status = 'cancelled' then
    raise exception 'La compra está anulada y no se puede editar' using errcode = '42501';
  end if;

  -- Mismo permiso que exige `increment_stock` al dar de alta la compra: si
  -- editar mueve stock, editar necesita el permiso de stock.
  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  -- Cantidades ANTES, agregadas por producto: una misma factura puede repetir el
  -- mismo producto en varias líneas y el stock le importa el total, no la fila.
  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_old
    from (
      select ii.product_id, sum(ii.quantity) as qty
        from public.invoice_items ii
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) antes;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  insert into public.invoice_items (
    user_id, invoice_id, product_id, description,
    quantity, package_quantity, unit_price, package_price, line_total,
    units_per_package
  )
  select
    v_tenant,
    p_invoice_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'description',
    (item->>'quantity')::numeric,
    coalesce((item->>'package_quantity')::numeric, 0),
    coalesce((item->>'unit_price')::numeric, 0),
    coalesce((item->>'package_price')::numeric, 0),
    (item->>'line_total')::numeric,
    coalesce((item->>'units_per_package')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;

  -- Cantidades DESPUÉS, leídas de la tabla y no del jsonb: así el delta se
  -- calcula sobre lo que realmente quedó guardado.
  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_new
    from (
      select ii.product_id, sum(ii.quantity) as qty
        from public.invoice_items ii
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) despues;

  -- `v_old || v_new` da la UNIÓN de productos: hay que recorrer también los que
  -- desaparecieron de la factura, que son justamente los que hay que descontar.
  for v_row in
    select clave::uuid as product_id,
           coalesce((v_new ->> clave)::numeric, 0) - coalesce((v_old ->> clave)::numeric, 0) as diff
      from jsonb_object_keys(v_old || v_new) as clave
  loop
    v_delta := round(v_row.diff)::integer;
    continue when v_delta = 0;

    update public.products
       set stock_level = stock_level + v_delta
     where id = v_row.product_id
       and user_id = v_tenant;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    insert into public.inventory_movements (
      user_id, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant,
      v_row.product_id,
      case when v_delta > 0 then 'in' else 'out' end,
      abs(v_delta),
      'purchase',
      p_invoice_id,
      'Edición de compra #' || v_invoice_number
    );
  end loop;
end;
$function$;
