-- PRUEBA SIN PERSISTIR de Presentaciones de insumos ("cada unidad trae"):
--   20261011100000_product_content_presentation.sql
--
-- Dos bloques DO que terminan SIEMPRE en `raise exception 'ROLLBACK_OK {...}'`:
-- la excepción aborta la transacción y no persiste nada (solo se consumen
-- valores de la secuencia de sale_number). Corren contra la migración YA
-- aplicada. Correr cada bloque en su propia llamada.
--
-- Cuenta: la del E2E (dueño fc9d39c5…, membresía 76daf1f1…). La cuenta NO
-- tiene fila en settings (se crea perezosa) ni turno abierto (el dueño está
-- exento): la fila de settings se inserta dentro de la transacción. Productos,
-- recetas y el módulo `production` se crean/encienden dentro.
--
-- OJO al correrlo por MCP: un DELETE/REVOKE en la consulta dispara una
-- confirmación que, si nadie la acepta, vuelve como "Invalid or expired
-- requestState". Por eso los bloques no borran nada.
--
-- Resultado ensayado el 2026-10-11 contra producción:
--   Bloque A (save_recipe, guard, lote, movimiento manual, CHECK, funciones):
--     T1 latte con leche (Unidad de 900 ml) a 150 ml -> línea "150.0000 ml"; la misma línea en kg ->
--        "UNIDAD_INCOMPATIBLE: RB Leche se maneja en Unidad de 900 ml y no se puede medir en kg"
--     T2 jarabe (Unidad de 1 L) con rendimiento "12 L" (azúcar 2 kg + leche 500 ml): rendimiento en kg ->
--        "UNIDAD_INCOMPATIBLE: el rendimiento en kg no se puede pasar a Unidad de 1 L (RB Jarabe)";
--        lote de 1 tanda -> output 12.000 Unidad, jarabe 12.000 Unidad costo 833.47, leche -0.556,
--        azúcar -2.000, items "RB Azúcar=2.000 kg RB Leche=0.556 Unidad", total_cost 10001.60, cost_complete
--     T3 leche Unidad->kg (contenido en null) -> "RECETA_UNIDAD_INCOMPATIBLE: RB Leche se usa en recetas
--        medido en ml, y eso no se puede pasar a kg"; Unidad->kg dejando el contenido -> mismo error
--        (22023, el guard evalúa el contenido como va a quedar); quitarle el contenido con la receta en ml
--        -> RECETA_UNIDAD_INCOMPATIBLE "...pasar a Unidad"; 900 ml -> 1 L -> OK (1.000 L);
--        Unidad->L sin contenido -> OK; jarabe sin contenido con rendimiento en L ->
--        "RECETA_UNIDAD_INCOMPATIBLE: la receta de producción de RB Jarabe rinde en L, y eso no se puede
--        pasar a Unidad"
--     T5 register_manual_movement 0,167 sobre la leche (con contenido) -> OK, delta -0.167;
--        0,5 sobre RB Caja (Unidad sin contenido) -> CANTIDAD_ENTERA
--     T6 CHECK products_content_shape: contenido en un producto en kg -> 23514; content_qty sin
--        content_unit -> 23514; content_unit 'Unidad' -> 23514; content_qty 0 -> 23514; caja 250 g -> OK
--     T7 product_unit_factor('ml','Unidad',900,'ml') = 0.00111…; ('g','Unidad',900,'ml') = null;
--        product_unit_label('Unidad',900.000,'ml') = "Unidad de 900 ml"
--   Bloque B (create_sale / void_sale):
--     T1 venta latte x2 -> leche 9.667 (10 - 0.333), consumo "0.333 Unidad costo 3600.0000",
--        kardex "out 0.333 Venta #N · receta", total 12000
--     T4 allow_oversell=false y leche en 0.100 -> create_sale falla con
--        "22023 INSUMO_INSUFICIENTE: RB Leche — hay 0.100 Unidad y la venta necesita 0.167";
--        0 ventas con ese client_sale_id, 1 solo consumo y 1 sola salida de kardex de la leche
--        (los de la primera venta), leche sigue en 0.100
--     T4b allow_oversell=true, la misma venta pasa: leche -0.067, 1 aviso insumo_bajo;
--         anular la primera venta devuelve 0.333 -> leche 0.266, entrada sale_void 0.333

