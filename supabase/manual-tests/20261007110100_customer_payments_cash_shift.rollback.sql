-- Prueba manual SIN persistir de 20261007110100_customer_payments_cash_shift.sql.
--
-- DO que termina en RAISE: nada queda escrito. Completa las constantes con un
-- negocio que tenga un trabajador (permiso customers + pos) con turno ABIERTO y
-- un dueño SIN turno propio, y un cliente cualquiera (se le pone deuda adentro
-- de la prueba).
--
-- Resultado esperado (ensayado el 2026-10-07 contra producción):
--   W efectivo -> saldo 90000, sellado en su turno
--   W reintento mismo id -> saldo 90000, 1 fila
--   W mismo id otro monto -> ABONO_ID_REPETIDO
--   W transferencia -> sin turno
--   W credito -> METODO_DE_PAGO_INVALIDO
--   W current_shift: cash_abonos = 10000 (+ lo previo), esperado = base + cash_in + abonos - retiros
--   O efectivo (sin turno propio, uno abierto en el negocio) -> sellado en ese turno
--   W sin turno, efectivo -> ABONO_SIN_TURNO
--   W INSERT directo en customer_payments -> permission denied
--   W close_shift con el esperado -> diferencia 0 y snapshot cash_abonos

do $test$
declare
  v_ws         uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_ses  text := '00000000-0000-0000-0000-000000000000';
  v_worker     uuid := '00000000-0000-0000-0000-000000000000';
  v_worker_ses text := '00000000-0000-0000-0000-000000000000';
  v_shift      uuid := '00000000-0000-0000-0000-000000000000'; -- turno abierto del trabajador
  v_customer   uuid := '00000000-0000-0000-0000-000000000000';
  v_out text := '';
  v_bal numeric;
  v_id uuid := gen_random_uuid();
  v_cur json;
  v_closed json;
begin
  update public.customers set credit_balance = 100000 where id = v_customer;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', v_worker_ses)::text, true);
  execute 'set local role authenticated';

  v_bal := public.register_customer_payment(v_customer, 10000, 'prueba', 'efectivo', v_id);
  v_out := v_out || format(' | W efectivo -> saldo %s turno=%s', v_bal,
    (select shift_id = v_shift from public.customer_payments where client_payment_id = v_id));

  v_bal := public.register_customer_payment(v_customer, 10000, 'prueba', 'efectivo', v_id);
  v_out := v_out || format(' | W reintento -> saldo %s filas=%s', v_bal,
    (select count(*) from public.customer_payments where client_payment_id = v_id));

  begin
    perform public.register_customer_payment(v_customer, 999, null, 'efectivo', v_id);
    v_out := v_out || ' | W mismo id otro monto SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | W mismo id otro monto -> ' || left(sqlerrm, 17);
  end;

  v_bal := public.register_customer_payment(v_customer, 5000, null, 'transferencia', null);
  v_out := v_out || format(' | W transferencia -> saldo %s turno=%s', v_bal,
    (select shift_id from public.customer_payments where customer_id = v_customer order by created_at desc, payment_method desc limit 1));

  begin
    perform public.register_customer_payment(v_customer, 1000, null, 'credito', null);
    v_out := v_out || ' | W credito SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | W credito -> ' || left(sqlerrm, 23);
  end;

  v_cur := public.current_shift();
  v_out := v_out || format(' | W current: base=%s cash_in=%s abonos=%s retiros=%s esperado=%s kinds=%s',
    v_cur->>'opening_cash', v_cur->>'cash_in', v_cur->>'cash_abonos', v_cur->>'withdrawals_total',
    v_cur->>'expected_cash', v_cur->>'movements_by_kind');

  begin
    insert into public.customer_payments (customer_id, amount, payment_method, shift_id)
    values (v_customer, 1, 'efectivo', v_shift);
    v_out := v_out || ' | W insert directo SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | W insert directo -> ' || left(sqlerrm, 30);
  end;

  -- Dueño sin turno propio: sella el único abierto.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';
  v_bal := public.register_customer_payment(v_customer, 2000, null, 'efectivo', null);
  v_out := v_out || format(' | O efectivo -> saldo %s turno=%s', v_bal,
    (select shift_id = v_shift from public.customer_payments where customer_id = v_customer and amount = 2000 order by created_at desc limit 1));

  -- Cierre del trabajador con el esperado exacto.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', v_worker_ses)::text, true);
  execute 'set local role authenticated';
  v_cur := public.current_shift();
  v_closed := public.close_shift((v_cur->>'expected_cash')::numeric, null, null);
  v_out := v_out || format(' | W close: esperado=%s diferencia=%s abonos=%s',
    v_closed->>'expected_cash', v_closed->>'difference', v_closed->>'cash_abonos');
  execute 'reset role';
  v_out := v_out || format(' | snapshot: cash_sales=%s cash_abonos=%s kinds=%s',
    (select cash_sales from public.shifts where id = v_shift),
    (select cash_abonos from public.shifts where id = v_shift),
    (select movements_by_kind from public.shifts where id = v_shift));

  -- Ya sin turno: el trabajador no puede recibir efectivo.
  execute 'set local role authenticated';
  begin
    perform public.register_customer_payment(v_customer, 1000, null, 'efectivo', null);
    v_out := v_out || ' | W sin turno SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | W sin turno -> ' || left(sqlerrm, 15);
  end;
  execute 'reset role';

  raise exception 'RESULTADO (rollback):%', v_out;
end;
$test$;
