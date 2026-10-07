-- PRUEBA SIN PERSISTIR de Recetas y producción:
--   20261008100000_recipes_schema.sql
--   20261008100100_recipe_rpcs.sql
--   20261008100200_create_sale_void_sale_recipes.sql
--   20261008100300_production_batch_rpcs.sql
--   20261008100400_public_site_hides_ingredients.sql
--   20261008100500_products_cost_column_privileges.sql
--
-- Dos bloques DO que terminan SIEMPRE en `raise exception 'ROLLBACK_OK {...}'`:
-- la excepción aborta la transacción y no persiste nada (solo se consumen
-- valores de la secuencia de sale_number). Corren contra las migraciones YA
-- aplicadas. Correr cada bloque en su propia llamada.
--
-- Cuenta: la del E2E (dueño fc9d39c5…, membresía 76daf1f1…). El trabajador de
-- producción se crea dentro de la transacción y usa el staff "Profesor Piano
-- E2E" (una membresía de miembro exige staff_id; el plan de la cuenta no deja
-- crear staff nuevo). Productos, servicio, recetas y el módulo `production` se
-- crean/encienden dentro.
--
-- OJO al correrlo por MCP: un DELETE/REVOKE en la consulta dispara una
-- confirmación que, si nadie la acepta, vuelve como "Invalid or expired
-- requestState". Por eso los bloques no borran nada.
--
-- Resultado ensayado el 2026-10-08 contra producción:
--   Bloque A (recetas, guards, lotes, costos):
--     T0 latte con receta -> tracks_stock false
--     T8 cíclica directa e indirecta -> RECETA_CICLICA; café en ml -> UNIDAD_INCOMPATIBLE;
--        latte como insumo -> RECETA_INSUMO_SIN_STOCK; producto con 5 u. -> RECETA_CON_STOCK y con
--        p_clear_stock queda 0/false con 1 movimiento recipe_conversion; tracks_stock=true en el
--        latte -> RECETA_SIN_STOCK_PROPIO; café kg->Unidad -> RECETA_UNIDAD_INCOMPATIBLE; kg->g OK
--     T6 2 tandas como trabajador SOLO con `production`: 24 L de líquido, colorante -400 ml,
--        azúcar -4 kg, agua (sin stock) 0, 3 movimientos de kardex, costo del líquido 1000.83/L,
--        total_cost NULL para ese trabajador, cost_updated true
--     T9 mismo client_batch_id -> already_registered, 1 solo lote
--     T10 SELECT total_cost -> 42501; get_production_batch_costs: 0 filas al trabajador,
--         24020.00 al dueño; el trabajador de producción ve productos (10) y recetas (2)
--     T7 anular: colorante +400, azúcar +4, líquido -24, costo intacto; anular otra vez -> LOTE_YA_ANULADO
--   Bloque B (create_sale / void_sale):
--     venta latte x2 + producto normal + servicio tinte, y luego latte x1 con allow_oversell=false:
--       café 0.940, leche 1.400, vaso -2.000 (negativo, la venta NO se frena), normal -1,
--       tinte 0.940, latte 0; 4 consumos; 4 salidas '· receta'; stock_qty_applied latte 0,
--       normal 1, servicio 0; total 43000; 1 solo aviso 'insumo_bajo' del vaso
--     mismo client_sale_id -> misma venta (sin consumir de nuevo)
--     módulo apagado: la venta no consume; anular la primera venta igual devuelve todo:
--       café 0.980, leche 1.800, vaso 0, normal 0, tinte 1.000; 5 entradas 'sale_void'

