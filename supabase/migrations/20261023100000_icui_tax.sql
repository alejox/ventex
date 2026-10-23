-- =====================================================================
-- ICUI: Impuesto a los Comestibles Ultraprocesados Industrialmente (Colombia).
--
-- Impuesto saludable (Ley 2277 de 2022, tarifa actual 20 %, código DIAN 35).
-- Es MONOFÁSICO: se liquida solo en producción/importación, así que el
-- comerciante que revende NO lo cobra en sus ventas (ya viene en el costo).
-- Por eso NO se toca `create_sale`: el ICUI solo se MARCA en el producto y se
-- REGISTRA en la compra, como parte del costo que el proveedor ya facturó.
--
-- 1) `products.icui_applies`: marca el producto sujeto al impuesto. La UI lo
--    muestra solo en `tienda`, pero la columna existe para todos los rubros.
-- 2) `invoice_items.icui_applies`: SNAPSHOT del flag al guardar la compra
--    (mismo patrón que `stock_qty_applied`): si el producto cambia de flag
--    después, la compra vieja no se recalcula en silencio.
-- 3) `invoices.icui_rate` / `invoices.icui_amount`: la tasa (snapshot, default
--    0.20 en el cliente) y el monto del impuesto de la compra.
-- 4) `purchase_icui_amount(base, rate)`: el monto = base marcada × tasa, en
--    centavos, ESPEJO de `icuiAmountFor` (lib/icui.ts).
-- 5) Los totales se recalculan en la base: `recompute_purchase_invoice_totals`
--    y `guard_purchase_invoice_write` suman el ICUI sobre las líneas marcadas.
-- 6) `replace_purchase_invoice_items` congela `icui_applies` desde el producto.
-- 7) `save_purchase_invoice` lee y valida `icui_rate` desde la cabecera.
--
-- El ICUI NO interacciona con el descuento de cabecera: se calcula sobre la
-- suma de `line_total` de las líneas marcadas, a propósito (el descuento es una
-- negociación entre proveedor y comerciante; el impuesto grava la mercadería).

-- 1 -------------------------------------------------------------------------
alter table public.products
  add column if not exists icui_applies boolean not null default false;

comment on column public.products.icui_applies is
  'El producto está sujeto al ICUI (Impuesto a los Comestibles Ultraprocesados Industrialmente, Colombia). Solo informativo: el impuesto ya viene en el costo de compra.';

alter table public.invoice_items
  add column if not exists icui_applies boolean not null default false;

comment on column public.invoice_items.icui_applies is
  'Snapshot del flag del producto al guardar la compra: base imponible del ICUI de la línea.';

alter table public.invoices
  add column if not exists icui_rate   numeric(5,4)  not null default 0,
  add column if not exists icui_amount numeric(12,2) not null default 0;

comment on column public.invoices.icui_rate is
  'Tasa de ICUI de la compra (0..1). 0 = sin ICUI.';
comment on column public.invoices.icui_amount is
  'Monto de ICUI de la compra, calculado por la base sobre las líneas marcadas.';

-- La columna nueva de products entra al GRANT por columna (ver
-- 20261008100500_products_cost_column_privileges.sql): sin esto el cliente no
-- la lee. También hay que sumarla a PRODUCT_COLUMNS (services/inventory.service.ts).
grant select (icui_applies) on public.products to authenticated;

