-- Totales del home agregados en la base: antes `fetchOverview` descargaba todo
-- el historial (y PostgREST lo cortaba en 1.000 filas). services/finance.service.ts
-- usa este RPC si existe y cae a la paginación si no.
--
-- security invoker (default): la RLS de sales/expenses/invoices sigue aplicando;
-- el filtro explícito por user_id es para el índice, no para seguridad.
-- Las cotizaciones no son plata: solo cuentan facturas (ingreso) y compras (egreso).
create or replace function public.finance_overview(
  p_tz text default 'America/Bogota',
  p_months int default 6,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns json
language sql stable
set search_path to ''
as $$
  with ws as (select public.get_effective_user_id() as uid),
  meses as (
    select to_char(m, 'YYYY-MM') as key, m::date as first_day
    from generate_series(
      date_trunc('month', (now() at time zone p_tz)) - make_interval(months => greatest(p_months, 1) - 1),
      date_trunc('month', (now() at time zone p_tz)),
      interval '1 month') as m
  ),
  ventas as (
    select s.id, s.sale_number, s.total, s.created_at, (s.created_at at time zone p_tz)::date as dia
    from public.sales s, ws
    where s.user_id = ws.uid and s.status = 'completed'
      and (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <  p_to)
  ),
  docs as (
    select i.id, i.invoice_number, i.type, i.total, i.issue_date
    from public.invoices i, ws
    where i.user_id = ws.uid and i.status = 'paid' and i.type in ('factura', 'compra')
      and (p_from is null or i.issue_date >= (p_from at time zone p_tz)::date)
      and (p_to   is null or i.issue_date <  (p_to   at time zone p_tz)::date)
  ),
  gastos as (
    select e.id, e.description, e.amount, e.expense_date, e.category_id
    from public.expenses e, ws
    where e.user_id = ws.uid
      and (p_from is null or e.expense_date >= (p_from at time zone p_tz)::date)
      and (p_to   is null or e.expense_date <  (p_to   at time zone p_tz)::date)
  ),
  movimientos as (
    select to_char(dia, 'YYYY-MM') as k, total as income, 0::numeric as expense from ventas
    union all select to_char(issue_date, 'YYYY-MM'), total, 0 from docs where type = 'factura'
    union all select to_char(expense_date, 'YYYY-MM'), 0, amount from gastos
    union all select to_char(issue_date, 'YYYY-MM'), 0, total from docs where type = 'compra'
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
      (select v.id, 'sale'::text as kind, 'Venta #' || v.sale_number as label, v.total as amount, v.created_at as ts, v.dia as day
         from ventas v order by v.created_at desc, v.id limit 8)
      union all
      (select d.id, 'sale', 'Factura #' || d.invoice_number, d.total, d.issue_date::timestamp at time zone p_tz, d.issue_date
         from docs d where d.type = 'factura' order by d.issue_date desc, d.id limit 8)
      union all
      (select d.id, 'expense', 'Compra #' || d.invoice_number, -d.total, d.issue_date::timestamp at time zone p_tz, d.issue_date
         from docs d where d.type = 'compra' order by d.issue_date desc, d.id limit 8)
      union all
      (select g.id, 'expense', g.description, -g.amount, g.expense_date::timestamp at time zone p_tz, g.expense_date
         from gastos g order by g.expense_date desc, g.id limit 8)
    ) r order by ts desc limit 8
  )
  select json_build_object(
    'revenue',  (select coalesce(sum(total), 0) from ventas) + (select coalesce(sum(total), 0) from docs where type = 'factura'),
    'expenses', (select coalesce(sum(amount), 0) from gastos) + (select coalesce(sum(total), 0) from docs where type = 'compra'),
    'sales_count', (select count(*) from ventas),
    'monthly',     (select coalesce(json_agg(json_build_object('key', key, 'income', income, 'expense', expense) order by first_day), '[]'::json) from mensual),
    'by_category', (select coalesce(json_agg(json_build_object('id', id, 'label', label, 'color', color, 'amount', amount) order by amount desc), '[]'::json) from categorias),
    'recent',      (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'label', label, 'amount', amount, 'date', ts, 'day', day) order by ts desc), '[]'::json) from recientes)
  );
$$;

revoke all on function public.finance_overview(text, int, timestamptz, timestamptz) from public, anon;
grant execute on function public.finance_overview(text, int, timestamptz, timestamptz) to authenticated;

-- sales ya tiene sales_company_activity_idx (user_id, created_at) WHERE completed.
create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index if not exists invoices_user_status_issue_idx on public.invoices (user_id, status, issue_date desc);
