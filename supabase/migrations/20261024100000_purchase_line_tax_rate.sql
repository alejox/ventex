-- =====================================================================
-- IVA POR LÍNEA en compras + el ICUI por línea deja de ser solo visual.
--
-- Caso real (tienda): la factura del proveedor trae Pingüinos 7.014 con IVA
-- 19 % (1.332,66) + ICUI 20 % (1.402,80), y Pan Mantequilla 17.001 y Tostadas
-- 12.332 EXENTOS de IVA. Total 39.082,46. Con una sola tasa de cabecera
-- (`invoices.tax_rate`) la base cobraba 36.347 × 19 % = 6.905,93: no había forma
-- de exentar una línea.
--
-- 1) `products.tax_rate` (NULL = tasa del negocio; 0 = exento) y
--    `invoice_items.tax_rate` (NULL = línea LEGADA → usa la cabecera).
-- 2) `purchase_line_tax(line_total, rate)`: IVA de UNA línea, redondeado a
--    centavos POR LÍNEA (como lo imprime el proveedor). Espejo de
--    `purchaseLineTax` (lib/purchase-totals.ts).
-- 3) `recompute_purchase_invoice_totals` y `guard_purchase_invoice_write`:
--    si TODAS las líneas son legadas (tax_rate NULL) → la cuenta vieja exacta
--    (`purchase_totals(subtotal, 0, invoices.tax_rate)`), así ninguna compra
--    anterior cambia un centavo. Si no, IVA = suma del IVA de cada línea.
-- 4) `replace_purchase_invoice_items`: cada item puede traer `tax_rate`
--    (0..1, `TASA_IVA_INVALIDA`) e `icui_applies`. Sin la clave:
--    `coalesce(producto.tax_rate, cabecera.tax_rate)` y
--    `coalesce(producto.icui_applies, false)` (lo de antes). Con la clave,
--    MANDA la línea — antes el switch de ICUI del formulario se ignoraba.
-- 5) `receive_purchase_order`: las líneas toman `coalesce(producto.tax_rate,
--    p_tax_rate)` y el `icui_applies` del producto.
--
-- Cuerpos tomados de la base en vivo (pg_get_functiondef) el 2026-10-24.
-- Aplicada vía MCP en 4 partes (el payload entero fallaba por tamaño):
-- 20261024100000_purchase_line_tax_rate_{columns,totals,items,receive}.

-- 1 -------------------------------------------------------------------------
alter table public.products
  add column if not exists tax_rate numeric(5,4) null;

alter table public.products
  drop constraint if exists products_tax_rate_range;
alter table public.products
  add constraint products_tax_rate_range check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 1));

comment on column public.products.tax_rate is
  'Tasa de IVA del producto para compras y ventas (0..1). NULL = la del negocio; 0 = exento. (Hoy solo la usan las compras; el POS/create_sale la adoptará después.)';

-- Mismo trato que icui_applies: GRANT por columna (20261008100500). SELECT para
-- todo miembro del negocio (el POS la va a necesitar; la RLS de products ya
-- acota al negocio). También va en PRODUCT_COLUMNS (services/inventory.service.ts).
grant select (tax_rate), insert (tax_rate), update (tax_rate) on public.products to authenticated;

alter table public.invoice_items
  add column if not exists tax_rate numeric(5,4) null;

alter table public.invoice_items
  drop constraint if exists invoice_items_tax_rate_range;
alter table public.invoice_items
  add constraint invoice_items_tax_rate_range check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 1));

comment on column public.invoice_items.tax_rate is
  'Tasa de IVA de la línea de compra (0..1). NULL = línea anterior a 20261024100000: usa invoices.tax_rate.';