-- ============================================================ Bloque A
do $test$
declare
  c_owner uuid := 'fc9d39c5-e583-4d86-891a-7e0c1c42eaab'; c_owner_m uuid := '76daf1f1-4723-40f2-9acb-e488c657fa71';
  v_prod_w uuid := gen_random_uuid(); v_prod_w_m uuid; v_staff uuid := 'dea2f6aa-7bf7-44f0-962a-399e04a1a7ff';
  v_cafe uuid; v_leche uuid; v_vaso uuid; v_latte uuid; v_colorante uuid; v_azucar uuid; v_agua uuid; v_liquido uuid; v_granizado uuid; v_conv uuid;
  v_batch jsonb; v_batch2 jsonb; v_void jsonb; v_client uuid := gen_random_uuid();
  v_a0 numeric; v_b0 numeric; v_c0 numeric; v_d0 numeric;
  r jsonb := '{}'::jsonb; v_err text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_prod_w, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rb-prod-' || v_prod_w || '@example.invalid', '{}', '{}', now(), now());
  insert into public.workspace_memberships (workspace_id, auth_user_id, invited_email, member_kind, status, accepted_at, activated_at, staff_id, permissions)
  values (c_owner, v_prod_w, 'rb-prod-' || v_prod_w || '@example.invalid', 'member', 'active', now(), now(), v_staff, '{"production": true}'::jsonb) returning id into v_prod_w_m;
  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('rb-owner', c_owner, c_owner, c_owner_m), ('rb-prod', v_prod_w, c_owner, v_prod_w_m);
  update public.profiles set modules = coalesce(modules, '{}'::jsonb) || '{"production": true}'::jsonb where id = c_owner;
  update public.settings set allow_oversell = true where user_id = c_owner;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Café', 'RB-CAFE', 0, 1, true, 'kg', 40000, 0.1, true) returning id into v_cafe;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Leche', 'RB-LECHE', 0, 2, true, 'L', 4000, 0, true) returning id into v_leche;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Vaso', 'RB-VASO', 0, 1, true, 'Unidad', 300, 0, true) returning id into v_vaso;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit) values (c_owner, 'RB Latte', 'RB-LATTE', 6000, 0, true, 'Unidad') returning id into v_latte;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Colorante', 'RB-COLOR', 0, 500, true, 'ml', 20, 0, true) returning id into v_colorante;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Azúcar', 'RB-AZUCAR', 0, 5, true, 'kg', 4000, 0, true) returning id into v_azucar;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Agua', 'RB-AGUA', 0, 0, false, 'L', 1, 0, true) returning id into v_agua;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Líquido granizado', 'RB-LIQ', 0, 0, true, 'L', 0, 0, true) returning id into v_liquido;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit) values (c_owner, 'RB Granizado 16oz', 'RB-GRAN', 5000, 0, true, 'Unidad') returning id into v_granizado;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit) values (c_owner, 'RB Con stock', 'RB-CONV', 1000, 5, true, 'Unidad') returning id into v_conv;

  perform set_config('role', 'authenticated', true);
  perform public.save_recipe(v_latte, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_cafe, 'quantity', 20, 'unit', 'g'), jsonb_build_object('ingredient_id', v_leche, 'quantity', 200, 'unit', 'ml'), jsonb_build_object('ingredient_id', v_vaso, 'quantity', 1, 'unit', 'Unidad')));
  perform public.save_recipe(v_liquido, null, 'production', jsonb_build_array(jsonb_build_object('ingredient_id', v_colorante, 'quantity', 200, 'unit', 'ml'), jsonb_build_object('ingredient_id', v_azucar, 'quantity', 2, 'unit', 'kg'), jsonb_build_object('ingredient_id', v_agua, 'quantity', 10, 'unit', 'L')), 12, 'L');
  perform public.save_recipe(v_granizado, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_liquido, 'quantity', 300, 'unit', 'ml'), jsonb_build_object('ingredient_id', v_vaso, 'quantity', 1, 'unit', 'Unidad')));
  begin perform public.save_recipe(v_liquido, null, 'production', jsonb_build_array(jsonb_build_object('ingredient_id', v_liquido, 'quantity', 1, 'unit', 'L')), 1, 'L'); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 30); end;
  r := r || jsonb_build_object('T8_cycle_self', v_err);
  begin perform public.save_recipe(v_azucar, null, 'production', jsonb_build_array(jsonb_build_object('ingredient_id', v_liquido, 'quantity', 1, 'unit', 'L')), 1, 'kg'); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 30); end;
  r := r || jsonb_build_object('T8_cycle_indirect', v_err);
  begin perform public.save_recipe(v_latte, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_cafe, 'quantity', 20, 'unit', 'ml'))); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 30); end;
  r := r || jsonb_build_object('T8_unit', v_err);
  begin perform public.save_recipe(v_granizado, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_latte, 'quantity', 1, 'unit', 'Unidad'))); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 30); end;
  r := r || jsonb_build_object('T8_ingredient_with_recipe', v_err);
  begin perform public.save_recipe(v_conv, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_vaso, 'quantity', 1, 'unit', 'Unidad'))); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 30); end;
  perform public.save_recipe(v_conv, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_vaso, 'quantity', 1, 'unit', 'Unidad')), null, null, null, true);
  execute 'reset role';
  r := r || jsonb_build_object('T0_latte_tracks', (select tracks_stock from public.products where id = v_latte),
    'T8_con_stock', v_err, 'T8_con_stock_cleared', (select stock_level || '/' || tracks_stock from public.products where id = v_conv),
    'T8_conv_kardex', (select count(*) from public.inventory_movements where product_id = v_conv and reference_type = 'recipe_conversion'));
  begin update public.products set tracks_stock = true where id = v_latte; v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 30); end;
  r := r || jsonb_build_object('T8_tracks', v_err);
  begin update public.products set unit = 'Unidad' where id = v_cafe; v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 30); end;
  r := r || jsonb_build_object('T8_unit_change', v_err);
  begin update public.products set unit = 'g' where id = v_cafe; v_err := 'OK'; exception when others then v_err := left(sqlerrm, 30); end;
  r := r || jsonb_build_object('T8_unit_kg_to_g_allowed', v_err);
  update public.products set unit = 'kg' where id = v_cafe;

  select stock_level into v_a0 from public.products where id = v_colorante; select stock_level into v_b0 from public.products where id = v_azucar;
  perform set_config('request.jwt.claims', json_build_object('sub', v_prod_w, 'role', 'authenticated', 'session_id', 'rb-prod')::text, true);
  perform set_config('role', 'authenticated', true);
  v_batch := public.register_production_batch(v_liquido, null, 2, 'prueba', v_client);
  v_batch2 := public.register_production_batch(v_liquido, null, 2, 'reintento', v_client);
  begin perform total_cost from public.production_batches limit 1; v_err := 'NO FALLO'; exception when others then v_err := sqlstate; end;
  r := r || jsonb_build_object('T10_batch_cost_select', v_err,
    'T10_worker_costs_rpc', (select count(*) from public.get_production_batch_costs(array[(v_batch ->> 'batch_id')::uuid])),
    'T10_worker_sees_batches', (select count(*) from public.production_batches where product_id = v_liquido),
    'T10_prod_worker_sees_products', (select count(*) from public.products where name like 'RB %'),
    'T10_prod_worker_sees_recipes', (select count(*) from public.recipes where product_id in (v_latte, v_liquido)));
  execute 'reset role';
  r := r || jsonb_build_object('T6_batch', v_batch, 'T9_retry', v_batch2 ->> 'already_registered',
    'T9_batches', (select count(*) from public.production_batches where client_batch_id = v_client),
    'T6_liquido', (select stock_level || ' L costo ' || purchase_price from public.products where id = v_liquido),
    'T6_colorante', (select stock_level from public.products where id = v_colorante) - v_a0, 'T6_azucar', (select stock_level from public.products where id = v_azucar) - v_b0,
    'T6_agua', (select stock_level from public.products where id = v_agua),
    'T6_kardex', (select count(*) from public.inventory_movements where reference_id = (v_batch ->> 'batch_id')::uuid and reference_type = 'production'));
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  perform set_config('role', 'authenticated', true);
  r := r || jsonb_build_object('T10_owner_costs_rpc', (select total_cost from public.get_production_batch_costs(array[(v_batch ->> 'batch_id')::uuid])));
  execute 'reset role';

  select stock_level into v_a0 from public.products where id = v_colorante; select stock_level into v_b0 from public.products where id = v_azucar;
  select stock_level into v_c0 from public.products where id = v_liquido; select purchase_price into v_d0 from public.products where id = v_liquido;
  perform set_config('request.jwt.claims', json_build_object('sub', v_prod_w, 'role', 'authenticated', 'session_id', 'rb-prod')::text, true);
  perform set_config('role', 'authenticated', true);
  v_void := public.void_production_batch((v_batch ->> 'batch_id')::uuid, 'prueba');
  begin perform public.void_production_batch((v_batch ->> 'batch_id')::uuid, 'otra vez'); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 20); end;
  execute 'reset role';
  r := r || jsonb_build_object('T7_void', v_void, 'T7_double', v_err,
    'T7_delta', format('colorante=%s azucar=%s liquido=%s', (select stock_level from public.products where id = v_colorante) - v_a0, (select stock_level from public.products where id = v_azucar) - v_b0, (select stock_level from public.products where id = v_liquido) - v_c0),
    'T7_cost_unchanged', (select purchase_price from public.products where id = v_liquido) = v_d0);
  raise exception 'ROLLBACK_OK %', r::text;
