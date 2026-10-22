-- Prueba manual SIN persistir de:
--   20261021120000_my_commissions.sql
--
-- DO que termina en RAISE: nada queda escrito (ventas, líneas, liquidación ni
-- sesiones de prueba). Corre contra la base con la migración YA aplicada; para
-- probarla antes de aplicarla, pega la migración arriba de este bloque dentro
-- de `begin; ... rollback;` (el RAISE final deshace las dos cosas juntas).
--
-- Elige sola un negocio con dueño y al menos DOS miembros activos con fichas
-- distintas (A y B). Crea, fechadas en enero de 2099 para no pisar nada:
--   venta 1 (completada): A 1000 pendiente, A 500 liquidada, B 700 pendiente
--   venta 2 (ANULADA):    A 300 sin liquidar  -> no cuenta, igual que el dueño
--
-- Resultado esperado:
--   A líneas=2 (propias=2, de B=0, anuladas=0) | A pagada con fecha=ok
--   A por cobrar = suma directa | A liquidaciones de B=0, la de prueba=1
--   A totales del período (servidor) = sumas directas: devengado 1500, pagado
--     500, pendiente 1000, líneas 2 (en enero 2099 solo están las de prueba)
--   totales con rango de 400 días -> 22023 | dueño totales -> 42501
--   B líneas=1 (propias=1) | dueño -> 42501 SIN_FICHA | A suspendido -> 42501 (los dos RPC)
--   rango de 400 días -> 22023 | anon puede ejecutar=false

do $test$
declare
  v_ws uuid; v_owner uuid; v_owner_mem uuid;
  v_a uuid; v_a_mem uuid; v_a_staff uuid;
  v_b uuid; v_b_mem uuid; v_b_staff uuid;
  v_s1 uuid; v_s2 uuid; v_set uuid; v_l_paid uuid;
  v_num bigint;
  v_from constant timestamptz := '2099-01-01T00:00:00Z';
  v_to constant timestamptz := '2099-02-01T00:00:00Z';
  v_n int; v_mine int; v_other int; v_void int;
  v_direct numeric; v_sum jsonb; v_tot jsonb;
  v_d_earned numeric; v_d_paid numeric; v_d_pending numeric; v_d_count int;
  v_out text := '';
