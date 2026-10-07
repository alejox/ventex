-- Prueba manual SIN persistir de:
--   20261007130000_open_shift_for_commission_via_membership.sql   (#6)
--   20261007130100_settle_commissions_inclusion_list.sql           (#11)
--   20261007130200_guard_cash_withdrawal_expense.sql               (#14)
--
-- Todo corre dentro de un DO que termina en RAISE: el resultado viaja en el
-- mensaje del error y NADA queda escrito (ni el turno de prueba, ni las
-- liquidaciones, ni el retiro). Se puede pegar tal cual en el SQL editor o en
-- execute_sql.
--
-- Antes de correrlo, completa las cinco constantes del DECLARE con datos del
-- negocio a probar:
--   v_ws            id del dueño (= workspace)
--   v_owner_m       membership del dueño (workspace_memberships, member_kind='owner')
--   v_session       una session_id de workspace_session_selections de esa membership
--   v_cashier_staff staff_id de un miembro con turno ABIERTO (vía workspace_memberships.staff_id)
--   v_big_staff     staff_id con >= 4 líneas de comisión pendientes y SIN turno propio
--
-- Resultado esperado (ensayado el 2026-10-07 contra producción):
--   #6 cashier -> <su turno>          (con DOS turnos abiertos: el join por membresía lo encuentra)
--   #6 otro staff, 2 abiertos -> null (ambiguo: no adivina)
--   #11 total equivocado -> LIQUIDACION_CAMBIO
--   #11 id desconocido   -> LIQUIDACION_CAMBIO
--   #11 2 líneas pedidas -> total registrado = esperado, el resto sigue pendiente
--   #11 llamada vieja (exclusión, 8 args con nombre) sigue funcionando
--   #14 insertar gasto con commission_settlement_id / cash_movement_id -> GASTO_VINCULADO
--   #14 vincular un gasto normal a un retiro -> GASTO_VINCULADO
--   #14 gasto de retiro: monto / fecha / desvincular -> GASTO_DE_RETIRO
--   #14 gasto de retiro: descripción -> OK; borrar -> "viene de un retiro de caja"

do $test$
declare
  v_ws            uuid := '00000000-0000-0000-0000-000000000000';
  v_owner_m       uuid := '00000000-0000-0000-0000-000000000000';
  v_session       text := '00000000-0000-0000-0000-000000000000';
  v_cashier_staff uuid := '00000000-0000-0000-0000-000000000000';
  v_big_staff     uuid := '00000000-0000-0000-0000-000000000000';
  v_out text := '';
  v_res uuid;
  v_ids uuid[];
  v_sum numeric;
  v_settle uuid;
  v_settle_total numeric;
  v_mov uuid;
  v_exp uuid;
  v_plain uuid;
  v_rows integer;
begin
  -- Segundo turno abierto (del dueño): así el fallback "único turno abierto" no
  -- aplica y se prueba el join por membresía.
  insert into public.shifts (user_id, worker_id, membership_id, status)
  values (v_ws, v_ws, v_owner_m, 'open');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_session)::text, true);
  execute 'set local role authenticated';

  -- #6
  v_res := public.open_shift_for_commission(v_cashier_staff);
  v_out := v_out || format(' | #6 cashier -> %s', v_res);
  v_res := public.open_shift_for_commission(v_big_staff);
  v_out := v_out || format(' | #6 otro staff, 2 abiertos -> %s (esperado null)', v_res);

  -- #11
  select array_agg(i.id order by i.id), sum(i.commission_amount) into v_ids, v_sum
  from public.sale_items i join public.sales s on s.id = i.sale_id
  where i.staff_id = v_big_staff and i.commission_settlement_id is null
    and i.commission_amount > 0 and s.status = 'completed';
  v_out := v_out || format(' | #11 pendientes=%s suma=%s', cardinality(v_ids), v_sum);

  begin
    perform public.settle_commissions(v_big_staff, '2000-01-01', '2100-12-31',
      '2000-01-01T00:00:00Z', '2101-01-01T00:00:00Z', 'transferencia', current_date,
      '{}', v_ids, v_sum + 1);
    v_out := v_out || ' | #11 total equivocado SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #11 total equivocado -> ' || left(sqlerrm, 20);
  end;

  begin
    perform public.settle_commissions(v_big_staff, '2000-01-01', '2100-12-31',
      '2000-01-01T00:00:00Z', '2101-01-01T00:00:00Z', 'transferencia', current_date,
      '{}', v_ids || gen_random_uuid(), v_sum);
    v_out := v_out || ' | #11 id desconocido SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #11 id desconocido -> ' || left(sqlerrm, 20);
  end;

  select sum(i.commission_amount) into v_sum from public.sale_items i where i.id = any(v_ids[1:2]);
  v_settle := public.settle_commissions(v_big_staff, '2000-01-01', '2100-12-31',
    '2000-01-01T00:00:00Z', '2101-01-01T00:00:00Z', 'transferencia', current_date,
    '{}', v_ids[1:2], v_sum);
  select total_amount into v_settle_total from public.commission_settlements where id = v_settle;
  v_out := v_out || format(' | #11 2 líneas: registrado=%s esperado=%s pendientes=%s',
    v_settle_total, v_sum,
    (select count(*) from public.sale_items where id = any(v_ids) and commission_settlement_id is null));

  v_settle := public.settle_commissions(
    p_staff_id => v_big_staff, p_from => '2000-01-01', p_to => '2100-12-31',
    p_from_ts => '2000-01-01T00:00:00Z', p_to_ts => '2101-01-01T00:00:00Z',
    p_payment_method => 'transferencia', p_paid_on => current_date,
    p_exclude_item_ids => v_ids[3:4]);
  v_out := v_out || format(' | #11 llamada vieja: liquidó=%s pendientes=%s (esperado 2)',
    (select items_count from public.commission_settlements where id = v_settle),
    (select count(*) from public.sale_items where id = any(v_ids) and commission_settlement_id is null));

  -- #14
  begin
    insert into public.expenses (description, amount, expense_date, commission_settlement_id)
    values ('forjado', 1, current_date, v_settle);
    v_out := v_out || ' | #14 insert con liquidación SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #14 insert con liquidación -> ' || left(sqlerrm, 16);
  end;

  v_mov := public.register_cash_withdrawal(5000, 'prueba retiro', 'gasto', null);
  select id into v_exp from public.expenses where cash_movement_id = v_mov;
  v_out := v_out || format(' | #14 retiro creó gasto=%s', v_exp is not null);

  begin
    insert into public.expenses (description, amount, expense_date, cash_movement_id)
    values ('forjado', 1, current_date, v_mov);
    v_out := v_out || ' | #14 insert con retiro SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #14 insert con retiro -> ' || left(sqlerrm, 16);
  end;

  insert into public.expenses (description, amount, expense_date)
  values ('normal', 1, current_date) returning id into v_plain;
  begin
    update public.expenses set cash_movement_id = v_mov where id = v_plain;
    v_out := v_out || ' | #14 vincular SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #14 vincular -> ' || left(sqlerrm, 16);
  end;

  begin
    update public.expenses set amount = 1 where id = v_exp;
    v_out := v_out || ' | #14 monto SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #14 monto -> ' || left(sqlerrm, 15);
  end;
  begin
    update public.expenses set expense_date = expense_date - 1 where id = v_exp;
    v_out := v_out || ' | #14 fecha SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #14 fecha -> ' || left(sqlerrm, 15);
  end;
  begin
    update public.expenses set cash_movement_id = null where id = v_exp;
    v_out := v_out || ' | #14 desvincular SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #14 desvincular -> ' || left(sqlerrm, 15);
  end;
  update public.expenses set description = 'nuevo texto' where id = v_exp;
  get diagnostics v_rows = row_count;
  v_out := v_out || format(' | #14 descripción filas=%s', v_rows);
  begin
    delete from public.expenses where id = v_exp;
    v_out := v_out || ' | #14 borrar SIN ERROR (MAL)';
  exception when others then
    v_out := v_out || ' | #14 borrar -> ' || left(sqlerrm, 40);
  end;

  raise exception 'ENSAYO (rollback)%', v_out;
end;
$test$;
