-- El alta y la anulación de una compra pasan a ser atómicas.
--
-- Las dos hacían lo mismo desde el navegador: un bucle de `increment_stock` sin
-- mirar el error, y después un insert de movimientos tampoco chequeado. Dos
-- consecuencias, las dos silenciosas:
--
--   * Si la devolución de stock fallaba, la factura igual quedaba anulada y el
--     movimiento igual se escribía. El historial afirmaba haber devuelto stock
--     que nunca volvió.
--   * Si fallaba a mitad del bucle, unos productos movían stock y otros no, sin
--     nada que lo registre.
--
-- Chequear el error no alcanzaba: convierte una mentira silenciosa en un estado
-- parcial, que no es mejor. Lo que hace falta es que stock y movimientos vivan
-- en la misma transacción que el cambio de estado, y eso solo se consigue del
-- lado del servidor.
--
-- El alta no necesita función nueva: reusa `replace_purchase_invoice_items`. Una
-- factura recién creada no tiene líneas, así que su "antes" está vacío y cada
-- línea entra como delta positivo. El único ajuste es el texto del movimiento,
-- que ahora distingue el alta de la edición.

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
  v_nota           text;
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
  -- mismo producto en varias líneas y al stock le importa el total, no la fila.
  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_old
    from (
      select ii.product_id, sum(ii.quantity) as qty
        from public.invoice_items ii
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) antes;

  -- Sin líneas previas esto es un ALTA, no una edición. El movimiento tiene que
  -- decirlo: "Edición de compra #12" sobre una compra recién creada manda a
  -- buscar un cambio que nunca existió.
  v_nota := case when v_old = '{}'::jsonb then 'Compra #' else 'Edición de compra #' end
         || v_invoice_number;

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
      v_nota
    );
  end loop;
end;
$function$;


-- Anulación atómica: marca la factura, devuelve el stock y escribe el historial
-- en una sola transacción. Si algo falla, no pasó nada.
create or replace function public.cancel_purchase_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant         uuid := public.get_effective_user_id();
  v_invoice_number bigint;
  v_status         text;
  v_row            record;
  v_qty            integer;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

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

  -- El lock de arriba más este chequeo hacen el cerrojo: dos anulaciones
  -- simultáneas se serializan y la segunda encuentra la compra ya anulada, así
  -- que no devuelve el stock por segunda vez.
  if v_status = 'cancelled' then
    raise exception 'La compra ya está anulada' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  update public.invoices set status = 'cancelled' where id = p_invoice_id;

  -- Agregado por producto, no por línea: si la compra repetía un producto en dos
  -- líneas, lo que hay que devolver es el total y alcanza con un movimiento.
  for v_row in
    select ii.product_id, sum(ii.quantity) as qty
      from public.invoice_items ii
     where ii.invoice_id = p_invoice_id
       and ii.product_id is not null
     group by ii.product_id
  loop
    v_qty := round(v_row.qty)::integer;
    continue when v_qty = 0;

    update public.products
       set stock_level = stock_level - v_qty
     where id = v_row.product_id
       and user_id = v_tenant;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    insert into public.inventory_movements (
      user_id, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_row.product_id, 'out', v_qty, 'cancellation', p_invoice_id,
      'Anulación de compra #' || v_invoice_number
    );
  end loop;
end;
$function$;

-- Postgres da EXECUTE a PUBLIC al crear una función, y PUBLIC incluye a `anon`.
-- Una SECURITY DEFINER alcanzable sin sesión no se explota acá —sin sesión
-- `get_effective_user_id()` es null y la función corta en la primera línea— pero
-- no hay motivo para dejarla expuesta, y `replace_purchase_invoice_items` ya
-- estaba cerrada así. Ojo: cada `create or replace` vuelve a abrirla.
revoke execute on function public.cancel_purchase_invoice(uuid) from public;
revoke execute on function public.cancel_purchase_invoice(uuid) from anon;
grant  execute on function public.cancel_purchase_invoice(uuid) to authenticated;
