-- Compras: congelar por línea cuánto stock se aplicó.
--
-- `replace_purchase_invoice_items` y `cancel_purchase_invoice` decidían si
-- mover stock mirando el `tracks_stock` ACTUAL del producto. Si el negocio
-- activaba o desactivaba el control de stock después de la compra, editarla o
-- anularla restaba unidades que nunca se sumaron (o no restaba las que sí).
--
-- `invoice_items.stock_qty_applied` guarda las unidades que esa línea sumó al
-- stock al guardarse (0 si el producto no controla stock o la línea no tiene
-- producto). Editar/anular revierte EXACTAMENTE eso. NULL = línea anterior a
-- esta migración que no se pudo reconstruir: cae a la regla vieja (tracks_stock
-- actual).
--
-- Backfill desde `inventory_movements` (reference_type 'purchase', que es lo
-- único que escriben estas funciones): medido antes de aplicar, las 17 líneas
-- con producto tenían su movimiento y coincidían con la cantidad.

alter table public.invoice_items
  add column if not exists stock_qty_applied numeric(12,3);

comment on column public.invoice_items.stock_qty_applied is
  'Compras: unidades que esta línea sumó al stock al guardarse. NULL = legado (se usa tracks_stock actual).';

with lines as (
  select ii.invoice_id, ii.product_id, sum(ii.quantity) as q, count(*) as n
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id and i.type = 'compra'
   where ii.product_id is not null
   group by ii.invoice_id, ii.product_id
),
mv as (
  select m.reference_id as invoice_id, m.product_id,
         sum(case when m.type = 'in' then m.quantity else -m.quantity end) as net
    from public.inventory_movements m
   where m.reference_type = 'purchase'
   group by m.reference_id, m.product_id
),
resolved as (
  select l.invoice_id, l.product_id, l.n, l.q, mv.net
    from lines l
    join mv on mv.invoice_id = l.invoice_id and mv.product_id = l.product_id
)
update public.invoice_items ii
   set stock_qty_applied = case
         when r.net = r.q then ii.quantity
         when r.net = 0   then 0
         else r.net               -- solo llega acá con una sola línea (filtro abajo)
       end
  from resolved r
 where ii.invoice_id = r.invoice_id
   and ii.product_id = r.product_id
   and ii.stock_qty_applied is null
   and (r.net = r.q or r.net = 0 or r.n = 1);

-- Líneas sin producto nunca movieron stock.
update public.invoice_items ii
   set stock_qty_applied = 0
  from public.invoices i
 where i.id = ii.invoice_id
   and i.type = 'compra'
   and ii.product_id is null
   and ii.stock_qty_applied is null;

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
  v_products       uuid[];
  v_is_new         boolean;
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

  select not exists (select 1 from public.invoice_items ii where ii.invoice_id = p_invoice_id)
    into v_is_new;

  -- Lo que las líneas de ANTES sumaron al stock: lo congelado; en líneas de
  -- legado (NULL), la regla vieja con el tracks_stock actual.
  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_old
    from (
      select ii.product_id,
             sum(coalesce(ii.stock_qty_applied,
                          case when coalesce(pr.tracks_stock, true) then ii.quantity else 0 end)) as qty
        from public.invoice_items ii
        left join public.products pr on pr.id = ii.product_id and pr.user_id = v_tenant
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) antes;

  v_nota := case when v_is_new then 'Compra #' else 'Edición de compra #' end
         || v_invoice_number;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  -- `line_total` lo calcula la base (cajas × precio de caja + sueltas × precio
  -- unitario), igual que `lineTotalOf`. El del cliente se ignora.
  -- `stock_qty_applied` se congela con el tracks_stock de HOY.
  insert into public.invoice_items (
    user_id, invoice_id, product_id, description,
    quantity, package_quantity, unit_price, package_price, line_total,
    units_per_package, stock_qty_applied
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
    case
      when x.product_id is null then 0
      when coalesce(pr.tracks_stock, true) then round(x.quantity, 3)
      else 0
    end
  from (
    select nullif(item->>'product_id', '')::uuid                         as product_id,
           item->>'description'                                          as description,
           (item->>'quantity')::numeric                                  as quantity,
           coalesce((item->>'package_quantity')::numeric, 0)             as package_quantity,
           coalesce((item->>'unit_price')::numeric, 0)                   as unit_price,
           coalesce((item->>'package_price')::numeric, 0)                as package_price,
           greatest(coalesce((item->>'units_per_package')::integer, 1), 1) as units_per_package
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
  ) x
  left join public.products pr on pr.id = x.product_id and pr.user_id = v_tenant;

  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_new
    from (
      select ii.product_id, sum(ii.stock_qty_applied) as qty
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

    perform 1
      from public.products pr
     where pr.id = v_row.product_id
       and pr.user_id = v_tenant
     for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    -- Sin mirar tracks_stock: el delta ya sale de lo que se aplicó de verdad.
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

create or replace function public.cancel_purchase_invoice(p_invoice_id uuid)
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
  v_row            record;
  v_qty            numeric(12,3);
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
    raise exception 'La compra ya está anulada' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  perform set_config('app.cancelling_purchase', 'on', true);
  update public.invoices set status = 'cancelled' where id = p_invoice_id;
  perform set_config('app.cancelling_purchase', 'off', true);

  -- Se devuelve lo que la compra SUMÓ (congelado por línea), no lo que diría
  -- el tracks_stock de hoy. Legado (NULL): regla vieja.
  for v_row in
    select ii.product_id,
           sum(coalesce(ii.stock_qty_applied,
                        case when coalesce(pr.tracks_stock, true) then ii.quantity else 0 end)) as qty
      from public.invoice_items ii
      left join public.products pr on pr.id = ii.product_id and pr.user_id = v_tenant
     where ii.invoice_id = p_invoice_id
       and ii.product_id is not null
     group by ii.product_id
  loop
    v_qty := round(v_row.qty, 3);
    continue when v_qty = 0;

    perform 1
      from public.products pr
     where pr.id = v_row.product_id
       and pr.user_id = v_tenant
     for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    update public.products
       set stock_level = stock_level - v_qty
     where id = v_row.product_id
       and user_id = v_tenant;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_actor, v_row.product_id,
      case when v_qty > 0 then 'out' else 'in' end,
      abs(v_qty), 'cancellation', p_invoice_id,
      'Anulación de compra #' || v_invoice_number
    );
  end loop;
end;
$function$;
