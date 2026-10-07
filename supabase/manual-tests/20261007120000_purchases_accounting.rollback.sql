-- Prueba manual SIN persistir de:
--   20261007120000_purchase_totals_last_cost_save_rpc.sql
--   20261007120100_receive_purchase_order_rpc.sql
--   20261007120200_guard_purchase_invoice_writes.sql
--
-- Todo corre dentro de un DO que termina en RAISE: el resultado viaja en el
-- mensaje del error y NADA queda escrito. Se puede pegar tal cual en el SQL
-- editor o en execute_sql (para ensayar ANTES de aplicar, anteponer
-- `begin;` + las tres migraciones y terminar con `rollback;`).
--
-- Constantes del DECLARE (negocio con un producto por caja y un trabajador):
--   v_ws        id del dueño (= workspace)
--   v_sess      session_id de la membresía del dueño
--   v_w_m       membership de un trabajador (se le dan permisos SOLO dentro de la prueba)
--   v_w_auth    auth_user_id de ese trabajador
--   v_w_sess    session_id de esa membresía
--   v_dist      un distributor del negocio
--   v_p1, v_p2  productos con units_per_package = 1
--   v_box       producto con units_per_package > 1 (se asume 24)
--
-- Resultado esperado (ensayado el 2026-10-07 contra producción):
--   A totales=345000/65360/409360 (IVA sobre subtotal-descuento) stock p1 +3, box +53
--     costo p1=10000 box=140000 (precio de CAJA)
--   B edición: stock p1 +2, box -53; costo p1=11000; box vuelve al costo previo
--   C update status=cancelled -> COMPRA_ANULAR_CON_ACCION; update total=1 -> total
--     recalculado; delete -> COMPRA_NO_SE_BORRA; insert/delete líneas -> COMPRA_LINEAS_POR_RPC
--   D anular -> stock devuelto, costo NO cambia; reactivar -> COMPRA_ANULADA
--   E factura y cotización: insert/items/anular/reactivar/borrar OK
--   F recibir pedido: 1 compra, 2ª llamada already_received=true con el mismo id;
--     box 30 u. a 150000/caja = 1 caja + 6 sueltas = 187500; borrador -> PEDIDO_NO_EMITIDO
--   G trabajador con inventory_stock sin inventory_costs: la compra mueve el costo
--     (p2=5000); editar el costo a mano -> 0 filas (la RLS lo filtra)
--   H descuento > subtotal -> DESCUENTO_COMPRA_INVALIDO; status cancelled -> ESTADO_COMPRA_INVALIDO

do $test$
declare
  v_ws     uuid := '9c632b09-56c3-4e64-a08b-50a64cc40110';
  v_sess   text := '2a715319-dc72-4b6e-a046-c418152c0518';
  v_w_m    uuid := 'bcfcfb4b-bb05-4dd4-b3c1-4af5afe677ce';
  v_w_auth uuid := '149beae8-78e2-48da-a609-fbc09423b05e';
  v_w_sess text := '499462ba-6150-4c6c-b2be-119454046e7d';
  v_dist   uuid := '7f685ea7-56e3-4f37-83a7-427383352043';
  v_p1     uuid := '3355b7a0-1be6-4dcd-acc3-8f5d8d144b27';
  v_p2     uuid := '2c95767a-a518-4c1d-bad7-bd7ab8ee4c32';
  v_box    uuid := '3976eb68-09ce-4a18-8846-4cdce2b8e42e';
  v_out    text := '';
  v_inv    uuid;
  v_inv2   uuid;
  v_fac    uuid;
  v_order  uuid;
  v_draft  uuid;
  v_res    jsonb;
  v_res2   jsonb;
  v_s1     numeric; v_sb numeric; v_s1b numeric; v_sbb numeric;
  v_c1     numeric; v_cb numeric; v_cb0 numeric;
  r        record;
  v_n      integer;
