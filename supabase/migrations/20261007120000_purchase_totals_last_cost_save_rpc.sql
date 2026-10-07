-- Compras: totales calculados en la base, último costo al producto y guardado
-- atómico (cabecera + líneas + stock) en UNA llamada.
--
-- 1) `purchase_totals`: el IVA de una compra va sobre (subtotal − descuento),
--    no sobre el subtotal. Es la misma cuenta que `purchaseTotalsOf`
--    (lib/purchase-totals.ts) — si cambia una, cambia la otra.
-- 2) `recompute_purchase_invoice_totals`: la cabecera se deriva SIEMPRE de sus
--    líneas guardadas + su descuento + su tasa. Nadie le manda el total.
-- 3) `sync_products_last_cost`: `products.purchase_price` queda con el costo
--    de la compra NO anulada más reciente (issue_date, luego created_at) que
--    trae ese producto con costo > 0. `purchase_price` significa costo de la
--    CAJA cuando units_per_package > 1 (ver getUnitCost en
--    services/inventory.service.ts), así que se escribe en esa unidad.
-- 4) `products_guard_edit` deja pasar ese cambio de costo cuando lo hace la
--    sincronización (flag de transacción `app.syncing_purchase_cost`): un
--    trabajador con `inventory_stock` y sin `inventory_costs` puede cargar una
--    compra, y la compra arrastra el costo aunque él no pueda editarlo a mano.
-- 5) `replace_purchase_invoice_items` calcula `line_total` en el servidor,
--    recalcula la cabecera y sincroniza el costo.
-- 6) `save_purchase_invoice(id, header, items)`: alta o edición en una sola
--    transacción, con la factura bloqueada.

-- 1 -------------------------------------------------------------------------
create or replace function public.purchase_totals(
  p_subtotal numeric,
  p_discount numeric,
  p_tax_rate numeric
)
returns table (subtotal numeric, tax_amount numeric, total numeric)
language sql
immutable
set search_path = ''
as $$
  select x.s,
         round(greatest(x.s - x.d, 0) * x.r, 2),
         round(greatest(x.s - x.d, 0) + round(greatest(x.s - x.d, 0) * x.r, 2), 2)
    from (select round(coalesce(p_subtotal, 0), 2) as s,
                 round(coalesce(p_discount, 0), 2) as d,
                 coalesce(p_tax_rate, 0)           as r) x;
$$;

-- 2 -------------------------------------------------------------------------
create or replace function public.recompute_purchase_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disc numeric;
  v_rate numeric;
  v_sub  numeric;
  t      record;
begin
  select i.discount_amount, i.tax_rate
    into v_disc, v_rate
    from public.invoices i
   where i.id = p_invoice_id
     and i.type = 'compra';
  if not found then
    return;
  end if;

  select coalesce(sum(ii.line_total), 0) into v_sub
    from public.invoice_items ii
   where ii.invoice_id = p_invoice_id;

  select * into t from public.purchase_totals(v_sub, v_disc, v_rate);

  update public.invoices
     set subtotal = t.subtotal,
         tax_amount = t.tax_amount,
         total = t.total
   where id = p_invoice_id
     and (subtotal, tax_amount, total) is distinct from (t.subtotal, t.tax_amount, t.total);
end;
$$;

