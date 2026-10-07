-- Prueba manual SIN persistir de:
--   20261007110200_invoices_paid_at.sql
--   20261007110300_finance_overview_real_cash.sql
--
-- DO que termina en RAISE: nada queda escrito. Completa las constantes con un
-- negocio que tenga ventas fiadas y abonos (v_ws = dueño, v_owner_ses = una
-- session_id de su membresía de dueño).
--
-- Resultado esperado (ensayado el 2026-10-07 contra producción, negocio con
-- ventas fiadas por $129.000 y abonos por $73.700):
--   paid_at: pendiente -> NULL; ->paid -> now(); ->pending -> NULL;
--            creada pagada con fecha vieja -> mediodía (Bogotá) de esa fecha
--   overview: sales_income = sales_billed − credit_issued
--             revenue = sales_income + abonos_income + invoices_income
--             suma de monthly.income = revenue (todo el historial en la ventana)
--   compra de prueba pagada hoy con issue_date de hace 40 días -> egreso del mes ACTUAL

do $test$
declare
  v_ws        uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_ses text := '00000000-0000-0000-0000-000000000000';
  v_out text := '';
  v_id uuid;
  a timestamptz; b timestamptz; c timestamptz; d timestamptz;
  o json;
  v_month_income numeric;
  v_month_expense_before numeric;
  v_month_expense_after numeric;
begin
  -- ---- paid_at ----
  insert into public.invoices (invoice_number, user_id, type, status, issue_date, total)
  values (999999, v_ws, 'factura', 'pending', current_date - 30, 10) returning id into v_id;
  select paid_at into a from public.invoices where id = v_id;
  update public.invoices set status = 'paid' where id = v_id;
  select paid_at into b from public.invoices where id = v_id;
  update public.invoices set status = 'pending' where id = v_id;
  select paid_at into c from public.invoices where id = v_id;
  insert into public.invoices (invoice_number, user_id, type, status, issue_date, total)
  values (999998, v_ws, 'factura', 'paid', current_date - 30, 10) returning id into v_id;
  select paid_at into d from public.invoices where id = v_id;
  delete from public.invoices where invoice_number in (999998, 999999) and user_id = v_ws;
  v_out := format('paid_at: pendiente=%s ->paid=%s ->pending=%s creada pagada=%s', a, b, c, d);

  -- ---- finance_overview (como el dueño) ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';
  o := public.finance_overview('America/Bogota', 240, null, null);
  select sum((m->>'income')::numeric) into v_month_income from json_array_elements(o->'monthly') m;
  v_month_expense_before := (select (m->>'expense')::numeric from json_array_elements(o->'monthly') m
                             where m->>'key' = to_char(now() at time zone 'America/Bogota', 'YYYY-MM'));
  v_out := v_out || format(' | billed=%s credit=%s sales_income=%s (cuadra=%s) abonos=%s facturas=%s revenue=%s (cuadra=%s) mensual=%s',
    o->>'sales_billed', o->>'credit_issued', o->>'sales_income',
    (o->>'sales_billed')::numeric - (o->>'credit_issued')::numeric = (o->>'sales_income')::numeric,
    o->>'abonos_income', o->>'invoices_income', o->>'revenue',
    (o->>'sales_income')::numeric + (o->>'abonos_income')::numeric + (o->>'invoices_income')::numeric = (o->>'revenue')::numeric,
    v_month_income);
  execute 'reset role';

  -- Compra emitida hace 40 días y pagada HOY: cae en el mes actual.
  insert into public.invoices (invoice_number, user_id, type, status, issue_date, total)
  values (999997, v_ws, 'compra', 'pending', current_date - 40, 777) returning id into v_id;
  update public.invoices set status = 'paid' where id = v_id;
  execute 'set local role authenticated';
  o := public.finance_overview('America/Bogota', 3, null, null);
  v_month_expense_after := (select (m->>'expense')::numeric from json_array_elements(o->'monthly') m
                            where m->>'key' = to_char(now() at time zone 'America/Bogota', 'YYYY-MM'));
  execute 'reset role';
  v_out := v_out || format(' | compra pagada hoy suma al mes actual: %s', v_month_expense_after - coalesce(v_month_expense_before, 0));

  raise exception 'RESULTADO (rollback): %', v_out;
end;
$test$;
