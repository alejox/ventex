-- Prueba manual SIN persistir de:
--   20261007160000_purchase_order_counter.sql
--   20261007160100_purchase_order_guards_save_rpc.sql
--   20261007160200_invoice_items_stock_qty_applied.sql
--   20261007160300_receive_purchase_order_status_tax.sql
--
-- Todo corre dentro de un DO que termina en RAISE: el resultado viaja en el
-- mensaje del error y NADA queda escrito. Para ensayar ANTES de aplicar,
-- anteponer `begin;` + las cuatro migraciones y terminar con `rollback;`.
--
-- Mismas constantes que 20261007120000_purchases_accounting.rollback.sql
-- (dueño, distribuidor, p1 con units_per_package = 1, box con 24).
-- OJO: el bloque F de esa prueba inserta líneas en un pedido YA emitido, que
-- desde 20261007160100 rechaza `PEDIDO_NO_EDITABLE` (correcto).
--
-- Resultado esperado:
--   N numeros consecutivos max+1, max+2 y contador = max+2
--   S borrador 2 líneas -> edición 1 línea; línea inválida -> LINEA_PEDIDO_INVALIDA
--     y el borrador conserva su línea; emitir por RPC -> issued con issued_at;
--     editar emitido -> PEDIDO_NO_EDITABLE
--   G recibido directo / invoice_id directo -> PEDIDO_RECEPCION_POR_RPC;
--     línea en emitido -> PEDIDO_NO_EDITABLE (insert y delete);
--     draft->completed -> PEDIDO_TRANSICION_INVALIDA; issued->completed OK con completed_at;
--     completed->cancelled -> PEDIDO_CERRADO; insert received -> PEDIDO_ESTADO_INVALIDO
--   D borrar pedido emitido con líneas -> filas=1 (la cascada no choca con el guard)
--   R recibir pendiente con IVA 19%: box 30 u. a 150000/caja (1 caja + 6 sueltas =
--     187500) + p1 2 a 10000 = 207500 / 39425 / 246925, status pending,
--     stock_qty_applied 30 y 2; borrar pedido recibido -> PEDIDO_RECIBIDO_NO_SE_BORRA
--   T p1 deja de controlar stock y se anula la compra: p1 vuelve EXACTO (-2)
--     compra con p1 sin control: applied 0, stock no cambia; vuelve a controlar,
--     se anula: stock no cambia
--   L línea legado (applied NULL): anular usa tracks_stock actual

do $test$
declare
  v_ws     uuid := '9c632b09-56c3-4e64-a08b-50a64cc40110';
  v_sess   text := '2a715319-dc72-4b6e-a046-c418152c0518';
  v_dist   uuid := '7f685ea7-56e3-4f37-83a7-427383352043';
  v_p1     uuid := '3355b7a0-1be6-4dcd-acc3-8f5d8d144b27';
  v_box    uuid := '3976eb68-09ce-4a18-8846-4cdce2b8e42e';
  v_out    text := '';
  v_max    bigint;
  v_o1     uuid;
  v_o2     uuid;
  v_o3     uuid;
  v_inv    uuid;
  v_res    jsonb;
  v_s1     numeric;
  v_s1b    numeric;
  v_sb     numeric;
  v_sbb    numeric;
  v_n      integer;
  r        record;
