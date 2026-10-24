-- Prueba manual SIN persistir de:
--   20261024200000_sale_line_tax_rate.sql
--
-- DO que termina en RAISE: nada queda escrito (ni productos, ni cliente, ni
-- ventas, ni la sesión de prueba, ni el cambio a settings). Corre contra la
-- base con la migración YA aplicada, como el dueño de un negocio activo.
--
-- Caso real (tienda): Pingüinos 3 × 2.338 (IVA 19 %, hereda la tasa del
-- negocio) + Pan 3 × 5.667 (exento) + Tostadas 4 × 3.083 (exento).
-- Bruto 36.347; neto gravado 7.014; base gravada round(7014/1,19, 2) = 5894.12.
--
-- Resultado esperado:
--   A mixta:          sub=35227.12 iva=1119.88 total=36347.00 | tasas (tost,ping,pan) 0.0000,0.1900,0.0000
--   B cliente exento: sub=35227.12 iva=0.00 total=35227.12 (= 29333 + 5894.12) | tasas 0,0,0
--   C una sola tasa:  sub=19900.56 iva=3781.11 total=23681.67 = cuenta vieja round(neto/1,19, 2)
--   D mixta + descuento 1000 SIN desglose (prorrateo): sub=34257.93 iva=1089.07 total=35347.00
--   E include_tax=false (cliente exento): sub=36347.00 iva=0.00 total=36347.00 | tasas 0,0,0

do $test$
declare
  v_ws uuid; v_owner uuid; v_mem uuid; v_shift uuid;
  v_ping uuid; v_pan uuid; v_tost uuid; v_cust uuid;
  v_sale uuid;
  r record;
  v_rates text;
  v_out text := '';
  v_items jsonb;