-- 4 -------------------------------------------------------------------------
create or replace function public.purchase_icui_amount(p_icui_base numeric, p_icui_rate numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(greatest(coalesce(p_icui_base, 0), 0) * coalesce(p_icui_rate, 0), 2);
$$;

-- 5a ------------------------------------------------------------------------
-- Recomputa la cabecera desde las líneas, ahora con ICUI. La cuenta de IVA no
-- cambia (purchase_totals sigue en 3 args); el ICUI se suma aparte.
create or replace function public.recompute_purchase_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disc      numeric;
  v_rate      numeric;
  v_icui_rate numeric;
  v_sub       numeric;
  v_icui_base numeric;
  t           record;
begin
  select i.discount_amount, i.tax_rate, i.icui_rate
    into v_disc, v_rate, v_icui_rate
    from public.invoices i
   where i.id = p_invoice_id
     and i.type = 'compra';
  if not found then
    return;
  end if;

  select coalesce(sum(ii.line_total), 0) into v_sub
    from public.invoice_items ii
   where ii.invoice_id = p_invoice_id;

  select coalesce(sum(ii.line_total), 0) into v_icui_base
    from public.invoice_items ii
   where ii.invoice_id = p_invoice_id
     and ii.icui_applies;

  select * into t from public.purchase_totals(v_sub, v_disc, v_rate);

  update public.invoices
     set subtotal    = t.subtotal,
         tax_amount  = t.tax_amount,
         icui_amount = public.purchase_icui_amount(v_icui_base, v_icui_rate),
         total       = round(t.total + public.purchase_icui_amount(v_icui_base, v_icui_rate), 2)
   where id = p_invoice_id
     and (subtotal, tax_amount, icui_amount, total)
         is distinct from (t.subtotal, t.tax_amount,
                           public.purchase_icui_amount(v_icui_base, v_icui_rate),
                           round(t.total + public.purchase_icui_amount(v_icui_base, v_icui_rate), 2));
end;
$$;

-- 6 -------------------------------------------------------------------------
-- Igual que el vigente, pero al insertar las líneas congela `icui_applies`
-- desde el producto (JOIN a products). El cliente no lo manda.
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

  insert into public.invoice_items (
    user_id, invoice_id, product_id, description,
    quantity, package_quantity, unit_price, package_price, line_total,
    units_per_package, icui_applies
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
    x.units_per_package,
    coalesce(pr.icui_applies, false)
  from (
    select nullif(item->>'product_id', '')::uuid                          as product_id,
           item->>'description'                                           as description,
           (item->>'quantity')::numeric                                   as quantity,
           coalesce((item->>'package_quantity')::numeric, 0)              as package_quantity,
           coalesce((item->>'unit_price')::numeric, 0)                    as unit_price,
           coalesce((item->>'package_price')::numeric, 0)                 as package_price,
           greatest(coalesce((item->>'units_per_package')::integer, 1), 1) as units_per_package
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

-- 7 -------------------------------------------------------------------------
-- Igual que el vigente, más la lectura/validación/guardado de `icui_rate`.
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
  v_icui_rate  numeric := coalesce(nullif(p_header->>'icui_rate', '')::numeric, 0);
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

  if v_icui_rate < 0 or v_icui_rate > 1 then
    raise exception 'TASA_ICUI_INVALIDA: la tasa de ICUI debe estar entre 0 y 100 %%'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'COMPRA_SIN_LINEAS: agrega al menos un producto' using errcode = '22023';
  end if;

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
      issue_date, due_date, notes, discount_amount, tax_rate, icui_rate
    ) values (
      v_tenant, (select auth.uid()), 'compra', v_status, v_dist, v_supplier,
      v_issue, v_due, v_notes, v_discount, v_rate, v_icui_rate
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
           tax_rate = v_rate,
           icui_rate = v_icui_rate
     where id = v_id;
  end if;

  perform public.replace_purchase_invoice_items(v_id, p_items);

  return v_id;
end;
$$;

-- 5b ------------------------------------------------------------------------
-- El guard de escrituras desde el cliente también recalcula el ICUI.
create or replace function public.guard_purchase_invoice_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from_client boolean := current_user in ('authenticated', 'anon');
  v_sub         numeric;
  v_icui_base   numeric;
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
    select coalesce(sum(ii.line_total), 0) into v_sub
      from public.invoice_items ii
     where ii.invoice_id = new.id;

    select coalesce(sum(ii.line_total), 0) into v_icui_base
      from public.invoice_items ii
     where ii.invoice_id = new.id
       and ii.icui_applies;

    if new.discount_amount < 0 or new.discount_amount > round(v_sub, 2) then
      raise exception 'DESCUENTO_COMPRA_INVALIDO: el descuento no puede ser negativo ni mayor que el subtotal'
        using errcode = '22023';
    end if;

    if new.tax_rate < 0 or new.tax_rate > 1 then
      raise exception 'TASA_IVA_INVALIDA: la tasa de IVA debe estar entre 0 y 100 %%'
        using errcode = '22023';
    end if;

    if new.icui_rate < 0 or new.icui_rate > 1 then
      raise exception 'TASA_ICUI_INVALIDA: la tasa de ICUI debe estar entre 0 y 100 %%'
        using errcode = '22023';
    end if;

    select * into t from public.purchase_totals(v_sub, new.discount_amount, new.tax_rate);
    new.subtotal := t.subtotal;
    new.tax_amount := t.tax_amount;
    new.icui_amount := public.purchase_icui_amount(v_icui_base, new.icui_rate);
    new.total := round(t.total + new.icui_amount, 2);
  end if;

  return new;
end;
$$;

-- El trigger ya apunta a la función; `create or replace` basta (el trigger
-- sigue referenciando `guard_purchase_invoice_write`).

revoke all on function public.purchase_icui_amount(numeric, numeric) from public, anon;
grant execute on function public.purchase_icui_amount(numeric, numeric) to authenticated;