begin
  select m.workspace_id, m.auth_user_id, m.id into v_ws, v_owner, v_owner_mem
  from public.workspace_memberships m
  where m.member_kind = 'owner' and m.status = 'active'
    and (select count(distinct w.staff_id) from public.workspace_memberships w
          where w.workspace_id = m.workspace_id and w.member_kind = 'member'
            and w.status = 'active' and w.staff_id is not null) >= 2
  limit 1;
  if v_ws is null then raise exception 'Precondición: no hay negocio con dos miembros con ficha'; end if;

  select w.auth_user_id, w.id, w.staff_id into v_a, v_a_mem, v_a_staff
  from public.workspace_memberships w
  where w.workspace_id = v_ws and w.member_kind = 'member' and w.status = 'active' and w.staff_id is not null
  order by w.id limit 1;
  select w.auth_user_id, w.id, w.staff_id into v_b, v_b_mem, v_b_staff
  from public.workspace_memberships w
  where w.workspace_id = v_ws and w.member_kind = 'member' and w.status = 'active'
    and w.staff_id is not null and w.staff_id <> v_a_staff
  order by w.id limit 1;

  -- ---- Datos de prueba (como postgres: sin sesión, set_user_id respeta user_id) ----
  select coalesce(max(sale_number), 0) + 1000000 into v_num from public.sales where user_id = v_ws;
  insert into public.sales (user_id, sale_number, status, created_at, membership_id)
  values (v_ws, v_num, 'completed', '2099-01-05T15:00:00Z', v_owner_mem) returning id into v_s1;
  insert into public.sales (user_id, sale_number, status, created_at, membership_id)
  values (v_ws, v_num + 1, 'completed', '2099-01-06T15:00:00Z', v_owner_mem) returning id into v_s2;

  insert into public.commission_settlements (user_id, staff_id, period_from, period_to, total_amount, items_count, payment_method, paid_on)
  values (v_ws, v_a_staff, '2099-01-01', '2099-01-31', 500, 1, 'efectivo', '2099-01-20') returning id into v_set;

  insert into public.sale_items (user_id, sale_id, product_name, unit_price, quantity, line_total, staff_id, commission_amount)
  values (v_ws, v_s1, 'MC test A pendiente', 10000, 1, 10000, v_a_staff, 1000),
         (v_ws, v_s1, 'MC test B pendiente', 7000, 1, 7000, v_b_staff, 700),
         (v_ws, v_s2, 'MC test A anulada', 3000, 1, 3000, v_a_staff, 300);
  insert into public.sale_items (user_id, sale_id, product_name, unit_price, quantity, line_total, staff_id, commission_amount, commission_settlement_id, discount_amount)
  values (v_ws, v_s1, 'MC test A liquidada', 5000, 1, 5000, v_a_staff, 500, v_set, 1000) returning id into v_l_paid;
  -- La venta 2 se anula después de vender (como void_sale: solo cambia el estado).
  update public.sales set status = 'void', voided_at = now() where id = v_s2;

  -- Suma directa de lo pendiente de A (misma regla que el "Por pagar" del dueño).
  select coalesce(sum(si.commission_amount), 0) into v_direct
  from public.sale_items si join public.sales s on s.id = si.sale_id
  where si.user_id = v_ws and si.staff_id = v_a_staff and s.status = 'completed'
    and si.commission_settlement_id is null and si.commission_amount > 0;

  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('mc-test-owner', v_owner, v_ws, v_owner_mem),
         ('mc-test-a', v_a, v_ws, v_a_mem),
         ('mc-test-b', v_b, v_ws, v_b_mem);

  -- ---- A ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'session_id', 'mc-test-a')::text, true);
  execute 'set local role authenticated';
  select count(*),
         count(*) filter (where item_name like 'MC test A%'),
         count(*) filter (where item_name like 'MC test B%'),
         count(*) filter (where sale_id = v_s2)
    into v_n, v_mine, v_other, v_void
  from public.my_commission_lines(v_from, v_to);
  v_out := format('A líneas=%s (propias=%s, de B=%s, anuladas=%s)', v_n, v_mine, v_other, v_void);
  select count(*) into v_n from public.my_commission_lines(v_from, v_to)
  where sale_item_id = v_l_paid and settled and settlement_paid_on = '2099-01-20' and line_net = 4000;
  v_out := v_out || format(' | A pagada con fecha y neto=%s', v_n = 1);
  v_sum := public.my_commission_summary();
  v_out := v_out || format(' | A por cobrar=%s directa=%s iguales=%s',
    v_sum ->> 'pending_total', v_direct, (v_sum ->> 'pending_total')::numeric = round(v_direct, 2));
  select count(*) filter (where (e ->> 'id')::uuid = v_set) into v_n
  from jsonb_array_elements(v_sum -> 'settlements') e;
  v_out := v_out || format(' | A ve su liquidación=%s', v_n = 1);
  select count(*) into v_n from jsonb_array_elements(v_sum -> 'settlements') e
  join public.commission_settlements cs on cs.id = (e ->> 'id')::uuid
  where cs.staff_id <> v_a_staff;
  v_out := v_out || format(' | A liquidaciones ajenas=%s', v_n);
  -- Totales del período del servidor = sumas directas con el mismo filtro.
  v_tot := public.my_commission_period_totals(v_from, v_to);
  execute 'reset role';
  select coalesce(sum(si.commission_amount), 0),
         coalesce(sum(si.commission_amount) filter (where si.commission_settlement_id is not null), 0),
         coalesce(sum(si.commission_amount) filter (where si.commission_settlement_id is null), 0),
         count(*)
    into v_d_earned, v_d_paid, v_d_pending, v_d_count
  from public.sale_items si join public.sales s on s.id = si.sale_id
  where si.user_id = v_ws and si.staff_id = v_a_staff and s.status = 'completed'
    and s.created_at >= v_from and s.created_at < v_to;
  v_out := v_out || format(' | A período: devengado=%s/%s pagado=%s/%s pendiente=%s/%s líneas=%s/%s iguales=%s',
    v_tot ->> 'earned', v_d_earned, v_tot ->> 'paid_in_period', v_d_paid,
    v_tot ->> 'pending_in_period', v_d_pending, v_tot ->> 'lines_count', v_d_count,
    (v_tot ->> 'earned')::numeric = round(v_d_earned, 2)
      and (v_tot ->> 'paid_in_period')::numeric = round(v_d_paid, 2)
      and (v_tot ->> 'pending_in_period')::numeric = round(v_d_pending, 2)
      and (v_tot ->> 'lines_count')::int = v_d_count);
  execute 'set local role authenticated';
  begin
    perform public.my_commission_period_totals(v_from, v_from + interval '400 days');
    v_out := v_out || ' | totales 400 días=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | totales 400 días=' || sqlstate;
  end;
  begin
    perform * from public.my_commission_lines(v_from, v_from + interval '400 days');
    v_out := v_out || ' | rango 400 días=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | rango 400 días=' || sqlstate;
  end;
  execute 'reset role';

  -- ---- B ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b, 'role', 'authenticated', 'session_id', 'mc-test-b')::text, true);
  execute 'set local role authenticated';
  select count(*), count(*) filter (where item_name like 'MC test B%')
    into v_n, v_mine
  from public.my_commission_lines(v_from, v_to);
  v_out := v_out || format(' | B líneas=%s (propias=%s)', v_n, v_mine);
  execute 'reset role';

  -- ---- Dueño (sin ficha) ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated', 'session_id', 'mc-test-owner')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from public.my_commission_lines(v_from, v_to);
    v_out := v_out || ' | dueño líneas=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | dueño líneas=' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    perform public.my_commission_period_totals(v_from, v_to);
    v_out := v_out || ' | dueño totales=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | dueño totales=' || sqlstate;
  end;
  begin
    perform public.my_commission_summary();
    v_out := v_out || ' | dueño resumen=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | dueño resumen=' || sqlstate;
  end;
  execute 'reset role';

  -- ---- Miembro sin ficha activa ----
  -- `workspace_memberships_owner_shape` obliga a todo `member` a tener staff_id
  -- (y al dueño a no tenerlo), así que "miembro sin ficha" no existe como fila.
  -- El único NULL posible para un miembro es una membresía no activa: se
  -- suspende la de A dentro de la transacción.
  update public.workspace_memberships set status = 'suspended' where id = v_a_mem;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'session_id', 'mc-test-a')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.my_commission_summary();
    v_out := v_out || ' | A suspendido=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | A suspendido=' || sqlstate;
  end;
  begin
    perform * from public.my_commission_lines(v_from, v_to);
    v_out := v_out || ' | A suspendido líneas=PERMITIDO (MAL)';
  exception when others then
    v_out := v_out || ' | A suspendido líneas=' || sqlstate;
  end;
  execute 'reset role';

  v_out := v_out || format(' | anon puede ejecutar=%s | authenticated puede=%s',
    has_function_privilege('anon', 'public.my_commission_lines(timestamptz,timestamptz)', 'execute')
      or has_function_privilege('anon', 'public.my_commission_summary()', 'execute')
      or has_function_privilege('anon', 'public.my_commission_period_totals(timestamptz,timestamptz)', 'execute'),
    has_function_privilege('authenticated', 'public.my_commission_lines(timestamptz,timestamptz)', 'execute')
      and has_function_privilege('authenticated', 'public.my_commission_summary()', 'execute')
      and has_function_privilege('authenticated', 'public.my_commission_period_totals(timestamptz,timestamptz)', 'execute'));

  raise exception 'RESULTADO (rollback): %', v_out;
end
$test$;