-- ============================================================ Bloque A
do $test$
declare
  c_owner uuid := 'fc9d39c5-e583-4d86-891a-7e0c1c42eaab'; c_owner_m uuid := '76daf1f1-4723-40f2-9acb-e488c657fa71';
  v_leche uuid; v_latte uuid; v_jarabe uuid; v_azucar uuid; v_caja uuid;
  v_batch jsonb; v_client uuid := gen_random_uuid();
  v_l0 numeric; v_a0 numeric;
  r jsonb := '{}'::jsonb; v_err text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id) values ('rb-owner', c_owner, c_owner, c_owner_m);
  update public.profiles set modules = coalesce(modules, '{}'::jsonb) || '{"production": true}'::jsonb where id = c_owner;
  if exists (select 1 from public.settings where user_id = c_owner) then
    update public.settings set allow_oversell = true where user_id = c_owner;
  else
    insert into public.settings (user_id, allow_oversell) values (c_owner, true);
  end if;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, content_qty, content_unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Leche', 'RB-LECHE', 0, 10, true, 'Unidad', 900, 'ml', 3600, 0, true) returning id into v_leche;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit) values (c_owner, 'RB Latte', 'RB-LATTE', 6000, 0, true, 'Unidad') returning id into v_latte;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, content_qty, content_unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Jarabe', 'RB-JARABE', 0, 0, true, 'Unidad', 1, 'L', 0, 0, true) returning id into v_jarabe;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Azúcar', 'RB-AZUCAR', 0, 20, true, 'kg', 4000, 0, true) returning id into v_azucar;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, purchase_price, minimum_stock) values (c_owner, 'RB Caja', 'RB-CAJA', 1000, 5, true, 'Unidad', 500, 0) returning id into v_caja;

  -- T1: receta de venta medida en ml sobre un insumo en Unidad de 900 ml.
  perform set_config('role', 'authenticated', true);
  perform public.save_recipe(v_latte, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_leche, 'quantity', 150, 'unit', 'ml')));
  r := r || jsonb_build_object('T1_recipe_line', (select ri.quantity || ' ' || ri.unit from public.recipe_items ri join public.recipes rc on rc.id = ri.recipe_id where rc.product_id = v_latte));
  begin perform public.save_recipe(v_latte, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_leche, 'quantity', 1, 'unit', 'kg'))); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 100); end;
  r := r || jsonb_build_object('T1_line_kg', v_err);

  -- T2: preparado en Unidad de 1 L que rinde "12 L" = 12 botellas.
  perform public.save_recipe(v_jarabe, null, 'production', jsonb_build_array(jsonb_build_object('ingredient_id', v_azucar, 'quantity', 2, 'unit', 'kg'), jsonb_build_object('ingredient_id', v_leche, 'quantity', 500, 'unit', 'ml')), 12, 'L');
  begin perform public.save_recipe(v_jarabe, null, 'production', jsonb_build_array(jsonb_build_object('ingredient_id', v_azucar, 'quantity', 2, 'unit', 'kg')), 12, 'kg'); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 100); end;
  r := r || jsonb_build_object('T2_yield_kg', v_err);
  select stock_level into v_l0 from public.products where id = v_leche; select stock_level into v_a0 from public.products where id = v_azucar;
  v_batch := public.register_production_batch(v_jarabe, null, 1, 'prueba', v_client);
  execute 'reset role';
  r := r || jsonb_build_object('T2_batch', v_batch - 'batch_id',
    'T2_jarabe', (select stock_level || ' ' || unit || ' costo ' || purchase_price from public.products where id = v_jarabe),
    'T2_delta', format('leche=%s azucar=%s', (select stock_level from public.products where id = v_leche) - v_l0, (select stock_level from public.products where id = v_azucar) - v_a0),
    'T2_items', (select string_agg(ingredient_name || '=' || quantity || ' ' || unit, ' ' order by ingredient_name) from public.production_batch_items where batch_id = (v_batch ->> 'batch_id')::uuid));

  -- T3: el guard vigila unidad Y contenido.
  begin update public.products set unit = 'kg', content_qty = null, content_unit = null where id = v_leche; v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 110); end;
  r := r || jsonb_build_object('T3_leche_a_kg', v_err);
  begin update public.products set unit = 'kg' where id = v_leche; v_err := 'NO FALLO'; exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('T3_leche_a_kg_con_contenido', v_err);
  begin update public.products set content_qty = null, content_unit = null where id = v_leche; v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 110); end;
  r := r || jsonb_build_object('T3_leche_sin_contenido', v_err);
  begin update public.products set content_qty = 1, content_unit = 'L' where id = v_leche; v_err := 'OK'; exception when others then v_err := left(sqlerrm, 60); end;
  r := r || jsonb_build_object('T3_leche_900ml_a_1L', v_err || ' -> ' || (select content_qty || ' ' || content_unit from public.products where id = v_leche));
  begin update public.products set unit = 'L', content_qty = null, content_unit = null where id = v_leche; v_err := 'OK'; exception when others then v_err := left(sqlerrm, 60); end;
  r := r || jsonb_build_object('T3_leche_a_L_sin_contenido', v_err);
  update public.products set unit = 'Unidad', content_qty = 900, content_unit = 'ml' where id = v_leche;
  begin update public.products set content_qty = null, content_unit = null where id = v_jarabe; v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 120); end;
  r := r || jsonb_build_object('T3_jarabe_sin_contenido', v_err);

  -- T5: el ajuste manual acepta fracciones solo con contenido.
  select stock_level into v_l0 from public.products where id = v_leche;
  perform set_config('role', 'authenticated', true);
  perform public.register_manual_movement(v_leche, 'out', 0.167, 'bolsa abierta', 'unit');
  begin perform public.register_manual_movement(v_caja, 'out', 0.5, 'media caja', 'unit'); v_err := 'NO FALLO'; exception when others then v_err := left(sqlerrm, 60); end;
  execute 'reset role';
  r := r || jsonb_build_object('T5_leche_delta', (select stock_level from public.products where id = v_leche) - v_l0, 'T5_caja_media', v_err);

  -- T6: CHECK products_content_shape.
  begin update public.products set content_qty = 1, content_unit = 'kg' where id = v_azucar; v_err := 'NO FALLO'; exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 70); end;
  r := r || jsonb_build_object('T6_contenido_en_kg', v_err);
  begin update public.products set content_qty = 5 where id = v_caja; v_err := 'NO FALLO'; exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 70); end;
  r := r || jsonb_build_object('T6_qty_sin_unidad', v_err);
  begin update public.products set content_qty = 5, content_unit = 'Unidad' where id = v_caja; v_err := 'NO FALLO'; exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 70); end;
  r := r || jsonb_build_object('T6_unidad_no_medida', v_err);
  begin update public.products set content_qty = 0, content_unit = 'ml' where id = v_caja; v_err := 'NO FALLO'; exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 70); end;
  r := r || jsonb_build_object('T6_qty_cero', v_err);
  begin update public.products set content_qty = 250, content_unit = 'g' where id = v_caja; v_err := 'OK'; exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 70); end;
  r := r || jsonb_build_object('T6_caja_250g', v_err);

  -- T7: las funciones puras.
  r := r || jsonb_build_object('T7_factor_ml_bolsa', public.product_unit_factor('ml', 'Unidad', 900, 'ml'),
    'T7_factor_g_bolsa', public.product_unit_factor('g', 'Unidad', 900, 'ml'),
    'T7_label', public.product_unit_label('Unidad', 900.000, 'ml'));
  raise exception 'ROLLBACK_OK %', r::text;
