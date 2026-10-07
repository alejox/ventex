-- finance_overview: "Flujo de caja" pasa a ser CAJA de verdad.
--
-- Antes, ingresos = sales.total de toda venta completada. Una venta fiada
-- contaba como plata entrada el día que se fió, y el abono que la pagaba
-- después no contaba nunca: el flujo se adelantaba y, para el abono, mentía.
--
-- Ahora, ingresos del período =
--   * lo COBRADO al vender: sale_payments sin 'credito' (un pago dividido
--     efectivo + fiado solo suma el efectivo). Ventas viejas sin filas de pago:
--     sales.total, salvo que su payment_method sea 'credito'.
--   * + abonos de fiado (customer_payments) por su created_at en la zona del
--     negocio.
--   * + facturas de venta pagadas, por paid_at (ya no issue_date).
-- Egresos: gastos por expense_date (igual que antes) + compras pagadas por
-- paid_at (antes issue_date). Las ventas anuladas siguen fuera.
--
-- Campos nuevos (los viejos se conservan con el mismo nombre y forma):
--   sales_income, abonos_income, invoices_income — las tres partes de revenue.
--   sales_billed  — lo facturado en el POS (sum(total)), para contexto.
--   credit_issued — lo que se fió en el período (facturado − cobrado al vender).
BEGIN;

CREATE OR REPLACE FUNCTION public.finance_overview(
  p_tz text DEFAULT 'America/Bogota'::text,
  p_months integer DEFAULT 6,
  p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_to timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS json
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  with ws as (select public.get_effective_user_id() as uid),
  meses as (
    select to_char(m, 'YYYY-MM') as key, m::date as first_day
    from generate_series(
      date_trunc('month', (now() at time zone p_tz)) - make_interval(months => greatest(p_months, 1) - 1),
      date_trunc('month', (now() at time zone p_tz)),
      interval '1 month') as m
  ),
  ventas as (
    select s.id, s.sale_number, s.total, s.created_at, (s.created_at at time zone p_tz)::date as dia,
           case
             when pay.n > 0 then pay.received
             when s.payment_method = 'credito' then 0
             else s.total
           end as received
    from public.sales s
    cross join ws
    left join lateral (
      select count(*) as n,
             coalesce(sum(p.amount) filter (where p.payment_method <> 'credito'), 0) as received
      from public.sale_payments p
      where p.sale_id = s.id and p.user_id = ws.uid
    ) pay on true
    where s.user_id = ws.uid and s.status = 'completed'
      and (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <  p_to)
  ),
  abonos as (
    select cp.id, cp.amount, cp.created_at, (cp.created_at at time zone p_tz)::date as dia, c.full_name
    from public.customer_payments cp
    cross join ws
    left join public.customers c on c.id = cp.customer_id
    where cp.user_id = ws.uid
      and (p_from is null or cp.created_at >= p_from)
      and (p_to   is null or cp.created_at <  p_to)
  ),
  docs as (
    select i.id, i.invoice_number, i.type, i.total, i.paid_at, (i.paid_at at time zone p_tz)::date as dia
    from public.invoices i, ws
    where i.user_id = ws.uid and i.status = 'paid' and i.type in ('factura', 'compra')
      and i.paid_at is not null
      and (p_from is null or i.paid_at >= p_from)
      and (p_to   is null or i.paid_at <  p_to)
  ),
  gastos as (
    select e.id, e.description, e.amount, e.expense_date, e.category_id
    from public.expenses e, ws
    where e.user_id = ws.uid
      and (p_from is null or e.expense_date >= (p_from at time zone p_tz)::date)
      and (p_to   is null or e.expense_date <  (p_to   at time zone p_tz)::date)
  ),
  movimientos as (
    select to_char(dia, 'YYYY-MM') as k, received as income, 0::numeric as expense from ventas
    union all select to_char(dia, 'YYYY-MM'), amount, 0 from abonos
    union all select to_char(dia, 'YYYY-MM'), total, 0 from docs where type = 'factura'
    union all select to_char(expense_date, 'YYYY-MM'), 0, amount from gastos
    union all select to_char(dia, 'YYYY-MM'), 0, total from docs where type = 'compra'
  ),
  mensual as (
    select m.key, m.first_day, coalesce(sum(mv.income), 0) as income, coalesce(sum(mv.expense), 0) as expense
    from meses m left join movimientos mv on mv.k = m.key
    group by m.key, m.first_day
  ),
  categorias as (
    select coalesce(c.id::text, 'sin-categoria') as id, coalesce(c.name, 'Sin categoría') as label,
           coalesce(c.color, '#94a3b8') as color, sum(g.amount) as amount
    from gastos g left join public.expense_categories c on c.id = g.category_id
    group by 1, 2, 3
    union all
    select 'compras', 'Compras a proveedores', '#6366f1', sum(total) from docs where type = 'compra' having sum(total) > 0
  ),
  recientes as (
    select * from (
      (select v.id, 'sale'::text as kind, 'Venta #' || v.sale_number as label, v.received as amount, v.created_at as ts, v.dia as day
         from ventas v where v.received > 0 order by v.created_at desc, v.id limit 8)
      union all
      (select a.id, 'sale', 'Abono de ' || coalesce(a.full_name, 'cliente'), a.amount, a.created_at, a.dia
         from abonos a order by a.created_at desc, a.id limit 8)
      union all
      (select d.id, 'sale', 'Factura #' || d.invoice_number, d.total, d.paid_at, d.dia
         from docs d where d.type = 'factura' order by d.paid_at desc, d.id limit 8)
      union all
      (select d.id, 'expense', 'Compra #' || d.invoice_number, -d.total, d.paid_at, d.dia
         from docs d where d.type = 'compra' order by d.paid_at desc, d.id limit 8)
      union all
      (select g.id, 'expense', g.description, -g.amount, g.expense_date::timestamp at time zone p_tz, g.expense_date
         from gastos g order by g.expense_date desc, g.id limit 8)
    ) r order by ts desc limit 8
  ),
  totales as (
    select
      (select coalesce(sum(received), 0) from ventas) as sales_income,
      (select coalesce(sum(amount), 0) from abonos) as abonos_income,
      (select coalesce(sum(total), 0) from docs where type = 'factura') as invoices_income,
      (select coalesce(sum(total), 0) from ventas) as sales_billed,
      (select coalesce(sum(total - received), 0) from ventas) as credit_issued
  )
  select json_build_object(
    'revenue',  t.sales_income + t.abonos_income + t.invoices_income,
    'expenses', (select coalesce(sum(amount), 0) from gastos) + (select coalesce(sum(total), 0) from docs where type = 'compra'),
    'sales_count', (select count(*) from ventas),
    'sales_income', t.sales_income,
    'abonos_income', t.abonos_income,
    'invoices_income', t.invoices_income,
    'sales_billed', t.sales_billed,
    'credit_issued', t.credit_issued,
    'monthly',     (select coalesce(json_agg(json_build_object('key', key, 'income', income, 'expense', expense) order by first_day), '[]'::json) from mensual),
    'by_category', (select coalesce(json_agg(json_build_object('id', id, 'label', label, 'color', color, 'amount', amount) order by amount desc), '[]'::json) from categorias),
    'recent',      (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'label', label, 'amount', amount, 'date', ts, 'day', day) order by ts desc), '[]'::json) from recientes)
  )
  from totales t;
$function$;

COMMIT;