begin
  select stock_level, purchase_price into v_s1, v_c1 from public.products where id = v_p1;
  select stock_level, purchase_price into v_sb, v_cb0 from public.products where id = v_box;
  v_out := v_out || format(' | inicio p1 stock=%s costo=%s box stock=%s costo=%s', v_s1, v_c1, v_sb, v_cb0);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ws, 'role', 'authenticated', 'session_id', v_sess)::text, true);
  execute 'set local role authenticated';

  -- A: alta
  v_inv := public.save_purchase_invoice(null,
    jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', ' test-a1 ',
      'status', 'pending', 'issue_date', '2099-01-01', 'discount_amount', 1000, 'tax_rate', 0.19),
    jsonb_build_array(
      jsonb_build_object('product_id', v_p1, 'description', 'p1', 'quantity', 3, 'package_quantity', 0,
        'unit_price', 10000, 'package_price', 0, 'units_per_package', 1, 'line_total', 1),
      jsonb_build_object('product_id', v_box, 'description', 'box', 'quantity', 53, 'package_quantity', 2,
        'unit_price', 7000, 'package_price', 140000, 'units_per_package', 24, 'line_total', 1)));
  select format(' | A sup=%s tot=%s/%s/%s', supplier_invoice_number, subtotal, tax_amount, total) into r
    from public.invoices where id = v_inv;
  v_out := v_out || r.format;
  execute 'reset role';
  select stock_level, purchase_price into v_s1b, v_c1 from public.products where id = v_p1;
  select stock_level, purchase_price into v_sbb, v_cb from public.products where id = v_box;
  v_out := v_out || format(' stock p1 %s box %s costo p1=%s box=%s', v_s1b - v_s1, v_sbb - v_sb, v_c1, v_cb);
  execute 'set local role authenticated';

  -- B: edición (quita la caja)
  perform public.save_purchase_invoice(v_inv,
    jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'TEST-A1',
      'status', 'paid', 'issue_date', '2099-01-01', 'discount_amount', 0, 'tax_rate', 0.19),
    jsonb_build_array(
      jsonb_build_object('product_id', v_p1, 'description', 'p1', 'quantity', 5, 'package_quantity', 0,
        'unit_price', 11000, 'package_price', 0, 'units_per_package', 1)));
  execute 'reset role';
  select stock_level, purchase_price into v_s1b, v_c1 from public.products where id = v_p1;
  select stock_level, purchase_price into v_sbb, v_cb from public.products where id = v_box;
  select format(' | B tot=%s/%s/%s status=%s', subtotal, tax_amount, total, status) into r from public.invoices where id = v_inv;
  v_out := v_out || r.format || format(' stock p1 %s box %s costo p1=%s box=%s (antes %s)',
    v_s1b - v_s1, v_sbb - v_sb, v_c1, v_cb, v_cb0);
  execute 'set local role authenticated';

  -- C: escrituras directas sobre la compra
  begin
    update public.invoices set status = 'cancelled' where id = v_inv;
    v_out := v_out || ' | C cancelled directo SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | C cancelled -> ' || left(sqlerrm, 26); end;
  update public.invoices set total = 1, subtotal = 1 where id = v_inv;
  select format(' | C total=1 -> %s/%s', subtotal, total) into r from public.invoices where id = v_inv;
  v_out := v_out || r.format;
  update public.invoices set status = 'pending' where id = v_inv;
  v_out := v_out || ' | C paid->pending OK';
  begin
    delete from public.invoices where id = v_inv;
    v_out := v_out || ' | C delete SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | C delete -> ' || left(sqlerrm, 20); end;
  begin
    insert into public.invoice_items (invoice_id, product_id, description, quantity, unit_price, line_total)
    values (v_inv, v_p1, 'x', 1, 1, 1);
    v_out := v_out || ' | C insert item SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | C insert item -> ' || left(sqlerrm, 22); end;
  begin
    delete from public.invoice_items where invoice_id = v_inv;
    get diagnostics v_n = row_count;
    v_out := v_out || format(' | C delete items SIN ERROR rows=%s (MAL)', v_n);
  exception when others then v_out := v_out || ' | C delete items -> ' || left(sqlerrm, 22); end;

  -- D: anular y reactivar
  perform public.cancel_purchase_invoice(v_inv);
  execute 'reset role';
  select stock_level, purchase_price into v_s1b, v_c1 from public.products where id = v_p1;
  v_out := v_out || format(' | D anulada: stock p1 %s costo p1=%s', v_s1b - v_s1, v_c1);
  execute 'set local role authenticated';
  begin
    update public.invoices set status = 'paid' where id = v_inv;
    v_out := v_out || ' | D reactivar SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | D reactivar -> ' || left(sqlerrm, 14); end;

  -- E: factura y cotización siguen libres
  insert into public.invoices (type, issue_date, subtotal, total) values ('factura', current_date, 10, 10)
  returning id into v_fac;
  insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total)
  values (v_fac, 'serv', 1, 10, 10);
  update public.invoice_items set quantity = 2, line_total = 20 where invoice_id = v_fac;
  update public.invoices set status = 'cancelled' where id = v_fac;
  update public.invoices set status = 'pending', total = 20 where id = v_fac;
  delete from public.invoices where id = v_fac;
  insert into public.invoices (type, issue_date) values ('cotizacion', current_date) returning id into v_fac;
  insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total)
  values (v_fac, 'serv', 1, 10, 10);
  delete from public.invoice_items where invoice_id = v_fac;
  delete from public.invoices where id = v_fac;
  v_out := v_out || ' | E factura/cotizacion OK';

  -- F: recibir pedido
  insert into public.purchase_orders (distributor_id, status, issued_at) values (v_dist, 'issued', now())
  returning id into v_order;
  insert into public.purchase_order_items (purchase_order_id, product_id, product_name, quantity, unit_price) values
    (v_order, v_box, 'box', 30, 150000),
    (v_order, v_p2, 'p2', 2, 4700),
    (v_order, null, 'texto libre', 1, 999);
  v_res := public.receive_purchase_order(v_order, '2099-02-01');
  v_res2 := public.receive_purchase_order(v_order, '2099-02-01');
  select count(*) into v_n from public.invoices i join public.purchase_orders po on i.supplier_invoice_number = 'PED-' || po.order_number
   where po.id = v_order and i.type = 'compra';
  v_out := v_out || format(' | F res=%s res2=%s mismo=%s compras=%s', v_res->>'already_received', v_res2->>'already_received',
    (v_res->>'invoice_id') = (v_res2->>'invoice_id'), v_n);
  for r in select ii.description, ii.package_quantity, ii.quantity, ii.unit_price, ii.package_price, ii.line_total
             from public.invoice_items ii where ii.invoice_id = (v_res->>'invoice_id')::uuid order by ii.description loop
    v_out := v_out || format(' [%s cj=%s q=%s u=%s c=%s lt=%s]', r.description, r.package_quantity, r.quantity, r.unit_price, r.package_price, r.line_total);
  end loop;
  select format(' st=%s', status) into r from public.purchase_orders where id = v_order;
  v_out := v_out || r.format;
  execute 'reset role';
  select purchase_price into v_cb from public.products where id = v_box;
  v_out := v_out || format(' costo box=%s', v_cb);
  execute 'set local role authenticated';
  insert into public.purchase_orders (distributor_id, status) values (v_dist, 'draft') returning id into v_draft;
  begin
    perform public.receive_purchase_order(v_draft);
    v_out := v_out || ' | F borrador SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | F borrador -> ' || left(sqlerrm, 17); end;

  -- H: validaciones
  begin
    perform public.save_purchase_invoice(null,
      jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'X', 'discount_amount', 999999),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'description', 'p1', 'quantity', 1, 'unit_price', 10)));
    v_out := v_out || ' | H descuento SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | H descuento -> ' || left(sqlerrm, 25); end;
  begin
    perform public.save_purchase_invoice(null,
      jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'X', 'status', 'cancelled'),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'description', 'p1', 'quantity', 1, 'unit_price', 10)));
    v_out := v_out || ' | H cancelled SIN ERROR (MAL)';
  exception when others then v_out := v_out || ' | H cancelled -> ' || left(sqlerrm, 22); end;

  -- G: trabajador con inventory_stock y SIN inventory_costs / inventory_edit
  execute 'reset role';
  update public.workspace_memberships
     set permissions = permissions || '{"inventory_stock": true, "inventory": true}'::jsonb - 'inventory_costs' - 'inventory_edit'
   where id = v_w_m;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_w_auth, 'role', 'authenticated', 'session_id', v_w_sess)::text, true);
  execute 'set local role authenticated';
  v_inv2 := public.save_purchase_invoice(null,
    jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'TEST-W', 'issue_date', '2099-03-01'),
    jsonb_build_array(jsonb_build_object('product_id', v_p2, 'description', 'p2', 'quantity', 1, 'unit_price', 5000)));
  execute 'reset role';
  select purchase_price into v_c1 from public.products where id = v_p2;
  v_out := v_out || format(' | G trabajador: compra ok, costo p2=%s', v_c1);
  execute 'set local role authenticated';
  begin
    -- La RLS de escritura (inventory_edit) filtra la fila: 0 filas, sin error.
    update public.products set purchase_price = 1 where id = v_p2;
    get diagnostics v_n = row_count;
    v_out := v_out || format(' | G costo a mano rows=%s (esperado 0)', v_n);
  exception when others then v_out := v_out || ' | G costo a mano -> ' || left(sqlerrm, 11); end;
  execute 'reset role';

  raise exception 'RESULTADO (rollback): %', v_out;
end;
$test$;