end;
$test$;

-- ============================================================ Bloque B
do $test$
declare
  c_owner uuid := 'fc9d39c5-e583-4d86-891a-7e0c1c42eaab'; c_owner_m uuid := '76daf1f1-4723-40f2-9acb-e488c657fa71'; v_shift uuid;
  v_leche uuid; v_latte uuid; v_sale uuid; v_sale2 uuid; v_client_fail uuid := gen_random_uuid();
  r jsonb := '{}'::jsonb; v_err text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id) values ('rb-owner', c_owner, c_owner, c_owner_m);
  update public.profiles set modules = coalesce(modules, '{}'::jsonb) || '{"production": true}'::jsonb where id = c_owner;
  if exists (select 1 from public.settings where user_id = c_owner) then
    update public.settings set allow_oversell = true where user_id = c_owner;
  else
    insert into public.settings (user_id, allow_oversell) values (c_owner, true);
  end if;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, content_qty, content_unit, purchase_price, minimum_stock, is_ingredient) values (c_owner, 'RB Leche', 'RB-LECHE', 0, 10, true, 'Unidad', 900, 'ml', 3600, 0, true) returning id into v_leche;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit) values (c_owner, 'RB Latte', 'RB-LATTE', 6000, 0, true, 'Unidad') returning id into v_latte;
  select s.id into v_shift from public.shifts s where s.user_id = c_owner and s.membership_id = c_owner_m and s.worker_id = c_owner and s.status = 'open';

  -- T1: venta x2 -> 300 ml = 0,333 bolsas; el consumo se guarda en Unidad.
  perform set_config('role', 'authenticated', true);
  perform public.save_recipe(v_latte, null, 'sale', jsonb_build_array(jsonb_build_object('ingredient_id', v_leche, 'quantity', 150, 'unit', 'ml')));
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0, p_items => jsonb_build_array(jsonb_build_object('product_id', v_latte, 'quantity', 2)), p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_shift);
  execute 'reset role';
  r := r || jsonb_build_object('T1_leche', (select stock_level from public.products where id = v_leche),
    'T1_consumo', (select quantity || ' ' || unit || ' costo ' || unit_cost from public.sale_item_consumptions where sale_id = v_sale),
    'T1_kardex', (select type || ' ' || quantity || ' ' || notes from public.inventory_movements where reference_id = v_sale and reference_type = 'sale' and product_id = v_leche),
    'T1_total', (select total from public.sales where id = v_sale));

  -- T4: sin sobreventa, 0,1 bolsas no alcanzan para 0,167: la venta entera se cae.
  update public.settings set allow_oversell = false where user_id = c_owner;
  update public.products set stock_level = 0.1 where id = v_leche;
  perform set_config('role', 'authenticated', true);
  begin
    v_sale2 := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0, p_items => jsonb_build_array(jsonb_build_object('product_id', v_latte, 'quantity', 1)), p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_shift, p_client_sale_id => v_client_fail);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || left(sqlerrm, 100); end;
  execute 'reset role';
  r := r || jsonb_build_object('T4_error', v_err,
    'T4_ventas', (select count(*) from public.sales where client_sale_id = v_client_fail),
    'T4_consumos_leche', (select count(*) from public.sale_item_consumptions where ingredient_id = v_leche),
    'T4_kardex_leche', (select count(*) from public.inventory_movements where product_id = v_leche and reference_type = 'sale'),
    'T4_leche', (select stock_level from public.products where id = v_leche));

  -- T4b: con sobreventa la misma venta pasa (negativo + aviso) y anular la primera devuelve lo consumido.
  update public.settings set allow_oversell = true where user_id = c_owner;
  perform set_config('role', 'authenticated', true);
  v_sale2 := public.create_sale(p_customer_id => null, p_payment_method => 'tarjeta', p_discount_amount => 0, p_items => jsonb_build_array(jsonb_build_object('product_id', v_latte, 'quantity', 1)), p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_expected_shift_id => v_shift, p_client_sale_id => v_client_fail);
  execute 'reset role';
  r := r || jsonb_build_object('T4b_leche_tras_venta', (select stock_level from public.products where id = v_leche),
    'T4b_aviso', (select count(*) from public.notifications where user_id = c_owner and type = 'insumo_bajo' and read_at is null and data ->> 'product_id' = v_leche::text));
  perform set_config('role', 'authenticated', true);
  perform public.void_sale(v_sale, 'prueba presentaciones');
  execute 'reset role';
  r := r || jsonb_build_object('T4b_leche_tras_anular', (select stock_level from public.products where id = v_leche),
    'T4b_void_kardex', (select quantity from public.inventory_movements where reference_id = v_sale and reference_type = 'sale_void' and product_id = v_leche));
  raise exception 'ROLLBACK_OK %', r::text;
end;
$test$;
