-- PRUEBA SIN PERSISTIR de
--   20261007140000_sales_stock_applied_kardex_shift_lock.sql
--   20261007140100_sales_payment_method_check.sql
--
-- Todo corre dentro de UN bloque DO que termina SIEMPRE en `raise exception`:
-- la excepción aborta la transacción entera, así que no persiste nada aunque
-- el cliente SQL esté en autocommit. El resultado viaja en el mensaje del error
-- ("ROLLBACK_OK {...json...}"). ÚNICO efecto no transaccional: cada INSERT en
-- `sales` consume un valor de la secuencia de `sale_number`.
--
-- Corre contra las migraciones YA aplicadas. Para ensayar ANTES de aplicarlas,
-- pegar su contenido dentro de un `execute $mig$ ... $mig$;` al principio del
-- bloque (después del setup), como en 20261007100100_sales_accounting_fixes.
--
-- Cuenta: la del E2E (test-md4hv70zu@srv1.mail-tester.com). El trabajador, su
-- turno y los productos se crean dentro de la transacción.
--
-- Esperado (ensayado el 2026-10-07 contra producción):
--   T1 venta: stock_qty_applied A=2.5 B=6 C=0; stock A −2.5, B −6, C igual;
--      kardex 2 salidas 'sale' (2.5 y 6) y ninguna para C
--   T2 se invierte tracks_stock (A off, C on) y se anula: A +2.5, B +6, C igual;
--      kardex 2 entradas 'sale_void' (2.5 y 6)
--   T3 línea de legado (stock_qty_applied NULL): la anulación usa la regla
--      vieja (tracks_stock actual) → B +1
--   T4 p_payment_method 'bitcoin' y split 'bitcoin' → METODO_PAGO_INVALIDO;
--      UPDATE directo de sales.payment_method → sales_payment_method_check
--   T5 turno del trabajador cerrado → CONTEXTO_DE_TRABAJO_CAMBIO; las dos
--      funciones leen los turnos con FOR SHARE
--   T6 split efectivo+tarjeta válido → OK, payment_method 'split'
do $test$
declare
  c_owner    uuid := 'fc9d39c5-e583-4d86-891a-7e0c1c42eaab';
  c_owner_m  uuid := '76daf1f1-4723-40f2-9acb-e488c657fa71';
  c_seller   uuid := 'dea2f6aa-7bf7-44f0-962a-399e04a1a7ff'; -- staff "Profesor Piano E2E"
  v_worker   uuid := gen_random_uuid();
  v_worker_m uuid;
  v_owner_shift uuid;
  v_pa       uuid;  -- controla stock, en kg (allows_fractions es generada por unidad)
  v_pb       uuid;  -- controla stock, caja de 6
  v_pc       uuid;  -- NO controla stock
  v_shift_w  uuid;
  v_sale     uuid;
  v_sa0 numeric; v_sb0 numeric; v_sc0 numeric;
  v_sa numeric; v_sb numeric; v_sc numeric;
  r          jsonb := '{}'::jsonb;
  v_err      text;
  v_txt      text;
