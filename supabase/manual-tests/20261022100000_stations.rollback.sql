-- Prueba manual SIN persistir de:
--   20261022100000_stations.sql
--
-- DO que termina en RAISE: nada queda escrito (ni las sesiones de prueba ni
-- las citas). Corre contra la base con la migración YA aplicada; para probarla
-- antes de aplicarla, pega la migración arriba de este bloque en la MISMA
-- sentencia (el RAISE final deshace las dos cosas juntas).
--
-- Elige sola un negocio con dueño, al menos UN trabajador (no admin) con
-- permiso `calendar` y ficha de Personal, y un segundo negocio (para la
-- estación ajena). Usa el 2099-01-06 para no pisar citas reales.
--
-- Resultado esperado:
--   CRUD dueño: tenant=t desactiva=t borra=t | duplicado ' ST SILLA UNO '=23505
--   ficha default fijada=t | cita estación ajena=42501 | ficha estación ajena=42501
--   W ve estaciones=2 | W insert=42501 | W update=0 filas | W delete=0 filas | W update ficha=0 filas
--   hereda default=t | sin default=null=t | explícita preservada=t
--   reasigna: default viejo cae a null=t | explícita sobrevive cambio de persona=t | sin default hereda la nueva=t
--   choque estación=23P01 | seguidillas=ok | otra estación=ok | choque persona=23P01 (mensaje de persona)
--   cancelada no bloquea=ok | estación por UPDATE=ok | guard en update=42501 | delete set null: s2=0 nulls=3

do $test$
declare
  v_ws uuid; v_owner uuid; v_owner_mem uuid;
  v_w uuid; v_w_mem uuid; v_staff_a uuid;
  v_staff_b uuid; v_staff_c uuid;
  v_other_ws uuid; v_foreign uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_day constant date := '2099-01-06';
  v_appt_a uuid; v_appt_b uuid; v_appt_c uuid; v_appt_m uuid;
  v_n int; v_msg text;
  v_tenant_ok boolean; v_deact_ok boolean; v_del_ok boolean;
  v_dup_ok boolean; v_fixed_ok boolean; v_foreign_appt text; v_foreign_staff text;
  v_inherit_ok boolean; v_null_ok boolean; v_explicit_ok boolean;
  v_red_null_ok boolean; v_preserve_ok boolean; v_red_new_ok boolean;
  v_clash_station text; v_clash_person text;
  v_update_station_ok boolean; v_guard_update text; v_del_null_cnt int;
  v_out text := '';