begin
  -- Un dueño con ventas recientes (plan activo: assert_monthly_sales_limit).
  select m.workspace_id, m.auth_user_id, m.id into v_ws, v_owner, v_mem
    from public.workspace_memberships m
    join public.sales s on s.membership_id = m.id
   where m.member_kind = 'owner' and m.status = 'active'
   order by s.created_at desc
   limit 1;
  if v_ws is null then raise exception 'Precondición: no hay negocio con dueño activo'; end if;

  -- Ajustes del negocio para la prueba (se deshacen con el RAISE final).
  insert into public.settings (user_id, tax_rate, include_tax)
  values (v_ws, 0.19, true)
  on conflict (user_id) do update set tax_rate = 0.19, include_tax = true;

  select sh.id into v_shift from public.shifts sh
   where sh.user_id = v_ws and sh.membership_id = v_mem and sh.worker_id = v_owner and sh.status = 'open';

  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('iva-venta-test', v_owner, v_ws, v_mem);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated', 'session_id', 'iva-venta-test')::text, true);
  execute 'set local role authenticated';

  insert into public.products (name, sku, price, tracks_stock, tax_rate)
  values ('IVA Venta Pingüinos', 'IVA-V-1', 2338, false, null) returning id into v_ping;
  insert into public.products (name, sku, price, tracks_stock, tax_rate)
  values ('IVA Venta Pan', 'IVA-V-2', 5667, false, 0) returning id into v_pan;
  insert into public.products (name, sku, price, tracks_stock, tax_rate)
  values ('IVA Venta Tostadas', 'IVA-V-3', 3083, false, 0) returning id into v_tost;
  insert into public.customers (full_name, tax_exempt) values ('IVA Venta Cliente Exento', true)
  returning id into v_cust;

  v_items := jsonb_build_array(
    jsonb_build_object('product_id', v_ping, 'quantity', 3, 'discount_amount', 0),
    jsonb_build_object('product_id', v_pan, 'quantity', 3, 'discount_amount', 0),
    jsonb_build_object('product_id', v_tost, 'quantity', 4, 'discount_amount', 0));

  -- A: mixta, sin cliente.
  v_sale := public.create_sale(null, 'efectivo', 0, v_items,
    p_expected_workspace_id => v_ws, p_expected_membership_id => v_mem, p_expected_shift_id => v_shift);
  select s.subtotal, s.tax_amount, s.total, s.tax_rate into r from public.sales s where s.id = v_sale;
  select string_agg(si.tax_rate::text, ',' order by si.product_name desc) into v_rates from public.sale_items si where si.sale_id = v_sale;
  v_out := v_out || format('A sub=%s iva=%s total=%s sales.tax_rate=%s tasas(tost,ping,pan)=%s', r.subtotal, r.tax_amount, r.total, r.tax_rate, v_rates);
  if r.tax_amount <> 7014 - round(7014 / 1.19, 2) or r.total <> 36347 or r.subtotal <> 29333 + round(7014 / 1.19, 2) then
    raise exception 'FALLA A: %', v_out;
  end if;

  -- B: cliente exento → solo se quita el IVA del Pingüinos.
  v_sale := public.create_sale(v_cust, 'efectivo', 0, v_items,
    p_expected_workspace_id => v_ws, p_expected_membership_id => v_mem, p_expected_shift_id => v_shift);
  select s.subtotal, s.tax_amount, s.total, s.tax_rate into r from public.sales s where s.id = v_sale;
  select string_agg(si.tax_rate::text, ',') into v_rates from public.sale_items si where si.sale_id = v_sale;
  v_out := v_out || format(E'\nB sub=%s iva=%s total=%s tasas=%s', r.subtotal, r.tax_amount, r.total, v_rates);
  if r.tax_amount <> 0 or r.total <> 29333 + round(7014 / 1.19, 2) then
    raise exception 'FALLA B: %', v_out;
  end if;

  -- C: todo a la tasa del negocio (2 líneas de Pingüinos-tipo), con descuento
  -- por línea → idéntico a la cuenta vieja sobre el neto.
  update public.products set tax_rate = null where id = v_pan;
  v_sale := public.create_sale(null, 'efectivo', 333.33, jsonb_build_array(
      jsonb_build_object('product_id', v_ping, 'quantity', 3, 'discount_amount', 111.11),
      jsonb_build_object('product_id', v_pan, 'quantity', 3, 'discount_amount', 222.22)),
    p_expected_workspace_id => v_ws, p_expected_membership_id => v_mem, p_expected_shift_id => v_shift);
  select s.subtotal, s.tax_amount, s.total into r from public.sales s where s.id = v_sale;
  v_out := v_out || format(E'\nC sub=%s iva=%s total=%s (vieja: sub=%s)', r.subtotal, r.tax_amount, r.total,
    round((24015 - 333.33) / 1.19, 2));
  if r.subtotal <> round((24015 - 333.33) / 1.19, 2) or r.total <> 24015 - 333.33
     or r.tax_amount <> round((24015 - 333.33) - round((24015 - 333.33) / 1.19, 2), 2) then
    raise exception 'FALLA C: %', v_out;
  end if;
  update public.products set tax_rate = 0 where id = v_pan;

  -- D: mixta con descuento de venta SIN desglose (cola offline vieja):
  -- prorrateo por line_total + residuo a la línea de mayor neto.
  -- Bruto 36347, desc 1000: ping 7014-192.97=6821.03, pan 17001-467.74=16533.26,
  -- tost 12332-339.29=11992.71 → Σ 35347.00 (sin residuo).
  -- Base gravada round(6821.03/1,19,2)=5731.96 + exenta 28525.97 → sub=34257.93.
  v_sale := public.create_sale(null, 'efectivo', 1000, jsonb_build_array(
      jsonb_build_object('product_id', v_ping, 'quantity', 3),
      jsonb_build_object('product_id', v_pan, 'quantity', 3),
      jsonb_build_object('product_id', v_tost, 'quantity', 4)),
    p_expected_workspace_id => v_ws, p_expected_membership_id => v_mem, p_expected_shift_id => v_shift);
  select s.subtotal, s.tax_amount, s.total into r from public.sales s where s.id = v_sale;
  v_out := v_out || format(E'\nD sub=%s iva=%s total=%s', r.subtotal, r.tax_amount, r.total);
  if r.total <> 35347 or r.subtotal <> round(6821.03 / 1.19, 2) + (35347 - 6821.03) then
    raise exception 'FALLA D: %', v_out;
  end if;

  -- E: negocio sin IVA.
  execute 'reset role';
  update public.settings set include_tax = false where user_id = v_ws;
  execute 'set local role authenticated';
  v_sale := public.create_sale(v_cust, 'efectivo', 0, v_items,
    p_expected_workspace_id => v_ws, p_expected_membership_id => v_mem, p_expected_shift_id => v_shift);
  select s.subtotal, s.tax_amount, s.total into r from public.sales s where s.id = v_sale;
  select string_agg(si.tax_rate::text, ',') into v_rates from public.sale_items si where si.sale_id = v_sale;
  v_out := v_out || format(E'\nE sub=%s iva=%s total=%s tasas=%s', r.subtotal, r.tax_amount, r.total, v_rates);
  if r.tax_amount <> 0 or r.total <> 36347 then
    raise exception 'FALLA E: %', v_out;
  end if;

  raise exception E'OK (rollback)\n%', v_out;
end
$test$;
