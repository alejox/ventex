-- Prueba manual SIN persistir de:
--   20261021100000_private_agenda.sql
--
-- DO que termina en RAISE: nada queda escrito (ni las sesiones de prueba ni las
-- citas). Corre contra la base con la migración YA aplicada; para probarla antes
-- de aplicarla, pega la migración arriba de este bloque en la MISMA sentencia
-- (el RAISE final deshace las dos cosas juntas).
--
-- Elige sola un negocio con dueño y al menos TRES trabajadores (no admin) con
-- permiso `calendar` y fichas distintas. A y B quedan con solo `calendar`; a C
-- se le prende `calendar_all` dentro de la transacción. Usa el 2099-01-05 para
-- no pisar citas.
--
-- Resultado esperado:
--   dueño ve 2 de 2 | A ve 1 (la suya) | A update B=0 filas | A delete B=0 filas
--   A crea para B -> 42501 | A pasa la suya a B -> 42501 | A crea la suya -> ok
--   busy de A: 3 filas, 2 propias, 1 ajena, sin identidad | busy sin permiso -> 42501
--   choque: A se pisa a sí mismo -> 23P01
--   C (calendar + calendar_all) ve 2 de 2 | C update B=1 fila | C busy: 0 propias de las otras

do $test$
declare
  v_ws uuid; v_owner uuid; v_owner_mem uuid;
  v_a uuid; v_a_mem uuid; v_a_staff uuid;
  v_b uuid; v_b_mem uuid; v_b_staff uuid;
  v_c uuid; v_c_mem uuid; v_c_staff uuid;
  v_day constant date := '2099-01-05';
  v_appt_a uuid; v_appt_b uuid; v_appt_a2 uuid;
  v_n int; v_mine int; v_out text := '';