begin
  -- Un negocio con dueño y al menos un trabajador (no admin) con Agenda y ficha.
  select m.workspace_id, m.auth_user_id, m.id into v_ws, v_owner, v_owner_mem
  from public.workspace_memberships m
  where m.member_kind = 'owner' and m.status = 'active'
    and exists (select 1 from public.workspace_memberships w
                where w.workspace_id = m.workspace_id and w.member_kind = 'member'
                  and w.status = 'active' and not w.is_admin and w.staff_id is not null
                  and coalesce((w.permissions ->> 'calendar')::boolean, false))
  limit 1;
  if v_ws is null then raise exception 'Precondición: no hay negocio con trabajador con Agenda y ficha'; end if;

  select w.auth_user_id, w.id, w.staff_id into v_w, v_w_mem, v_staff_a
  from public.workspace_memberships w
  where w.workspace_id = v_ws and w.member_kind = 'member' and w.status = 'active'
    and not w.is_admin and w.staff_id is not null
    and coalesce((w.permissions ->> 'calendar')::boolean, false)
  order by w.id limit 1;

  -- Un segundo negocio para la estación ajena.
  select m.workspace_id into v_other_ws
  from public.workspace_memberships m
  where m.member_kind = 'owner' and m.status = 'active' and m.workspace_id <> v_ws
  limit 1;
  if v_other_ws is null then raise exception 'Precondición: se necesita un segundo negocio'; end if;

  -- Fichas y estación ajena (como postgres: sin RLS; el trigger set_user_id
  -- conserva el user_id explícito cuando la sesión no resuelve a nada).
  insert into public.staff (user_id, full_name) values (v_ws, 'ST Prueba B') returning id into v_staff_b;
  insert into public.staff (user_id, full_name) values (v_ws, 'ST Prueba C') returning id into v_staff_c;
  insert into public.stations (user_id, name) values (v_other_ws, 'ST ajena') returning id into v_foreign;

  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('st-test-owner', v_owner, v_ws, v_owner_mem),
         ('st-test-w', v_w, v_ws, v_w_mem);

  -- ================= Dueño =================
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated', 'session_id', 'st-test-owner')::text, true);
  execute 'set local role authenticated';

  -- ---- CRUD de estaciones ----
  insert into public.stations (name) values ('ST Silla 1') returning id into v_s1;
  select user_id = v_ws into v_tenant_ok from public.stations where id = v_s1;
  update public.stations set name = 'ST Silla Uno' where id = v_s1;
  update public.stations set is_active = false where id = v_s1;
  select not is_active into v_deact_ok from public.stations where id = v_s1;
  update public.stations set is_active = true where id = v_s1;
  insert into public.stations (name) values ('ST Silla 2') returning id into v_s2;
  insert into public.stations (name) values ('ST Silla 3') returning id into v_s3;
  delete from public.stations where id = v_s3;
  select not exists (select 1 from public.stations where id = v_s3) into v_del_ok;
  v_out := format('CRUD dueño: tenant=%s desactiva=%s borra=%s', v_tenant_ok, v_deact_ok, v_del_ok);

  -- ---- Nombre duplicado (variante de mayúsculas/espacios) ----
  v_dup_ok := false;
  begin
    insert into public.stations (name) values ('  ST SILLA UNO ');
  exception when others then
    v_dup_ok := sqlstate = '23505';
  end;
  v_out := v_out || format(' | duplicado=23505:%s', v_dup_ok);

  -- ---- Asignación fija + guard de tenant en ambas tablas ----
  update public.staff set default_station_id = v_s1 where id = v_staff_a;
  select default_station_id = v_s1 into v_fixed_ok from public.staff where id = v_staff_a;
  v_out := v_out || format(' | ficha default fijada=%s', v_fixed_ok);

  begin
    insert into public.appointments (title, appointment_date, start_time, end_time, station_id)
    values ('ST ajena', v_day, '07:00', '07:30', v_foreign);
    v_foreign_appt := 'PERMITIDO (MAL)';
  exception when others then
    v_foreign_appt := sqlstate;
  end;
  begin
    update public.staff set default_station_id = v_foreign where id = v_staff_b;
    v_foreign_staff := 'PERMITIDO (MAL)';
  exception when others then
    v_foreign_staff := sqlstate;
  end;
  v_out := v_out || format(' | cita estación ajena=%s | ficha estación ajena=%s', v_foreign_appt, v_foreign_staff);
  execute 'reset role';

  -- ================= Trabajador: lee, no escribe =================
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_w, 'role', 'authenticated', 'session_id', 'st-test-w')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from public.stations where id in (v_s1, v_s2);
  v_out := v_out || format(' | W ve estaciones=%s (esperado 2)', v_n);
  begin
    insert into public.stations (name) values ('ST Silla intrusa');
    v_out := v_out || ' | W insert=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | W insert=' || sqlstate;
  end;
  update public.stations set name = 'x' where id = v_s1;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | W update=%s filas', v_n);
  delete from public.stations where id = v_s1;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | W delete=%s filas', v_n);
  update public.staff set default_station_id = v_s1 where id = v_staff_b;
  get diagnostics v_n = row_count;
  v_out := v_out || format(' | W update ficha=%s filas', v_n);
  execute 'reset role';

  -- ================= Dueño: herencia y choques =================
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated', 'session_id', 'st-test-owner')::text, true);
  execute 'set local role authenticated';

  -- a: persona con default y sin estación explícita → hereda S1
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id)
  values ('ST auto', v_day, '10:00', '11:00', v_staff_a) returning id into v_appt_a;
  select station_id = v_s1 into v_inherit_ok from public.appointments where id = v_appt_a;

  -- b: persona sin default → queda sin estación
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id)
  values ('ST sin default', v_day, '12:00', '13:00', v_staff_b) returning id into v_appt_b;
  select station_id is null into v_null_ok from public.appointments where id = v_appt_b;

  -- c: estación compartida elegida a mano con persona que tiene default → NO se pisa
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, station_id)
  values ('ST explícita', v_day, '11:00', '12:00', v_staff_a, v_s2) returning id into v_appt_c;
  select station_id = v_s2 into v_explicit_ok from public.appointments where id = v_appt_c;

  -- m: otra heredada para probar la reasignación
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id)
  values ('ST reasignar', v_day, '14:00', '15:00', v_staff_a) returning id into v_appt_m;

  v_out := v_out || format(' | hereda default=%s | sin default=null=%s | explícita preservada=%s',
    v_inherit_ok, v_null_ok, v_explicit_ok);

  -- Reasignar m (estación era el default de A) → hereda la de B: NULL
  update public.appointments set staff_id = v_staff_b where id = v_appt_m;
  select station_id is null into v_red_null_ok from public.appointments where id = v_appt_m;

  -- Reasignar c (estación S2 explícita, no era el default de A) → se preserva
  update public.appointments set staff_id = v_staff_b where id = v_appt_c;
  select station_id = v_s2 into v_preserve_ok from public.appointments where id = v_appt_c;

  -- Reasignar b (sin estación) a A → hereda S1
  update public.appointments set staff_id = v_staff_a where id = v_appt_b;
  select station_id = v_s1 into v_red_new_ok from public.appointments where id = v_appt_b;

  v_out := v_out || format(' | reasigna: default viejo cae a null=%s | explícita sobrevive=%s | hereda la nueva=%s',
    v_red_null_ok, v_preserve_ok, v_red_new_ok);

  -- ---- Choque de estación (distinta persona, misma estación/hora) ----
  begin
    insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, station_id)
    values ('ST choque estación', v_day, '10:30', '11:30', v_staff_c, v_s1);
    v_clash_station := 'PERMITIDO (MAL)';
  exception when others then
    v_msg := sqlerrm;
    v_clash_station := sqlstate || ' ' || left(v_msg, position('.' in v_msg));
  end;
  v_out := v_out || ' | choque estación=' || v_clash_station;

  -- ---- Seguidillas (termina 11:00 / empieza 11:00) no se pisan ----
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, station_id)
  values ('ST seguidillas', v_day, '11:00', '12:00', v_staff_c, v_s1);
  v_out := v_out || ' | seguidillas=ok';

  -- ---- Misma hora en OTRA estación: no hay choque ----
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, station_id)
  values ('ST otra estación', v_day, '10:00', '11:00', v_staff_b, v_s2);
  v_out := v_out || ' | otra estación=ok';

  -- ---- El choque de PERSONA sigue disparando solo (misma persona, otra estación) ----
  begin
    insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, station_id)
    values ('ST choque persona', v_day, '10:30', '11:30', v_staff_a, v_s2);
    v_clash_person := 'PERMITIDO (MAL)';
  exception when others then
    v_msg := sqlerrm;
    v_clash_person := sqlstate || case when v_msg like '%persona%' then ' (persona)' else ' (mensaje: ' || left(v_msg, 60) || ')' end;
  end;
  v_out := v_out || ' | choque persona=' || v_clash_person;

  -- ---- Cancelada no bloquea la estación ----
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, station_id, status)
  values ('ST cancelada', v_day, '07:00', '07:30', v_staff_c, v_s1, 'cancelled');
  insert into public.appointments (title, appointment_date, start_time, end_time, staff_id, station_id)
  values ('ST tras cancelada', v_day, '07:00', '07:30', v_staff_c, v_s1);
  v_out := v_out || ' | cancelada no bloquea=ok';

  -- ---- Estación compartida elegida por UPDATE (sin tocar la persona) ----
  update public.appointments set station_id = v_s2 where id = v_appt_m;
  select station_id = v_s2 into v_update_station_ok from public.appointments where id = v_appt_m;
  v_out := v_out || format(' | estación por UPDATE=%s', v_update_station_ok);

  -- ---- El guard también corre en UPDATE ----
  begin
    update public.appointments set station_id = v_foreign where id = v_appt_m;
    v_guard_update := 'PERMITIDO (MAL)';
  exception when others then
    v_guard_update := sqlstate;
  end;
  select station_id = v_s2 into v_update_station_ok from public.appointments where id = v_appt_m;
  v_out := v_out || format(' | guard en update=%s (sigue S2=%s)', v_guard_update, v_update_station_ok);

  -- ---- Borrar la estación libera las citas (ON DELETE SET NULL) ----
  delete from public.stations where id = v_s2;
  select count(*) into v_n from public.appointments where station_id = v_s2;
  select count(*) into v_del_null_cnt from public.appointments
  where appointment_date = v_day and station_id is null and title like 'ST %';
  v_out := v_out || format(' | delete set null: s2=%s nulls=%s (esperado 0 y 3)', v_n, v_del_null_cnt);

  execute 'reset role';

  raise exception 'ROLLBACK (prueba): %', v_out;
end;
$test$;

-- ---- Post-check (corrido DESPUÉS, una vez abortada la transacción) ----
-- La transacción abortó: nada quedó. Si pegaste la migración arriba en la
-- MISMA sentencia, la base sigue SIN ella — verifica que no quedó nada:
--   select count(*) from public.appointments where appointment_date = '2099-01-06';                      -- 0
--   select count(*) from public.workspace_session_selections where session_id like 'st-test-%';          -- 0
--   select count(*) from public.staff where full_name in ('ST Prueba B', 'ST Prueba C');                 -- 0
--   select count(*) from public.stations where name ilike 'ST ajena';                                    -- 0 si la tabla existe; ERROR si la migración no se aplicó (es lo esperado)
--   select pg_get_functiondef('public.appointments_prevent_station_overlap()'::regprocedure);            -- ERROR "no existe" si la migración no se aplicó
