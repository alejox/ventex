-- Historial de ventas: filtrar por producto/servicio y por categoría.
--
-- El pedido era "filtrar por producto para analizar sus ventas", y ahí hay una
-- trampa: una venta es una CABECERA con varias líneas. Filtrar las ventas que
-- contienen una gaseosa y después mostrar el total de esas ventas dice cuánto
-- gastó quien compró gaseosa, NO cuánto se vendió de gaseosa. Si el cliente se
-- llevó una gaseosa de $3.000 dentro de una compra de $200.000, el KPI diría
-- $200.000.
--
-- Por eso el resumen devuelve DOS familias de números y la pantalla elige cuál
-- muestra: los de la venta (los de siempre) y los del ÍTEM filtrado —unidades,
-- plata de esas líneas y precio promedio—, que se calculan sobre `sale_items`.
--
-- El listado pasa a resolverse en la base por la misma razón por la que ya se
-- resolvía ahí el resumen: la tabla se pagina, y filtrar por una línea desde el
-- cliente obligaría a traer las ventas completas para descartarlas después.
-- Además saca de encima las dos variantes literales del `select` de PostgREST
-- que había que mantener en espejo (`LIST_SELECT` y `LIST_SELECT_WITH_CUSTOMER`).
--
-- Las dos funciones son `stable` y NO `security definer`, igual que la
-- `sales_summary` anterior: las policies de `sales` y `sale_items` siguen
-- aplicando y la tenencia no se toca.

-- ---------------------------------------------------------------------------
-- Resumen: los KPIs del período, con las métricas del ítem filtrado
-- ---------------------------------------------------------------------------

drop function if exists public.sales_summary(timestamptz, timestamptz, text, text, text);

