-- Prueba manual SIN persistir de:
--   20261007150100_ticket_count_excludes_zero_total.sql
--
-- DO que termina en RAISE: nada queda escrito. Completa v_ws (dueño),
-- v_owner_mem (su membresía de dueño) y
-- v_owner_ses (una session_id de esa membresía).
--
-- Siembra una venta completada de total 0 (premio canjeado entero) y compara:
--   finance_overview: sales_count sube en 1, ticket_count NO.
--   sales_summary:    completed_count sube en 1, ticket_count y avg_ticket NO.

do $test$
declare
  v_ws        uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_mem uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_ses text := '00000000-0000-0000-0000-000000000000';
  a json; b json; sa json; sb json;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';
  a  := public.finance_overview('America/Bogota', 1, now() - interval '1 day', now() + interval '1 day');
  sa := public.sales_summary(now() - interval '1 day', now() + interval '1 day');
  execute 'reset role';

  insert into public.sales (user_id, membership_id, total, subtotal, tax_amount, payment_method, status)
  values (v_ws, v_owner_mem, 0, 0, 0, 'efectivo', 'completed');

  execute 'set local role authenticated';
  b  := public.finance_overview('America/Bogota', 1, now() - interval '1 day', now() + interval '1 day');
  sb := public.sales_summary(now() - interval '1 day', now() + interval '1 day');
  execute 'reset role';

  raise exception 'ROLLBACK (prueba): overview sales_count %->% ticket_count %->% | summary completed %->% ticket %->% avg %->%',
    a->>'sales_count', b->>'sales_count', a->>'ticket_count', b->>'ticket_count',
    sa->>'completed_count', sb->>'completed_count', sa->>'ticket_count', sb->>'ticket_count',
    sa->>'avg_ticket', sb->>'avg_ticket';
end;
$test$;