begin
  select coalesce(max(order_number), 0) into v_max from public.purchase_orders where user_id = v_ws;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_sess)::text, true);
  execute 'set local role authenticated';

  -- N + S: numeración y save_purchase_order
  v_o1 := public.save_purchase_order(null,
    jsonb_build_object('distributor_id', v_dist, 'notes', 'a', 'status', 'draft'),
    jsonb_build_array(
      jsonb_build_object('product_id', v_p1, 'product_name', 'p1', 'quantity', 2, 'unit_price', 10000),
      jsonb_build_object('product_id', v_box, 'product_name', 'box', 'quantity', 30, 'unit_price', 150000)));
  v_o2 := public.save_purchase_order(null,
    jsonb_build_object('distributor_id', v_dist, 'status', 'draft'),
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'product_name', 'p1', 'quantity', 1, 'unit_price', 1)));
  execute 'reset role';
  select format(' | N o1=%s o2=%s (max antes %s) contador=%s',
           (select order_number from public.purchase_orders where id = v_o1),
           (select order_number from public.purchase_orders where id = v_o2),
           v_max,
           (select last_number from public.purchase_order_counters where user_id = v_ws)) as f into r;
  v_out := v_out || r.f;
  execute 'set local role authenticated';

  select count(*) into v_n from public.purchase_order_items where purchase_order_id = v_o1;
  v_out := v_out || format(' | S lineas=%s', v_n);
  perform public.save_purchase_order(v_o2,
    jsonb_build_object('distributor_id', v_dist, 'notes', 'editado', 'status', 'draft'),
    jsonb_build_array(jsonb_build_object('product_id', v_box, 'product_name', 'box', 'quantity', 5, 'unit_price', 150000)));
  select format(' edit lineas=%s notas=%s', count(*), max(po.notes)) as f into r
    from public.purchase_order_items poi join public.purchase_orders po on po.id = poi.purchase_order_id
   where poi.purchase_order_id = v_o2;
  v_out := v_out || r.f;
  begin
    perform public.save_purchase_order(v_o2, jsonb_build_object('status', 'draft'),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'product_name', 'p1', 'quantity', 0, 'unit_price', 1)));
    v_out := v_out || ' | S invalida SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | S invalida -> ' || left(sqlerrm, 21); end;
  select count(*) into v_n from public.purchase_order_items where purchase_order_id = v_o2;
  v_out := v_out || format(' conserva=%s', v_n);
  perform public.save_purchase_order(v_o2, jsonb_build_object('distributor_id', v_dist, 'status', 'issued'),
    jsonb_build_array(jsonb_build_object('product_id', v_box, 'product_name', 'box', 'quantity', 5, 'unit_price', 150000)));
  select format(' emitir st=%s issued_at=%s', status, issued_at is not null) as f into r
    from public.purchase_orders where id = v_o2;
  v_out := v_out || r.f;
  begin
    perform public.save_purchase_order(v_o2, jsonb_build_object('distributor_id', v_dist),
      jsonb_build_array(jsonb_build_object('product_id', v_box, 'product_name', 'box', 'quantity', 1, 'unit_price', 1)));
    v_out := v_out || ' | S editar emitido SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | S editar emitido -> ' || left(sqlerrm, 18); end;

  -- G: guards de escritura directa
  begin
    update public.purchase_orders set status = 'received' where id = v_o2;
    v_out := v_out || ' | G received SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | G received -> ' || left(sqlerrm, 24); end;
  begin
    update public.purchase_orders set invoice_id = gen_random_uuid() where id = v_o2;
    v_out := v_out || ' | G invoice_id SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | G invoice_id -> ' || left(sqlerrm, 24); end;
  begin
    insert into public.purchase_order_items (purchase_order_id, product_id, product_name, quantity, unit_price)
    values (v_o2, v_p1, 'x', 1, 1);
    v_out := v_out || ' | G insert linea SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | G insert linea -> ' || left(sqlerrm, 18); end;
  begin
    delete from public.purchase_order_items where purchase_order_id = v_o2;
    v_out := v_out || ' | G delete linea SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | G delete linea -> ' || left(sqlerrm, 18); end;
  insert into public.purchase_orders (distributor_id, status) values (v_dist, 'draft') returning id into v_o3;
  insert into public.purchase_order_items (purchase_order_id, product_id, product_name, quantity, unit_price)
  values (v_o3, v_p1, 'p1', 1, 1);
  begin
    update public.purchase_orders set status = 'completed' where id = v_o3;
    v_out := v_out || ' | G draft->completed SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | G draft->completed -> ' || left(sqlerrm, 26); end;
  update public.purchase_orders set status = 'issued' where id = v_o3;
  update public.purchase_orders set status = 'completed' where id = v_o3;
  select format(' | G issued->completed st=%s completed_at=%s', status, completed_at is not null) as f into r
    from public.purchase_orders where id = v_o3;
  v_out := v_out || r.f;
  begin
    update public.purchase_orders set status = 'cancelled' where id = v_o3;
    v_out := v_out || ' | G completed->cancelled SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | G completed->cancelled -> ' || left(sqlerrm, 14); end;
  begin
    insert into public.purchase_orders (distributor_id, status) values (v_dist, 'received');
    v_out := v_out || ' | G insert received SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | G insert received -> ' || left(sqlerrm, 22); end;

  -- D: borrar un pedido emitido con líneas (la cascada corre como dueño de la
  -- tabla y no la frena el guard de líneas)
  begin
    delete from public.purchase_orders where id = v_o2;
    get diagnostics v_n = row_count;
    v_out := v_out || format(' | D delete emitido filas=%s', v_n);
  exception when others then v_out := v_out || ' | D delete emitido -> ' || left(sqlerrm, 40) || ' (MAL)'; end;

  -- R: recibir pendiente con IVA
  execute 'reset role';
  select stock_level into v_s1 from public.products where id = v_p1;
  select stock_level into v_sb from public.products where id = v_box;
  execute 'set local role authenticated';
  perform public.save_purchase_order(v_o1, jsonb_build_object('distributor_id', v_dist, 'status', 'issued'),
    jsonb_build_array(
      jsonb_build_object('product_id', v_p1, 'product_name', 'p1', 'quantity', 2, 'unit_price', 10000),
      jsonb_build_object('product_id', v_box, 'product_name', 'box', 'quantity', 30, 'unit_price', 150000)));
  v_res := public.receive_purchase_order(v_o1, '2099-03-01', 'pending', 0.19);
  v_inv := (v_res->>'invoice_id')::uuid;
  select format(' | R %s/%s/%s st=%s rate=%s', subtotal, tax_amount, total, status, tax_rate) as f into r
    from public.invoices where id = v_inv;
  v_out := v_out || r.f;
  for r in select description, stock_qty_applied from public.invoice_items where invoice_id = v_inv order by description loop
    v_out := v_out || format(' [%s applied=%s]', r.description, r.stock_qty_applied);
  end loop;
  select format(' pedido st=%s', status) as f into r from public.purchase_orders where id = v_o1;
  v_out := v_out || r.f;
  begin
    delete from public.purchase_orders where id = v_o1;
    v_out := v_out || ' | R delete recibido SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | R delete recibido -> ' || left(sqlerrm, 27); end;

  -- T: tracks_stock cambia después de la compra
  execute 'reset role';
  update public.products set tracks_stock = false where id = v_p1;
  execute 'set local role authenticated';
  perform public.cancel_purchase_invoice(v_inv);
  execute 'reset role';
  select stock_level into v_s1b from public.products where id = v_p1;
  select stock_level into v_sbb from public.products where id = v_box;
  v_out := v_out || format(' | T anulada sin control: p1 %s box %s', v_s1b - v_s1, v_sbb - v_sb);
  execute 'set local role authenticated';
  v_inv := public.save_purchase_invoice(null,
    jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'TEST-T', 'issue_date', '2099-03-02'),
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'description', 'p1', 'quantity', 4, 'unit_price', 1)));
  execute 'reset role';
  select stock_level into v_s1b from public.products where id = v_p1;
  select format(' compra sin control applied=%s stock p1 %s', max(stock_qty_applied), v_s1b - v_s1) as f into r
    from public.invoice_items where invoice_id = v_inv;
  v_out := v_out || r.f;
  update public.products set tracks_stock = true where id = v_p1;
  execute 'set local role authenticated';
  perform public.cancel_purchase_invoice(v_inv);
  execute 'reset role';
  select stock_level into v_s1b from public.products where id = v_p1;
  v_out := v_out || format(' anulada con control: p1 %s', v_s1b - v_s1);

  -- L: legado
  execute 'set local role authenticated';
  v_inv := public.save_purchase_invoice(null,
    jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'TEST-L', 'issue_date', '2099-03-03'),
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'description', 'p1', 'quantity', 3, 'unit_price', 1)));
  execute 'reset role';
  update public.invoice_items set stock_qty_applied = null where invoice_id = v_inv;
  execute 'set local role authenticated';
  perform public.cancel_purchase_invoice(v_inv);
  execute 'reset role';
  select stock_level into v_s1b from public.products where id = v_p1;
  v_out := v_out || format(' | L legado anulada: p1 %s', v_s1b - v_s1);

  raise exception 'RESULTADO:%', v_out;
end;
$test$;