-- 3 -------------------------------------------------------------------------
create or replace function public.sync_products_last_cost(p_tenant uuid, p_product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_tenant is null or p_product_ids is null or cardinality(p_product_ids) = 0 then
    return;
  end if;

  perform set_config('app.syncing_purchase_cost', 'on', true);

  for r in
    select pr.id,
           pr.purchase_price as old_cost,
           (
             select case
                      -- Caja con el mismo tamaño que el producto: el precio de
                      -- la caja tal cual, sin pasar por división y redondeo.
                      when greatest(coalesce(pr.units_per_package, 1), 1) > 1
                           and l.package_quantity > 0 and l.package_price > 0
                           and l.units_per_package = pr.units_per_package
                        then l.package_price
                      else round(l.unit_cost * greatest(coalesce(pr.units_per_package, 1), 1), 2)
                    end
               from (
                 select ii.package_quantity,
                        ii.package_price,
                        ii.units_per_package,
                        case
                          when ii.package_quantity > 0 and ii.package_price > 0
                            then ii.package_price / greatest(ii.units_per_package, 1)
                          when ii.quantity - ii.package_quantity * greatest(ii.units_per_package, 1) > 0
                               and ii.unit_price > 0
                            then ii.unit_price
                        end as unit_cost,
                        i.issue_date,
                        i.created_at as invoice_created,
                        ii.created_at as line_created,
                        ii.id
                   from public.invoice_items ii
                   join public.invoices i on i.id = ii.invoice_id
                  where ii.product_id = pr.id
                    and i.user_id = p_tenant
                    and i.type = 'compra'
                    and i.status <> 'cancelled'
               ) l
              where l.unit_cost is not null
              order by l.issue_date desc, l.invoice_created desc, l.line_created desc, l.id desc
              limit 1
           ) as new_cost
      from public.products pr
     where pr.id = any (p_product_ids)
       and pr.user_id = p_tenant
     for update of pr
  loop
    continue when r.new_cost is null or r.new_cost is not distinct from r.old_cost;
    update public.products set purchase_price = r.new_cost where id = r.id;
  end loop;

  perform set_config('app.syncing_purchase_cost', 'off', true);
end;
$$;

-- 4 -------------------------------------------------------------------------
create or replace function public.products_guard_edit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- La compra arrastra el último costo (sync_products_last_cost). Solo pasa si
  -- lo ÚNICO que cambia es el costo (y updated_at). `allows_fractions` es
  -- generada: en un BEFORE trigger llega NULL en `new`, por eso se excluye.
  if coalesce(current_setting('app.syncing_purchase_cost', true), '') = 'on'
     and (to_jsonb(new) - 'purchase_price' - 'updated_at' - 'allows_fractions')
         is not distinct from
         (to_jsonb(old) - 'purchase_price' - 'updated_at' - 'allows_fractions') then
    return new;
  end if;

  if new.purchase_price is distinct from old.purchase_price
     and not public.worker_can('inventory_costs') then
    raise exception 'SIN_PERMISO: no tienes permiso para cambiar el costo de un producto'
      using errcode = '42501';
  end if;

  if public.worker_can('inventory_edit') then
    return new;
  end if;

  if (to_jsonb(new) - 'stock_level' - 'updated_at' - 'allows_fractions')
     is distinct from
     (to_jsonb(old) - 'stock_level' - 'updated_at' - 'allows_fractions') then
    raise exception 'SIN_PERMISO: no tienes permiso para editar productos'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- 5 -------------------------------------------------------------------------
create or replace function public.replace_purchase_invoice_items(p_invoice_id uuid, p_items jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant         uuid := public.get_effective_user_id();
  v_actor          uuid := (select auth.uid());
  v_invoice_number bigint;
  v_status         text;
  v_old            jsonb;
  v_new            jsonb;
  v_nota           text;
  v_row            record;
  v_delta          numeric(12,3);
  v_tracks         boolean;
  v_products       uuid[];
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

  if v_status = 'cancelled' then
    raise exception 'La compra está anulada y no se puede editar' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  -- Una línea con más cajas que unidades totales, o con precios negativos, no
  -- describe nada que se haya comprado.
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
     where coalesce((item->>'unit_price')::numeric, 0) < 0
        or coalesce((item->>'package_price')::numeric, 0) < 0
        or (item->>'quantity')::numeric
           - coalesce((item->>'package_quantity')::numeric, 0)
             * greatest(coalesce((item->>'units_per_package')::integer, 1), 1) < 0
  ) then
    raise exception 'LINEA_COMPRA_INVALIDA: una línea tiene cantidades o costos inválidos'
      using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_old
    from (
      select ii.product_id, sum(ii.quantity) as qty
        from public.invoice_items ii
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) antes;

  v_nota := case when v_old = '{}'::jsonb then 'Compra #' else 'Edición de compra #' end
         || v_invoice_number;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  -- `line_total` lo calcula la base (cajas × precio de caja + sueltas × precio
  -- unitario), igual que `lineTotalOf`. El del cliente se ignora.
  insert into public.invoice_items (
    user_id, invoice_id, product_id, description,
    quantity, package_quantity, unit_price, package_price, line_total,
    units_per_package
  )
  select
    v_tenant,
    p_invoice_id,
    x.product_id,
    x.description,
    x.quantity,
    x.package_quantity,
    x.unit_price,
    x.package_price,
    round(x.package_quantity * x.package_price
          + (x.quantity - x.package_quantity * x.units_per_package) * x.unit_price, 2),
    x.units_per_package
  from (
    select nullif(item->>'product_id', '')::uuid                         as product_id,
           item->>'description'                                          as description,
           (item->>'quantity')::numeric                                  as quantity,
           coalesce((item->>'package_quantity')::numeric, 0)             as package_quantity,
           coalesce((item->>'unit_price')::numeric, 0)                   as unit_price,
           coalesce((item->>'package_price')::numeric, 0)                as package_price,
           greatest(coalesce((item->>'units_per_package')::integer, 1), 1) as units_per_package
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
  ) x;

  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_new
    from (
      select ii.product_id, sum(ii.quantity) as qty
        from public.invoice_items ii
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) despues;

  for v_row in
    select clave::uuid as product_id,
           coalesce((v_new ->> clave)::numeric, 0) - coalesce((v_old ->> clave)::numeric, 0) as diff
      from jsonb_object_keys(v_old || v_new) as clave
  loop
    v_delta := round(v_row.diff, 3);
    continue when v_delta = 0;

    select coalesce(pr.tracks_stock, true) into v_tracks
      from public.products pr
     where pr.id = v_row.product_id
       and pr.user_id = v_tenant
     for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    continue when not v_tracks;

    update public.products
       set stock_level = stock_level + v_delta
     where id = v_row.product_id
       and user_id = v_tenant;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant,
      v_actor,
      v_row.product_id,
      case when v_delta > 0 then 'in' else 'out' end,
      abs(v_delta),
      'purchase',
      p_invoice_id,
      v_nota
    );
  end loop;

  perform public.recompute_purchase_invoice_totals(p_invoice_id);

  -- Productos de ANTES y de DESPUÉS: quitar un producto de la compra también
  -- le puede cambiar el último costo (vuelve al de la compra anterior).
  select coalesce(array_agg(k::uuid), '{}') into v_products
    from jsonb_object_keys(v_old || v_new) as k;
  perform public.sync_products_last_cost(v_tenant, v_products);
