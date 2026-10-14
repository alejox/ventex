-- Prueba manual SIN persistir de:
--   20261014100000_owner_uses_shifts_setting.sql
--   20261014100100_owner_cash_fallbacks.sql
--
-- DO que termina en RAISE: nada queda escrito. Completa las constantes con un
-- negocio que tenga UN SOLO turno abierto, el de un trabajador, y cuyo dueño
-- NO tenga turno abierto:
--   v_ws           = dueño (workspace)
--   v_owner_mem    = membresía del dueño,   v_owner_ses = una session_id suya
--   v_worker_shift = id del turno abierto del trabajador
--   v_worker_staff = staff_id de ese trabajador (workspace_memberships.staff_id)
--   v_customer     = cliente del negocio con credit_balance >= 3
--
-- Resultado esperado:
--   ajuste OFF, dueño sin caja: abono efectivo -> turno del trabajador (como antes)
--   ajuste ON,  dueño sin caja: abono efectivo -> SIN turno (nunca el del trabajador)
--   ajuste ON,  dueño sin caja: comisión -> turno del trabajador (es el suyo)
--   dueño con caja abierta: comisión -> caja del DUEÑO; abono efectivo -> caja del DUEÑO
--   un trabajador cambiando owner_uses_shifts -> 42501 (guard)
--
-- NO se ejecutó al escribirla: la revisa y la corre quien aplica las migraciones.

do $test$
declare
  v_ws           uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_mem    uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_ses    text := '00000000-0000-0000-0000-000000000000';
  v_worker_shift uuid := '00000000-0000-0000-0000-000000000000';
  v_worker_staff uuid := '00000000-0000-0000-0000-000000000000';
  v_customer     uuid := '00000000-0000-0000-0000-000000000000';
  v_out text := '';
  v_owner_shift uuid;
  v_payment_shift uuid;
  v_commission_shift uuid;
  v_pid uuid;
begin
  if (select count(*) from public.shifts where user_id = v_ws and status = 'open') <> 1 then
    raise exception 'Precondición: el negocio debe tener exactamente un turno abierto (el del trabajador)';
  end if;

  -- La fila de settings puede no existir (se crea perezosa).
  insert into public.settings (user_id) select v_ws
  where not exists (select 1 from public.settings where user_id = v_ws);

  -- ---- Ajuste APAGADO: comportamiento de siempre ----
  update public.settings set owner_uses_shifts = false where user_id = v_ws;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';

  v_pid := gen_random_uuid();
  perform public.register_customer_payment(v_customer, 1, 'prueba off', 'efectivo', v_pid);
  execute 'reset role';
  select shift_id into v_payment_shift from public.customer_payments where client_payment_id = v_pid;
  v_out := format('OFF abono=%s (esperado turno trabajador: %s)',
    coalesce(v_payment_shift::text, 'null'), v_payment_shift = v_worker_shift);

  -- ---- Ajuste ENCENDIDO, dueño sin caja ----
  update public.settings set owner_uses_shifts = true where user_id = v_ws;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';

  v_pid := gen_random_uuid();
  perform public.register_customer_payment(v_customer, 1, 'prueba on', 'efectivo', v_pid);
  v_commission_shift := public.open_shift_for_commission(v_worker_staff);
  execute 'reset role';
  select shift_id into v_payment_shift from public.customer_payments where client_payment_id = v_pid;
  v_out := v_out || format(' | ON sin caja: abono=%s (esperado null) comisión=%s (esperado trabajador: %s)',
    coalesce(v_payment_shift::text, 'null'), coalesce(v_commission_shift::text, 'null'),
    v_commission_shift = v_worker_shift);

  -- ---- Dueño con su propia caja abierta ----
  insert into public.shifts (user_id, worker_id, membership_id, opening_cash, status)
  values (v_ws, v_ws, v_owner_mem, 0, 'open')
  returning id into v_owner_shift;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_owner_ses)::text, true);
  execute 'set local role authenticated';

  v_pid := gen_random_uuid();
  perform public.register_customer_payment(v_customer, 1, 'prueba caja dueño', 'efectivo', v_pid);
  v_commission_shift := public.open_shift_for_commission(v_worker_staff);
  execute 'reset role';
  select shift_id into v_payment_shift from public.customer_payments where client_payment_id = v_pid;
  v_out := v_out || format(' | caja dueño: abono en caja dueño=%s comisión en caja dueño=%s',
    v_payment_shift = v_owner_shift, v_commission_shift = v_owner_shift);

  -- ---- Guard: un trabajador no cambia el ajuste ----
  -- Simulado con un auth.uid() cualquiera que no es dueño del negocio activo.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    update public.settings set owner_uses_shifts = false where user_id = v_ws;
    v_out := v_out || ' | guard=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | guard=' || sqlstate || ' ' || sqlerrm;
  end;

  raise exception 'ROLLBACK (prueba): %', v_out;
end;
$test$;