begin
  -- ---------------------------------------------------------------- setup
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);

  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_worker, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'rollback-worker-' || v_worker || '@example.invalid', '{}', '{}', now(), now());
  insert into public.workspace_memberships
    (workspace_id, auth_user_id, invited_email, member_kind, status, accepted_at, activated_at, staff_id, permissions)
  values (c_owner, v_worker, 'rollback-worker-' || v_worker || '@example.invalid', 'member', 'active', now(), now(),
          c_seller, '{"pos": true, "sales": true}'::jsonb)
  returning id into v_worker_m;
  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('rb-owner', c_owner, c_owner, c_owner_m), ('rb-worker', v_worker, c_owner, v_worker_m);

  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit)
  values (c_owner, 'PA ROLLBACK', 'RB-PA', 1000, 10, true, 'kg') returning id into v_pa;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, units_per_package, package_price)
  values (c_owner, 'PB ROLLBACK', 'RB-PB', 200, 20, true, 'Unidad', 6, 1000) returning id into v_pb;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit)
  values (c_owner, 'PC ROLLBACK', 'RB-PC', 500, 5, false, 'Unidad') returning id into v_pc;
  update public.settings set allow_oversell = true where user_id = c_owner;

  insert into public.shifts (user_id, worker_id, membership_id, status, opening_cash)
  values (c_owner, v_worker, v_worker_m, 'open', 0) returning id into v_shift_w;

  -- Turno abierto del dueño, si lo tuviera en vivo (el RPC lo exige como contexto).
  select s.id into v_owner_shift from public.shifts s
   where s.user_id = c_owner and s.membership_id = c_owner_m and s.worker_id = c_owner and s.status = 'open';

  select stock_level into v_sa0 from public.products where id = v_pa;
  select stock_level into v_sb0 from public.products where id = v_pb;
  select stock_level into v_sc0 from public.products where id = v_pc;

  -- ------------------------------------------------------------- T1 venta
  perform set_config('role', 'authenticated', true);
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0,
    p_items => jsonb_build_array(
      jsonb_build_object('product_id', v_pa, 'quantity', 2.5),
      jsonb_build_object('product_id', v_pb, 'quantity', 1, 'kind', 'package'),
      jsonb_build_object('product_id', v_pc, 'quantity', 1)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_owner_shift);
  execute 'reset role';

  select string_agg(p.sku || '=' || coalesce(si.stock_qty_applied::text, 'NULL'), ' ' order by p.sku) into v_txt
    from public.sale_items si join public.products p on p.id = si.product_id where si.sale_id = v_sale;
  r := r || jsonb_build_object('T1_applied', v_txt);
  select stock_level into v_sa from public.products where id = v_pa;
  select stock_level into v_sb from public.products where id = v_pb;
  select stock_level into v_sc from public.products where id = v_pc;
  r := r || jsonb_build_object('T1_stock_delta', format('A=%s B=%s C=%s', v_sa - v_sa0, v_sb - v_sb0, v_sc - v_sc0));
  select string_agg(p.sku || ':' || m.type || ':' || m.quantity || ':' || m.notes, ' ' order by p.sku) into v_txt
    from public.inventory_movements m join public.products p on p.id = m.product_id
   where m.reference_type = 'sale' and m.reference_id = v_sale;
  r := r || jsonb_build_object('T1_kardex', coalesce(v_txt, 'NINGUNO'));

  -- --------------------------------- T2 anular con tracks_stock invertido
  update public.products set tracks_stock = false where id = v_pa;
  update public.products set tracks_stock = true where id = v_pc;
  perform set_config('role', 'authenticated', true);
  perform public.void_sale(v_sale, 'prueba rollback');
  execute 'reset role';
  select stock_level into v_sa from public.products where id = v_pa;
  select stock_level into v_sb from public.products where id = v_pb;
  select stock_level into v_sc from public.products where id = v_pc;
  r := r || jsonb_build_object('T2_stock_delta_after_void', format('A=%s B=%s C=%s', v_sa - v_sa0, v_sb - v_sb0, v_sc - v_sc0));
  select string_agg(p.sku || ':' || m.type || ':' || m.quantity, ' ' order by p.sku) into v_txt
    from public.inventory_movements m join public.products p on p.id = m.product_id
   where m.reference_type = 'sale_void' and m.reference_id = v_sale;
  r := r || jsonb_build_object('T2_kardex', coalesce(v_txt, 'NINGUNO'));

  -- ------------------------------------------------- T3 línea de legado
  perform set_config('role', 'authenticated', true);
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_pb, 'quantity', 1)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_owner_shift);
  execute 'reset role';
  update public.sale_items set stock_qty_applied = null where sale_id = v_sale;
  select stock_level into v_sb0 from public.products where id = v_pb;
  perform set_config('role', 'authenticated', true);
  perform public.void_sale(v_sale, 'prueba legado');
  execute 'reset role';
  select stock_level into v_sb from public.products where id = v_pb;
  r := r || jsonb_build_object('T3_legacy_void_B', v_sb - v_sb0);

  -- ---------------------------------------------------- T4 método de pago
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'bitcoin', p_discount_amount => 0,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_pc, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_owner_shift);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('T4_method', v_err);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_pc, 'quantity', 1)),
      p_payments => jsonb_build_array(
        jsonb_build_object('payment_method', 'efectivo', 'amount', 250),
        jsonb_build_object('payment_method', 'bitcoin', 'amount', 250)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_owner_shift);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('T4_split_method', v_err);
  execute 'reset role';
  begin
    update public.sales set payment_method = 'bitcoin' where id = v_sale;
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 80); end;
  r := r || jsonb_build_object('T4_check', v_err);

  -- ------------------------------------------------------ T5 turno cerrado
  update public.shifts set status = 'closed', closed_at = now() where id = v_shift_w;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', 'rb-worker')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_pc, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 40); end;
  execute 'reset role';
  r := r || jsonb_build_object('T5_closed_shift', v_err);
  r := r || jsonb_build_object('T5_for_share',
    format('create_sale=%s void_sale=%s',
      pg_get_functiondef('public.create_sale(uuid,text,numeric,jsonb,uuid,text,text,jsonb,uuid,uuid,uuid,uuid,numeric,numeric)'::regprocedure) ~ 'status = ''open''\s+for share',
      pg_get_functiondef('public.void_sale(uuid,text)'::regprocedure) ~ 'status = ''open''\s+for share'));

  -- ---------------------------------------- T6 split válido sigue entrando
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_pc, 'quantity', 1)),
      p_payments => jsonb_build_array(
        jsonb_build_object('payment_method', 'efectivo', 'amount', 250),
        jsonb_build_object('payment_method', 'tarjeta', 'amount', 250)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_owner_shift);
    v_err := 'OK ' || (select payment_method || ' ' || total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 60); end;
  execute 'reset role';
  r := r || jsonb_build_object('T6_split_ok', v_err);

  raise exception 'ROLLBACK_OK %', r::text;
end;
$test$;