end;
$function$;

-- 6 -------------------------------------------------------------------------
create or replace function public.save_purchase_invoice(
  p_invoice_id uuid,
  p_header jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant     uuid := public.get_effective_user_id();
  v_id         uuid := p_invoice_id;
  v_status     text := coalesce(nullif(p_header->>'status', ''), 'paid');
  v_supplier   text := upper(btrim(coalesce(p_header->>'supplier_invoice_number', '')));
  v_dist       uuid := nullif(p_header->>'distributor_id', '')::uuid;
  v_discount   numeric := round(coalesce(nullif(p_header->>'discount_amount', '')::numeric, 0), 2);
  v_rate       numeric := coalesce(nullif(p_header->>'tax_rate', '')::numeric, 0);
  v_issue      date := coalesce(nullif(p_header->>'issue_date', '')::date, current_date);
  v_due        date := nullif(p_header->>'due_date', '')::date;
  v_notes      text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_cur_status text;
  v_sub        numeric;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO: no tienes permiso para registrar compras' using errcode = '42501';
  end if;

  -- "Anulada" no entra por acá: es cancel_purchase_invoice, que devuelve el stock.
  if v_status not in ('paid', 'pending') then
    raise exception 'ESTADO_COMPRA_INVALIDO: el estado de una compra es Pagada o Pendiente'
      using errcode = '22023';
  end if;

  if v_supplier = '' then
    raise exception 'Ingresa el N° de factura del proveedor.' using errcode = '22023';
  end if;

  if v_dist is null or not exists (
    select 1 from public.distributors d where d.id = v_dist and d.user_id = v_tenant
  ) then
    raise exception 'PROVEEDOR_NO_ENCONTRADO: elige un proveedor de este negocio'
      using errcode = '22023';
  end if;

  if v_rate < 0 or v_rate > 1 then
    raise exception 'TASA_IVA_INVALIDA: la tasa de IVA debe estar entre 0 y 100 %%'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'COMPRA_SIN_LINEAS: agrega al menos un producto' using errcode = '22023';
  end if;

  -- El descuento se valida contra el subtotal que va a calcular la base, no
  -- contra el que diga el cliente.
  select coalesce(sum(round(
           coalesce((item->>'package_quantity')::numeric, 0) * coalesce((item->>'package_price')::numeric, 0)
           + ((item->>'quantity')::numeric
              - coalesce((item->>'package_quantity')::numeric, 0)
                * greatest(coalesce((item->>'units_per_package')::integer, 1), 1))
             * coalesce((item->>'unit_price')::numeric, 0), 2)), 0)
    into v_sub
    from jsonb_array_elements(p_items) as item;

  if v_discount < 0 or v_discount > round(v_sub, 2) then
    raise exception 'DESCUENTO_COMPRA_INVALIDO: el descuento no puede ser negativo ni mayor que el subtotal'
      using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.invoices (
      user_id, created_by, type, status, distributor_id, supplier_invoice_number,
      issue_date, due_date, notes, discount_amount, tax_rate
    ) values (
      v_tenant, (select auth.uid()), 'compra', v_status, v_dist, v_supplier,
      v_issue, v_due, v_notes, v_discount, v_rate
    )
    returning id into v_id;
  else
    select i.status into v_cur_status
      from public.invoices i
     where i.id = v_id
       and i.user_id = v_tenant
       and i.type = 'compra'
       for update;

    if not found then
      raise exception 'Factura de compra no encontrada';
    end if;

    if v_cur_status = 'cancelled' then
      raise exception 'La compra está anulada y no se puede editar' using errcode = '42501';
    end if;

    update public.invoices
       set distributor_id = v_dist,
           supplier_invoice_number = v_supplier,
           issue_date = v_issue,
           due_date = v_due,
           notes = v_notes,
           status = v_status,
           discount_amount = v_discount,
           tax_rate = v_rate
     where id = v_id;
  end if;

  -- Líneas, stock, movimientos, totales de cabecera y último costo: todo en la
  -- misma transacción. Si algo falla, no queda nada a medias.
  perform public.replace_purchase_invoice_items(v_id, p_items);

  return v_id;
end;
$$;

revoke all on function public.recompute_purchase_invoice_totals(uuid) from public, anon, authenticated;
revoke all on function public.sync_products_last_cost(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.save_purchase_invoice(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_purchase_invoice(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.purchase_totals(numeric, numeric, numeric) from anon;
grant execute on function public.purchase_totals(numeric, numeric, numeric) to authenticated;