end;
$test$;

-- ============================================================ Bloque B
do $test$
declare
  c_owner uuid := 'fc9d39c5-e583-4d86-891a-7e0c1c42eaab'; c_owner_m uuid := '76daf1f1-4723-40f2-9acb-e488c657fa71'; v_shift uuid;
  v_cafe uuid; v_leche uuid; v_vaso uuid; v_latte uuid; v_tinte uuid; v_svc uuid; v_plain uuid;
  v_sale uuid; v_sale2 uuid; v_sale3 uuid; v_client uuid := gen_random_uuid(); v_d0 numeric;
  r jsonb := '{}'::jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id) values ('rb-owner', c_owner, c_owner, c_owner_m);
  update public.profiles set modules = coalesce(modules, '{}'::jsonb) || '{"production": true}'::jsonb where id = c_owner;
  update public.settings set allow_oversell = false where user_id = c_owner;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, is_ingredient) values (c_owner, 'RB Café', 'RB-CAFE', 0, 1, true, 'kg', 40000, true) returning id into v_cafe;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Leche', 'RB-LECHE', 0, 2, true, 'L', 4000, 0, true) returning id into v_leche;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Vaso', 'RB-VASO', 0, 1, true, 'Unidad', 300, 0, true) returning id into v_vaso;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit) values (c_owner, 'RB Latte', 'RB-LATTE', 6000, 0, true, 'Unidad') returning id into v_latte;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, is_ingredient) values (c_owner, 'RB Tinte', 'RB-TINTE', 0, 1, true, 'L', 50000, true) returning id into v_tinte;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit) values (c_owner, 'RB Normal', 'RB-NORMAL', 1000, 10, true, 'Unidad') returning id into v_plain;
  insert into public.services (user_id, name, price) values (c_owner, 'RB Tinte servicio', 30000) returning id into v_svc;
  select s.id into v_shift from public.shifts s where s.user_id = c_owner and s.membership_id = c_owner_m and s.worker_id = c_owner and s.status = 'open';
  perform set_config('role', 'authenticated', true);
  perform public.save_recipe(v_latte, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_cafe, 'quantity', 20, 'unit', 'g'), jsonb_build_object('ingredient_id', v_leche, 'quantity', 200, 'unit', 'ml'), jsonb_build_object('ingredient_id', v_vaso, 'quantity', 1, 'unit', 'Unidad')));
  perform public.save_recipe(null, v_svc, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_tinte, 'quantity', 60, 'unit', 'ml')));
  select stock_level into v_d0 from public.products where id = v_plain;
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0, p_items => jsonb_build_array(jsonb_build_object('product_id', v_latte, 'quantity', 2), jsonb_build_object('product_id', v_plain, 'quantity', 1), jsonb_build_object('service_id', v_svc, 'quantity', 1)), p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_shift, p_client_sale_id => v_client);
  v_sale2 := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0, p_items => jsonb_build_array(jsonb_build_object('product_id', v_latte, 'quantity', 2)), p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_shift, p_client_sale_id => v_client);
  v_sale3 := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0, p_items => jsonb_build_array(jsonb_build_object('product_id', v_latte, 'quantity', 1)), p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_shift);
  execute 'reset role';
  r := r || jsonb_build_object('T1_stock', format('cafe=%s leche=%s vaso=%s normal=%s tinte=%s latte=%s', (select stock_level from public.products where id = v_cafe), (select stock_level from public.products where id = v_leche), (select stock_level from public.products where id = v_vaso), (select stock_level from public.products where id = v_plain) - v_d0, (select stock_level from public.products where id = v_tinte), (select stock_level from public.products where id = v_latte)),
    'T1_consumptions', (select count(*) from public.sale_item_consumptions where sale_id = v_sale),
    'T1_kardex_receta', (select count(*) from public.inventory_movements where reference_id = v_sale and reference_type = 'sale' and notes like '%receta'),
    'T1_applied', (select string_agg(product_name || '=' || stock_qty_applied, ' ' order by product_name) from public.sale_items where sale_id = v_sale),
    'T1_total', (select total from public.sales where id = v_sale),
    'T2_notifications_vaso', (select count(*) from public.notifications where user_id = c_owner and type = 'insumo_bajo' and read_at is null and data ->> 'product_id' = v_vaso::text),
    'T9_same', v_sale = v_sale2);
  update public.profiles set modules = modules || '{"production": false}'::jsonb where id = c_owner;
  perform set_config('role', 'authenticated', true);
  v_sale2 := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0, p_items => jsonb_build_array(jsonb_build_object('product_id', v_latte, 'quantity', 1)), p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_shift);
  perform public.void_sale(v_sale, 'prueba recetas con módulo apagado');
  execute 'reset role';
  r := r || jsonb_build_object('T5_off_consumptions', (select count(*) from public.sale_item_consumptions where sale_id = v_sale2),
    'T3_after_void', format('cafe=%s leche=%s vaso=%s normal=%s tinte=%s', (select stock_level from public.products where id = v_cafe), (select stock_level from public.products where id = v_leche), (select stock_level from public.products where id = v_vaso), (select stock_level from public.products where id = v_plain) - v_d0, (select stock_level from public.products where id = v_tinte)),
    'T3_kardex', (select count(*) from public.inventory_movements where reference_id = v_sale and reference_type = 'sale_void'));
  raise exception 'ROLLBACK_OK %', r::text;
end;
$test$;