create or replace function public.sales_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_customer text default null,
  p_payment_method text default null,
  p_transfer_method text default null,
  p_product_id uuid default null,
  p_service_id uuid default null,
  p_category_id uuid default null
)
returns json
language sql
stable
set search_path to ''
as $$
  with filtro as (
    select case
      when p_customer is null or btrim(p_customer) = '' then null
      else '%' || replace(replace(replace(btrim(p_customer), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as patron
  ),
  scoped as (
    select s.id, s.status, s.total
    from public.sales s
    left join public.customers c on c.id = s.customer_id
    cross join filtro f
    where (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <  p_to)
      and (f.patron is null or c.full_name ilike f.patron)
      and (p_payment_method is null or s.payment_method = p_payment_method)
      and (p_transfer_method is null or s.transfer_method = p_transfer_method)
      -- El filtro de ítem se escribe INLINE y no contra una CTE de líneas: así
      -- queda correlacionado por venta y el planner puede cortar en la primera
      -- coincidencia, en vez de materializar todas las líneas del período.
      and (
        (p_product_id is null and p_service_id is null and p_category_id is null)
        or exists (
          select 1
          from public.sale_items li
          left join public.products pr on pr.id = li.product_id
          left join public.services sv on sv.id = li.service_id
          where li.sale_id = s.id
            and (p_product_id  is null or li.product_id = p_product_id)
            and (p_service_id  is null or li.service_id = p_service_id)
            and (p_category_id is null or coalesce(pr.category_id, sv.category_id) = p_category_id)
        )
      )
  ),
  completadas as (
    select id, total from scoped where status = 'completed'
  ),
  -- Las líneas del ítem filtrado, solo de ventas COMPLETADAS: una venta anulada
  -- no vendió nada, y sumarla infla las unidades del producto.
  lineas as (
    select li.quantity, li.line_total
    from public.sale_items li
    join completadas cp on cp.id = li.sale_id
    left join public.products pr on pr.id = li.product_id
    left join public.services sv on sv.id = li.service_id
    -- Sin filtro de ítem NO hay nada que medir, y esta guarda evita recorrer
    -- todas las líneas del período. La pantalla de Ventas se abre sin filtro
    -- casi siempre: sin el corte, cada visita paga un escaneo de `sale_items`
    -- para calcular tres números que nadie va a mirar.
    where (p_product_id is not null or p_service_id is not null or p_category_id is not null)
      and (p_product_id  is null or li.product_id = p_product_id)
      and (p_service_id  is null or li.service_id = p_service_id)
      and (p_category_id is null or coalesce(pr.category_id, sv.category_id) = p_category_id)
  )
  select json_build_object(
    'sales_count',     (select count(*) from scoped),
    'revenue',         (select coalesce(sum(total), 0) from completadas),
    'completed_count', (select count(*) from completadas),
    'avg_ticket',      (select coalesce(avg(total), 0) from completadas),
    -- Solo tienen sentido con un filtro de ítem activo; sin él la pantalla los
    -- ignora y muestra los de arriba.
    'item_units',      (select coalesce(sum(quantity), 0) from lineas),
    'item_revenue',    (select coalesce(sum(line_total), 0) from lineas),
    'item_avg_price',  (select case when coalesce(sum(quantity), 0) > 0
                                    then sum(line_total) / sum(quantity)
                                    else 0 end
                        from lineas)
  );
$$;

grant execute on function public.sales_summary(timestamptz, timestamptz, text, text, text, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Listado: una página del historial, con lo que aportó el ítem en cada venta
-- ---------------------------------------------------------------------------

create or replace function public.sales_page(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_customer text default null,
  p_payment_method text default null,
  p_transfer_method text default null,
  p_product_id uuid default null,
  p_service_id uuid default null,
  p_category_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns json
language sql
stable
set search_path to ''
as $$
  with filtro as (
    select case
      when p_customer is null or btrim(p_customer) = '' then null
      else '%' || replace(replace(replace(btrim(p_customer), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as patron
  ),
  scoped as (
    select s.*, c.full_name as customer_name
    from public.sales s
    left join public.customers c on c.id = s.customer_id
    cross join filtro f
    where (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <  p_to)
      and (f.patron is null or c.full_name ilike f.patron)
      and (p_payment_method is null or s.payment_method = p_payment_method)
      and (p_transfer_method is null or s.transfer_method = p_transfer_method)
      and (
        (p_product_id is null and p_service_id is null and p_category_id is null)
        or exists (
          select 1
          from public.sale_items li
          left join public.products pr on pr.id = li.product_id
          left join public.services sv on sv.id = li.service_id
          where li.sale_id = s.id
            and (p_product_id  is null or li.product_id = p_product_id)
            and (p_service_id  is null or li.service_id = p_service_id)
            and (p_category_id is null or coalesce(pr.category_id, sv.category_id) = p_category_id)
        )
      )
  ),
  pagina as (
    select * from scoped
    order by created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0)
  ),
  filas as (
    select
      pg.id,
      pg.sale_number,
      pg.created_at,
      pg.customer_name,
      pg.payment_method,
      pg.transfer_method,
      pg.card_method,
      pg.status,
      pg.subtotal,
      pg.discount_amount,
      pg.tax_amount,
      pg.total,
      (select count(*) from public.sale_items li where li.sale_id = pg.id) as item_count,
      -- Lo que aportó el ítem filtrado A ESTA venta. Sin filtro quedan en cero
      -- y la pantalla no dibuja la columna.
      (select coalesce(sum(li.quantity), 0)
       from public.sale_items li
       left join public.products pr on pr.id = li.product_id
       left join public.services sv on sv.id = li.service_id
       where li.sale_id = pg.id
         and (p_product_id  is null or li.product_id = p_product_id)
         and (p_service_id  is null or li.service_id = p_service_id)
         and (p_category_id is null or coalesce(pr.category_id, sv.category_id) = p_category_id)
         and (p_product_id is not null or p_service_id is not null or p_category_id is not null)
      ) as item_units,
      (select coalesce(sum(li.line_total), 0)
       from public.sale_items li
       left join public.products pr on pr.id = li.product_id
       left join public.services sv on sv.id = li.service_id
       where li.sale_id = pg.id
         and (p_product_id  is null or li.product_id = p_product_id)
         and (p_service_id  is null or li.service_id = p_service_id)
         and (p_category_id is null or coalesce(pr.category_id, sv.category_id) = p_category_id)
         and (p_product_id is not null or p_service_id is not null or p_category_id is not null)
      ) as item_total
    from pagina pg
  )
  select json_build_object(
    -- El total es del PERÍODO filtrado, no de la página: es lo que pagina.
    'total', (select count(*) from scoped),
    -- El ORDER BY va DENTRO de json_agg: el de un CTE no se hereda, y sin esto
    -- el historial sale en el orden que se le ocurra al planner.
    'items', coalesce(
      (select json_agg(row_to_json(f) order by f.created_at desc) from filas f),
      '[]'::json
    )
  );
$$;

grant execute on function public.sales_page(timestamptz, timestamptz, text, text, text, uuid, uuid, uuid, int, int) to authenticated;

-- El filtro por ítem entra por `sale_items.sale_id` en un EXISTS correlacionado,
-- y las métricas por `product_id` / `service_id`. Sin estos índices cada venta
-- de la página dispara un scan de la tabla de líneas.
create index if not exists sale_items_product_idx
  on public.sale_items (user_id, product_id)
  where product_id is not null;

create index if not exists sale_items_service_idx
  on public.sale_items (user_id, service_id)
  where service_id is not null;
