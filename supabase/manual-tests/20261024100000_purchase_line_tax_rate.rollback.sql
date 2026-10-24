-- Prueba manual SIN persistir de:
--   20261024100000_purchase_line_tax_rate.sql
--
-- DO que termina en RAISE: nada queda escrito (ni el proveedor, ni los
-- productos, ni la compra, ni la sesión de prueba). Corre contra la base con la
-- migración YA aplicada.
--
-- Reproduce la factura real del caso: Pingüinos 7.014 con IVA 19 % + ICUI 20 %,
-- Pan Mantequilla 17.001 y Tostadas 12.332 exentos de IVA.
--
-- Resultado esperado:
--   factura: sub=36347.00 iva=1332.66 icui=1402.80 total=39082.46
--   tasas linea: ping=0.1900 pan=0.0000 tost=0.0000 (tostadas hereda del producto)
--   icui switch manda: sin_icui=0.00 | tasa invalida=22023
--   guard cabecera 0%: iva=1332.66 (las líneas mandan)
--   legada (lineas NULL, cabecera 19%): iva=6905.93 total=44655.73

do $test$
declare
  v_ws uuid; v_owner uuid; v_mem uuid;
  v_dist uuid; v_ping uuid; v_pan uuid; v_tost uuid;
  v_inv uuid; v_inv2 uuid;
  r record;
  v_msg text;
  v_out text := '';
begin
  select m.workspace_id, m.auth_user_id, m.id into v_ws, v_owner, v_mem
    from public.workspace_memberships m
   where m.member_kind = 'owner' and m.status = 'active'
   limit 1;
  if v_ws is null then raise exception 'Precondición: no hay negocio con dueño activo'; end if;

  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('iva-linea-test', v_owner, v_ws, v_mem);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated', 'session_id', 'iva-linea-test')::text, true);
  execute 'set local role authenticated';

  insert into public.distributors (business_name) values ('IVA Prueba Proveedor') returning id into v_dist;

  -- products.tax_rate se escribe desde el cliente (GRANT insert/update por columna).
  insert into public.products (name, sku, price, tracks_stock, icui_applies, tax_rate)
  values ('IVA Prueba Pingüinos', 'IVA-T-1', 10000, false, true, null) returning id into v_ping;
  insert into public.products (name, sku, price, tracks_stock, icui_applies, tax_rate)
  values ('IVA Prueba Pan', 'IVA-T-2', 20000, false, false, 0) returning id into v_pan;
  insert into public.products (name, sku, price, tracks_stock, icui_applies, tax_rate)
  values ('IVA Prueba Tostadas', 'IVA-T-3', 15000, false, false, 0) returning id into v_tost;

  v_inv := public.save_purchase_invoice(
    null,
    jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'IVA-TEST-1',
                       'status', 'paid', 'tax_rate', 0.19, 'icui_rate', 0.20),
    jsonb_build_array(
      jsonb_build_object('product_id', v_ping, 'description', 'Pingüinos', 'quantity', 1,
                         'unit_price', 7014, 'tax_rate', 0.19, 'icui_applies', true),
      jsonb_build_object('product_id', v_pan, 'description', 'Pan Mantequilla', 'quantity', 1,
                         'unit_price', 17001, 'tax_rate', 0, 'icui_applies', false),
      -- Sin claves: hereda tax_rate (0) e icui_applies (false) del producto.
      jsonb_build_object('product_id', v_tost, 'description', 'Tostadas', 'quantity', 1,
                         'unit_price', 12332)
    ));

  select subtotal, tax_amount, icui_amount, total into r from public.invoices where id = v_inv;
  v_out := v_out || format(E'\n  factura: sub=%s iva=%s icui=%s total=%s',
                           r.subtotal, r.tax_amount, r.icui_amount, r.total);
  if (r.subtotal, r.tax_amount, r.icui_amount, r.total) <> (36347.00, 1332.66, 1402.80, 39082.46) then
    raise exception 'FALLA factura: %', v_out;
  end if;

  v_out := v_out || format(E'\n  tasas linea: ping=%s pan=%s tost=%s',
    (select tax_rate from public.invoice_items where invoice_id = v_inv and product_id = v_ping),
    (select tax_rate from public.invoice_items where invoice_id = v_inv and product_id = v_pan),
    (select tax_rate from public.invoice_items where invoice_id = v_inv and product_id = v_tost));

  -- El switch de ICUI de la línea MANDA sobre el producto (antes se ignoraba).
  v_inv2 := public.save_purchase_invoice(
    null,
    jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'IVA-TEST-2',
                       'status', 'paid', 'tax_rate', 0.19, 'icui_rate', 0.20),
    jsonb_build_array(
      jsonb_build_object('product_id', v_ping, 'description', 'Pingüinos', 'quantity', 1,
                         'unit_price', 7014, 'tax_rate', 0.19, 'icui_applies', false)));
  v_out := v_out || format(E'\n  icui switch manda: sin_icui=%s',
    (select icui_amount from public.invoices where id = v_inv2));

  begin
    perform public.save_purchase_invoice(
      v_inv2,
      jsonb_build_object('distributor_id', v_dist, 'supplier_invoice_number', 'IVA-TEST-2',
                         'status', 'paid', 'tax_rate', 0.19, 'icui_rate', 0.20),
      jsonb_build_array(
        jsonb_build_object('product_id', v_ping, 'description', 'x', 'quantity', 1,
                           'unit_price', 1, 'tax_rate', 1.5)));
    v_msg := 'sin error';
  exception when others then
    v_msg := sqlstate;
  end;
  v_out := v_out || ' | tasa invalida=' || v_msg;

  -- Guard: el cliente cambia la tasa de cabecera; con líneas con tasa propia, mandan las líneas.
  update public.invoices set tax_rate = 0 where id = v_inv;
  v_out := v_out || format(E'\n  guard cabecera 0%%: iva=%s',
    (select tax_amount from public.invoices where id = v_inv));

  -- Compra legada: líneas sin tasa → la cuenta vieja sobre la cabecera.
  execute 'reset role';
  update public.invoice_items set tax_rate = null where invoice_id = v_inv;
  update public.invoices set tax_rate = 0.19 where id = v_inv;
  perform public.recompute_purchase_invoice_totals(v_inv);
  select tax_amount, total into r from public.invoices where id = v_inv;
  v_out := v_out || format(E'\n  legada (lineas NULL, cabecera 19%%): iva=%s total=%s', r.tax_amount, r.total);

  raise exception 'ROLLBACK (prueba): %', v_out;
end;
$test$;

-- ---- Post-check (DESPUÉS de correrlo) ----
--   select count(*) from public.distributors where business_name = 'IVA Prueba Proveedor';      -- 0
--   select count(*) from public.products where sku like 'IVA-T-%';                             -- 0
--   select count(*) from public.workspace_session_selections where session_id = 'iva-linea-test'; -- 0
