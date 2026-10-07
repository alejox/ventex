-- Prueba manual SIN persistir de:
--   20261007150000_shifts_own_close_rounding_visibility.sql
--
-- DO que termina en RAISE: nada queda escrito. Completa las constantes con un
-- negocio que tenga un trabajador con turno ABIERTO:
--   v_ws          = dueño (workspace)
--   v_owner_mem   = membresía del dueño,   v_owner_ses = una session_id suya
--   v_worker_uid  = auth uid del trabajador
--   v_worker_mem  = membresía del trabajador, v_worker_ses = una session_id suya
--
-- Resultado esperado (ensayado el 2026-10-07 contra producción):
--   sin pos: current_shift != null, otro turno con p_shift_id -> OWNER_REQUIRED,
--   el trabajador ve solo SUS turnos y el dueño ve todos (+1 sembrado),
--   close_shift(esperado + 0.004) sin nota -> cierra con diferencia 0.00,
--   close_shift(esperado + 0.006) -> JUSTIFICACION_REQUERIDA (0.01 sí descuadra),
--   TRUNCATE/TRIGGER/REFERENCES en shifts y cash_movements = false.

do $test$
declare
  v_ws         uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_mem  uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_ses  text := '00000000-0000-0000-0000-000000000000';
  v_worker_uid uuid := '00000000-0000-0000-0000-000000000000';
  v_worker_mem uuid := '00000000-0000-0000-0000-000000000000';
  v_worker_ses text := '00000000-0000-0000-0000-000000000000';
  v_out text := '';
  v_fake uuid;
  cur json;
  res json;
  v_expected numeric;
  v_worker_sees int;
  v_owner_sees int;
  v_err text;
begin
  -- Se le quita `pos` al trabajador a mitad de turno.
  update public.workspace_memberships
  set permissions = coalesce(permissions, '{}'::jsonb) || '{"pos": false}'::jsonb
  where id = v_worker_mem;

  -- Un turno del dueño que el trabajador NO debería ver.
  insert into public.shifts (user_id, worker_id, membership_id, opening_cash, status, closed_at)
  values (v_ws, v_ws, v_owner_mem, 0, 'closed', now())
  returning id into v_fake;

  -- ---- Como el trabajador ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker_uid, 'role', 'authenticated', 'session_id', v_worker_ses)::text, true);
  execute 'set local role authenticated';

  cur := public.current_shift();
  v_out := format('sin pos: current_shift=%s', cur is not null);

  begin
    perform public.close_shift(0, 'x', v_fake);
    v_out := v_out || ' | cerrar ajeno=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | cerrar ajeno=' || sqlerrm;
  end;

  select count(*) into v_worker_sees from public.shifts;
  v_out := v_out || format(' | trabajador ve %s turnos (suyos=%s)', v_worker_sees,
    (select count(*) from public.shifts where membership_id = v_worker_mem));

  v_expected := (cur->>'expected_cash')::numeric;

  begin
    perform public.close_shift(v_expected + 0.006, null, null);
    v_out := v_out || ' | +0.006 sin nota=CERRÓ (MAL)';
  exception when others then
    v_out := v_out || ' | +0.006 sin nota=' || sqlerrm;
  end;

  res := public.close_shift(v_expected + 0.004, null, null);
  v_out := v_out || format(' | +0.004 sin nota: contado=%s esperado=%s diferencia=%s',
    res->>'closing_cash', res->>'expected_cash', res->>'difference');

  execute 'reset role';

  -- ---- Como el dueño ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_owner_sees from public.shifts;
  execute 'reset role';
  v_out := v_out || format(' | dueño ve %s turnos (total=%s)', v_owner_sees,
    (select count(*) from public.shifts where user_id = v_ws));

  v_out := v_out || format(' | grants auth shifts T/Tr/R=%s/%s/%s cash_movements T=%s',
    has_table_privilege('authenticated', 'public.shifts', 'TRUNCATE'),
    has_table_privilege('authenticated', 'public.shifts', 'TRIGGER'),
    has_table_privilege('authenticated', 'public.shifts', 'REFERENCES'),
    has_table_privilege('authenticated', 'public.cash_movements', 'TRUNCATE'));

  raise exception 'ROLLBACK (prueba): %', v_out;
end;
$test$;