begin
  select m.workspace_id, m.auth_user_id, m.id into v_ws, v_owner, v_owner_mem
  from public.workspace_memberships m
  where m.member_kind = 'owner' and m.status = 'active'
    and (select count(distinct w.staff_id) from public.workspace_memberships w
          where w.workspace_id = m.workspace_id and w.member_kind = 'member' and w.status = 'active'
            and not w.is_admin and coalesce((w.permissions ->> 'calendar')::boolean, false)) >= 3
  limit 1;
  if v_ws is null then raise exception 'Precondición: no hay negocio con tres trabajadores con Agenda'; end if;

  select w.auth_user_id, w.id, w.staff_id into v_a, v_a_mem, v_a_staff
  from public.workspace_memberships w
  where w.workspace_id = v_ws and w.member_kind = 'member' and w.status = 'active'
    and not w.is_admin and coalesce((w.permissions ->> 'calendar')::boolean, false)
  order by w.id limit 1;
  select w.auth_user_id, w.id, w.staff_id into v_b, v_b_mem, v_b_staff
  from public.workspace_memberships w
  where w.workspace_id = v_ws and w.member_kind = 'member' and w.status = 'active'
    and not w.is_admin and coalesce((w.permissions ->> 'calendar')::boolean, false)
    and w.staff_id <> v_a_staff
  order by w.id limit 1;
  select w.auth_user_id, w.id, w.staff_id into v_c, v_c_mem, v_c_staff
  from public.workspace_memberships w
  where w.workspace_id = v_ws and w.member_kind = 'member' and w.status = 'active'
    and not w.is_admin and coalesce((w.permissions ->> 'calendar')::boolean, false)
    and w.staff_id not in (v_a_staff, v_b_staff)
  order by w.id limit 1;
  -- A y B: solo `calendar`. C: `calendar` + `calendar_all`.
  update public.workspace_memberships set permissions = permissions - 'calendar_all' where id in (v_a_mem, v_b_mem);
  update public.workspace_memberships
     set permissions = permissions || '{"calendar": true, "calendar_all": true}'::jsonb
   where id = v_c_mem;

  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('pa-test-owner', v_owner, v_ws, v_owner_mem),
         ('pa-test-a', v_a, v_ws, v_a_mem),
         ('pa-test-b', v_b, v_ws, v_b_mem),
         ('pa-test-c', v_c, v_ws, v_c_mem);

  -- ---- Dueño: crea una cita para A y otra para B, y ve las dos ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated', 'session_id', 'pa-test-owner')::text, true);
  execute 'set local role authenticated';
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, status)
  values ('PA test A', v_day, '10:00', '11:00', v_a_staff, 'confirmed') returning id into v_appt_a;
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, status)
  values ('PA test B', v_day, '12:00', '13:00', v_b_staff, 'confirmed') returning id into v_appt_b;
  select count(*) into v_n from public.appointments where id in (v_appt_a, v_appt_b);
  v_out := format('dueño ve %s de 2', v_n);
  execute 'reset role';

  -- ---- Trabajador A ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'session_id', 'pa-test-a')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from public.appointments where id in (v_appt_a, v_appt_b);
  v_out := v_out || format(' | A ve %s (esperado 1)', v_n);
  select count(*) into v_n from public.appointments where id = v_appt_a;
  v_out := v_out || format(' | A ve la suya=%s', v_n = 1);

  update public.appointments set notes = 'pisado' where id = v_appt_b;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | A update B=%s filas', v_n);

  delete from public.appointments where id = v_appt_b;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | A delete B=%s filas', v_n);

  begin
    insert into public.appointments (title, appointment_date, start_time, end_time, staff_id)
    values ('PA intruso', v_day, '15:00', '16:00', v_b_staff);
    v_out := v_out || ' | A crea para B=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | A crea para B=' || sqlstate;
  end;

  begin
    update public.appointments set staff_id = v_b_staff where id = v_appt_a;
    v_out := v_out || ' | A pasa la suya a B=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | A pasa la suya a B=' || sqlstate;
  end;

  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id)
  values ('PA test A2', v_day, '14:00', '15:00', v_a_staff) returning id into v_appt_a2;
  v_out := v_out || format(' | A crea la suya=%s', v_appt_a2 is not null);

  select count(*), count(*) filter (where is_mine) into v_n, v_mine
  from public.agenda_busy_slots(v_day, v_day);
  v_out := v_out || format(' | busy A: %s filas, %s propias', v_n, v_mine);
  select count(*) into v_n from public.agenda_busy_slots(v_day, v_day)
  where not is_mine and start_time = '12:00' and end_time = '13:00';
  v_out := v_out || format(' | slot de B visible como ocupado=%s', v_n = 1);
  -- Las columnas son exactamente estas cuatro: no hay forma de pedir más.
  v_out := v_out || ' | columnas=' || pg_get_function_result('public.agenda_busy_slots(date,date)'::regprocedure);

  begin
    insert into public.appointments (title, appointment_date, start_time, end_time, staff_id)
    values ('PA choque', v_day, '10:30', '11:30', v_a_staff);
    v_out := v_out || ' | choque propio=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | choque propio=' || sqlstate;
  end;
  execute 'reset role';

  -- ---- Trabajador C con agenda completa ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_c, 'role', 'authenticated', 'session_id', 'pa-test-c')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.appointments where id in (v_appt_a, v_appt_b);
  v_out := v_out || format(' | C ve %s de 2', v_n);
  update public.appointments set notes = 'C la revisó' where id = v_appt_b;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | C update B=%s fila', v_n);
  select count(*) filter (where is_mine) into v_mine from public.agenda_busy_slots(v_day, v_day);
  v_out := v_out || format(' | C busy propias=%s', v_mine);
  execute 'reset role';

  -- ---- Sin permiso de agenda (sesión que no existe) ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'session_id', 'nada')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from public.agenda_busy_slots(v_day, v_day);
    v_out := v_out || ' | busy sin permiso=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | busy sin permiso=' || sqlstate;
  end;
  execute 'reset role';

  raise exception 'ROLLBACK (prueba): %', v_out;
end;
$test$;
