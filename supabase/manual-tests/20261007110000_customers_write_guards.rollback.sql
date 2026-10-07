-- Prueba manual SIN persistir de 20261007110000_customers_write_guards.sql.
--
-- Corre dentro de un DO que termina en RAISE: el resultado viaja en el mensaje
-- y NADA queda escrito. Completa las constantes con un negocio que tenga un
-- dueño y un trabajador con sesión elegida (workspace_session_selections) y
-- permiso `customers`.
--
-- Resultado esperado (ensayado el 2026-10-07 contra producción):
--   W insert con cupo -> CLIENTE_CAMPO_DE_DUENO
--   W insert simple -> ok
--   W update credit_balance -> permission denied
--   W update credit_limit -> CLIENTE_CAMPO_DE_DUENO
--   W update nombre (mandando el mismo cupo/exención) -> ok
--   W delete -> 0 filas (RLS: solo dueño)
--   O update credit_limit -> ok
--   O delete con saldo -> CLIENTE_CON_SALDO
--   O delete sin saldo -> 1 fila
--   anon insert -> permission denied

do $test$
declare
  v_ws        uuid := '00000000-0000-0000-0000-000000000000'; -- dueño = workspace
  v_owner_ses text := '00000000-0000-0000-0000-000000000000'; -- session del dueño
  v_worker    uuid := '00000000-0000-0000-0000-000000000000'; -- auth uid del trabajador
  v_worker_ses text := '00000000-0000-0000-0000-000000000000';
  v_out text := '';
  v_c uuid;
  v_n integer;
begin
  -- ---- trabajador ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', v_worker_ses)::text, true);
  execute 'set local role authenticated';

  begin
    insert into public.customers (full_name, credit_limit) values ('zz prueba cupo', 1000);
    v_out := v_out || ' | W insert con cupo SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | W insert con cupo -> ' || left(sqlerrm, 24);
  end;

  insert into public.customers (full_name, tax_exempt) values ('zz prueba guard', false) returning id into v_c;
  v_out := v_out || ' | W insert simple -> ok';

  begin
    update public.customers set credit_balance = 0 where id = v_c;
    v_out := v_out || ' | W update saldo SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | W update saldo -> ' || left(sqlerrm, 30);
  end;

  begin
    update public.customers set credit_limit = 5 where id = v_c;
    v_out := v_out || ' | W update cupo SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | W update cupo -> ' || left(sqlerrm, 24);
  end;

  update public.customers set full_name = 'zz prueba guard 2', credit_limit = null, tax_exempt = false where id = v_c;
  v_out := v_out || ' | W update nombre -> ok';

  delete from public.customers where id = v_c;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | W delete -> %s filas', v_n);

  -- ---- dueño ----
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';

  update public.customers set credit_limit = 50000, tax_exempt = true where id = v_c;
  v_out := v_out || ' | O update cupo -> ok';

  execute 'reset role';
  update public.customers set credit_balance = 1234 where id = v_c; -- como postgres
  execute 'set local role authenticated';
  begin
    delete from public.customers where id = v_c;
    v_out := v_out || ' | O delete con saldo SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | O delete con saldo -> ' || left(sqlerrm, 18);
  end;

  execute 'reset role';
  update public.customers set credit_balance = 0 where id = v_c;
  execute 'set local role authenticated';
  delete from public.customers where id = v_c;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | O delete sin saldo -> %s fila', v_n);

  -- ---- anónimo ----
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    insert into public.customers (full_name, user_id) values ('zz anon', v_ws);
    v_out := v_out || ' | anon insert SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | anon insert -> ' || left(sqlerrm, 30);
  end;
  execute 'reset role';

  raise exception 'RESULTADO (rollback):%', v_out;
end;
$test$;
