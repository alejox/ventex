-- =====================================================================
-- Comparador de precios por proveedor: último costo unitario por
-- (producto, proveedor) desde el historial de compras no anuladas.
--
-- La cuenta del "costo unitario" es la misma que `sync_products_last_cost`:
-- si la línea se compró por caja (package_quantity > 0 y package_price > 0),
-- el costo por unidad es `package_price / units_per_package`; si no, el
-- `unit_price` suelto. De cada par (producto, proveedor) se toma el ÚLTIMO
-- (por issue_date, luego created_at): el precio que rige hoy, no el mínimo
-- histórico ni un promedio.
--
-- Sirve a dos pantallas:
--   - la sección de comparación (qué proveedor es más barato);
--   - la alerta de compra (si el precio ingresado supera al de otro proveedor).
-- =====================================================================

create or replace function public.product_prices_by_distributor(
  p_product_ids uuid[] default null
)
returns table (
  product_id        uuid,
  distributor_id    uuid,
  distributor_name  text,
  unit_cost         numeric,
  last_purchase_at  timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with lines as (
    select
      ii.product_id,
      i.distributor_id,
      case
        when ii.package_quantity > 0 and ii.package_price > 0
          then ii.package_price / greatest(ii.units_per_package, 1)
        when ii.quantity - ii.package_quantity * greatest(ii.units_per_package, 1) > 0
             and ii.unit_price > 0
          then ii.unit_price
      end as unit_cost,
      i.issue_date,
      i.created_at
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.type = 'compra'
      and i.status <> 'cancelled'
      and i.user_id = public.get_effective_user_id()
      and ii.product_id is not null
      and (p_product_ids is null or ii.product_id = any (p_product_ids))
  ),
  ranked as (
    select distinct on (product_id, distributor_id)
      product_id, distributor_id, unit_cost, created_at
    from lines
    where unit_cost is not null
    order by product_id, distributor_id, issue_date desc, created_at desc
  )
  select
    r.product_id,
    r.distributor_id,
    d.business_name as distributor_name,
    round(r.unit_cost, 2) as unit_cost,
    r.created_at as last_purchase_at
  from ranked r
  join public.distributors d on d.id = r.distributor_id
  order by r.product_id, r.unit_cost asc;
$$;

revoke all on function public.product_prices_by_distributor(uuid[]) from public, anon;
grant execute on function public.product_prices_by_distributor(uuid[]) to authenticated;
