-- Ticket promedio sin las ventas de total 0.
--
-- Una venta pagada entera con un premio (corte gratis, 100 % de descuento)
-- queda `completed` con total 0. Contarla en el divisor del ticket promedio lo
-- tira para abajo sin que haya entrado un peso: con 9 ventas de $30.000 y un
-- premio, el ticket daba $27.000.
--
-- - `finance_overview` suma `ticket_count` (ventas completadas con total > 0).
--   `sales_count` sigue siendo el conteo CRUDO —las ventas de premio existen,
--   se atendió a alguien—; el ticket se calcula sobre `ticket_count`.
-- - `sales_summary.avg_ticket` promedia solo las de total > 0, y expone
--   `ticket_count` por la misma razón. `completed_count` no cambia.
--
-- Mismo cuerpo vivo que 20261007110300 salvo esas claves.

create or replace function public.finance_overview(p_tz text default 'America/Bogota'::text, p_months integer default 6, p_from timestamp with time zone default null::timestamp with time zone, p_to timestamp with time zone default null::timestamp with time zone)
 returns json
 language sql
 stable
 set search_path to ''
as $function$
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
    -- Divisor del ticket promedio: sin las ventas de total 0 (premios).
    'ticket_count', (select count(*) from ventas where total > 0),
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

create or replace function public.sales_summary(p_from timestamp with time zone default null::timestamp with time zone, p_to timestamp with time zone default null::timestamp with time zone, p_customer text default null::text, p_payment_method text default null::text, p_transfer_method text default null::text, p_product_id uuid default null::uuid, p_service_id uuid default null::uuid, p_category_id uuid default null::uuid)
 returns json
 language sql
 stable
 set search_path to ''
as $function$
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
  lineas as (
    select li.quantity, li.line_total
    from public.sale_items li
    join completadas cp on cp.id = li.sale_id
    left join public.products pr on pr.id = li.product_id
    left join public.services sv on sv.id = li.service_id
    where (p_product_id is not null or p_service_id is not null or p_category_id is not null)
      and (p_product_id  is null or li.product_id = p_product_id)
      and (p_service_id  is null or li.service_id = p_service_id)
      and (p_category_id is null or coalesce(pr.category_id, sv.category_id) = p_category_id)
  )
  select json_build_object(
    'sales_count',     (select count(*) from scoped),
    'revenue',         (select coalesce(sum(total), 0) from completadas),
    'completed_count', (select count(*) from completadas),
    -- Las ventas de total 0 (premio canjeado entero) no entran al promedio.
    'ticket_count',    (select count(*) from completadas where total > 0),
    'avg_ticket',      (select coalesce(avg(total) filter (where total > 0), 0) from completadas),
    'item_units',      (select coalesce(sum(quantity), 0) from lineas),
    'item_revenue',    (select coalesce(sum(line_total), 0) from lineas),
    'item_avg_price',  (select case when coalesce(sum(quantity), 0) > 0
                                    then sum(line_total) / sum(quantity)
                                    else 0 end
                        from lineas)
  );
$function$;