-- 2 -------------------------------------------------------------------------
create or replace function public.purchase_line_tax(p_line_total numeric, p_rate numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(greatest(coalesce(p_line_total, 0), 0) * coalesce(p_rate, 0), 2);
$$;

-- 3a ------------------------------------------------------------------------
create or replace function public.recompute_purchase_invoice_totals(p_invoice_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rate      numeric;
  v_icui_rate numeric;
  v_sub       numeric;
  v_disc      numeric;
  v_icui_base numeric;
  v_by_line   boolean;
  v_tax       numeric;
  v_icui      numeric;
  t           record;
begin
  select i.tax_rate, i.icui_rate
    into v_rate, v_icui_rate
    from public.invoices i
   where i.id = p_invoice_id
     and i.type = 'compra';
  if not found then
    return;
  end if;

  select coalesce(sum(ii.line_total), 0),
         coalesce(sum(ii.discount_amount), 0),
         coalesce(sum(ii.line_total) filter (where ii.icui_applies), 0),
         coalesce(bool_or(ii.tax_rate is not null), false),
         coalesce(sum(public.purchase_line_tax(ii.line_total, coalesce(ii.tax_rate, v_rate))), 0)
    into v_sub, v_disc, v_icui_base, v_by_line, v_tax
    from public.invoice_items ii
   where ii.invoice_id = p_invoice_id;

  select * into t from public.purchase_totals(v_sub, 0, v_rate);

  -- Compra vieja (todas las líneas legadas): la cuenta de siempre.
  if not v_by_line then
    v_tax := t.tax_amount;
  end if;

  v_icui := public.purchase_icui_amount(v_icui_base, v_icui_rate);

  update public.invoices
     set subtotal        = t.subtotal,
         discount_amount = v_disc,
         tax_amount      = v_tax,
         icui_amount     = v_icui,
         total           = round(t.subtotal + v_tax + v_icui, 2)
   where id = p_invoice_id
     and (subtotal, discount_amount, tax_amount, icui_amount, total)
         is distinct from (t.subtotal, v_disc, v_tax, v_icui,
                           round(t.subtotal + v_tax + v_icui, 2));
end;
$function$;

-- 3b ------------------------------------------------------------------------
create or replace function public.guard_purchase_invoice_write()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_from_client boolean := current_user in ('authenticated', 'anon');
  v_sub         numeric;
  v_disc        numeric;
  v_icui_base   numeric;
  v_by_line     boolean;
  v_tax         numeric;
  t             record;
begin
  if tg_op = 'DELETE' then
    if old.type = 'compra' and v_from_client
       and exists (select 1 from public.invoice_items ii where ii.invoice_id = old.id) then
      raise exception 'COMPRA_NO_SE_BORRA: una compra con productos no se borra; anúlala para devolver el stock'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.type <> 'compra' and new.type <> 'compra' then
    return new;
  end if;

  if new.type is distinct from old.type then
    raise exception 'COMPRA_TIPO_FIJO: una compra no se convierte en otro tipo de documento'
      using errcode = '42501';
  end if;

  if old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    raise exception 'COMPRA_ANULADA: una compra anulada no se puede reactivar; registra una compra nueva'
      using errcode = '42501';
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and coalesce(current_setting('app.cancelling_purchase', true), '') <> 'on' then
    raise exception 'COMPRA_ANULAR_CON_ACCION: para anular una compra usa la acción Anular, que devuelve el stock'
      using errcode = '42501';
  end if;

  if v_from_client
     and (new.subtotal, new.discount_amount, new.tax_rate, new.tax_amount,
          new.icui_rate, new.icui_amount, new.total)
         is distinct from
         (old.subtotal, old.discount_amount, old.tax_rate, old.tax_amount,
          old.icui_rate, old.icui_amount, old.total) then

    if new.tax_rate < 0 or new.tax_rate > 1 then
      raise exception 'TASA_IVA_INVALIDA: la tasa de IVA debe estar entre 0 y 100 %%'
        using errcode = '22023';
    end if;

    if new.icui_rate < 0 or new.icui_rate > 1 then
      raise exception 'TASA_ICUI_INVALIDA: la tasa de ICUI debe estar entre 0 y 100 %%'
        using errcode = '22023';
    end if;

    select coalesce(sum(ii.line_total), 0),
           coalesce(sum(ii.discount_amount), 0),
           coalesce(sum(ii.line_total) filter (where ii.icui_applies), 0),
           coalesce(bool_or(ii.tax_rate is not null), false),
           coalesce(sum(public.purchase_line_tax(ii.line_total, coalesce(ii.tax_rate, new.tax_rate))), 0)
      into v_sub, v_disc, v_icui_base, v_by_line, v_tax
      from public.invoice_items ii
     where ii.invoice_id = new.id;

    select * into t from public.purchase_totals(v_sub, 0, new.tax_rate);
    if not v_by_line then
      v_tax := t.tax_amount;
    end if;

    new.subtotal := t.subtotal;
    new.discount_amount := v_disc;
    new.tax_amount := v_tax;
    new.icui_amount := public.purchase_icui_amount(v_icui_base, new.icui_rate);
    new.total := round(t.subtotal + v_tax + new.icui_amount, 2);
  end if;

  return new;
end;
$function$;

-- 4 -------------------------------------------------------------------------
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
  v_header_rate    numeric;
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

  select i.invoice_number, i.status, coalesce(i.tax_rate, 0)
    into v_invoice_number, v_status, v_header_rate
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

  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
     where coalesce((item->>'discount_amount')::numeric, 0) < 0
        or coalesce((item->>'discount_amount')::numeric, 0)
           > round(
               coalesce((item->>'package_quantity')::numeric, 0) * coalesce((item->>'package_price')::numeric, 0)
               + ((item->>'quantity')::numeric
                  - coalesce((item->>'package_quantity')::numeric, 0)
                    * greatest(coalesce((item->>'units_per_package')::integer, 1), 1))
                 * coalesce((item->>'unit_price')::numeric, 0), 2)
  ) then
    raise exception 'DESCUENTO_LINEA_INVALIDO: el descuento de una línea no puede ser negativo ni mayor que su total'
      using errcode = '22023';
  end if;

  -- IVA por línea: si viene, tiene que ser un número entre 0 y 1.
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
     where item ? 'tax_rate'
       and jsonb_typeof(item->'tax_rate') <> 'null'
       and (jsonb_typeof(item->'tax_rate') <> 'number'
            or (item->>'tax_rate')::numeric < 0
            or (item->>'tax_rate')::numeric > 1)
  ) then
    raise exception 'TASA_IVA_INVALIDA: la tasa de IVA debe estar entre 0 y 100 %%'
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

  insert into public.invoice_items (
    user_id, invoice_id, product_id, description,
    quantity, package_quantity, unit_price, package_price, discount_amount, line_total,
    units_per_package, icui_applies, tax_rate
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
    x.discount_amount,
    round(x.package_quantity * x.package_price
          + (x.quantity - x.package_quantity * x.units_per_package) * x.unit_price
          - x.discount_amount, 2),
    x.units_per_package,
    coalesce(x.icui_applies, pr.icui_applies, false),
    coalesce(x.tax_rate, pr.tax_rate, v_header_rate)
  from (
    select nullif(item->>'product_id', '')::uuid                           as product_id,
           item->>'description'                                            as description,
           (item->>'quantity')::numeric                                    as quantity,
           coalesce((item->>'package_quantity')::numeric, 0)               as package_quantity,
           coalesce((item->>'unit_price')::numeric, 0)                     as unit_price,
           coalesce((item->>'package_price')::numeric, 0)                  as package_price,
           coalesce((item->>'discount_amount')::numeric, 0)                as discount_amount,
           greatest(coalesce((item->>'units_per_package')::integer, 1), 1) as units_per_package,
           case when jsonb_typeof(item->'tax_rate') = 'number'
                then (item->>'tax_rate')::numeric end                      as tax_rate,
           case when jsonb_typeof(item->'icui_applies') = 'boolean'
                then (item->>'icui_applies')::boolean end                  as icui_applies
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
  ) x
  left join public.products pr
    on pr.id = x.product_id
   and pr.user_id = v_tenant;

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

  select coalesce(array_agg(k::uuid), '{}') into v_products
    from jsonb_object_keys(v_old || v_new) as k;
  perform public.sync_products_last_cost(v_tenant, v_products);
end;
$function$;

-- 5 -------------------------------------------------------------------------
create or replace function public.receive_purchase_order(p_order_id uuid, p_issue_date date default null::date, p_status text default 'paid'::text, p_tax_rate numeric default 0)
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
           'unit_price', case when x.u > 1 then round(poi.unit_price / x.u, 2) else poi.unit_price end,
           'tax_rate', coalesce(pr.tax_rate, p_tax_rate, 0),
           'icui_applies', coalesce(pr.icui_applies, false)
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
