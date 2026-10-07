-- PRUEBA SIN PERSISTIR de
--   20261007100000_create_sale_discount_cap_net_commission_customer_check.sql
--   20261007100100_void_sale_refund_routing_credit_guard.sql
--
-- Todo corre dentro de UN bloque DO que termina SIEMPRE en `raise exception`:
-- la excepción aborta la transacción entera (DDL de las migraciones, usuario y
-- membresía de prueba, ventas, turnos, clientes), así que no persiste nada aunque
-- el cliente SQL esté en autocommit. El resultado viaja en el mensaje del error
-- ("ROLLBACK_OK {...json...}"). ÚNICO efecto no transaccional: cada INSERT en
-- `sales` consume un valor de `sales_sale_number_seq`.
--
-- Cuenta: la del E2E (test-md4hv70zu@srv1.mail-tester.com). El trabajador, sus
-- turnos, el cliente, las ofertas, el hito y `settings` se crean dentro de la
-- transacción y desaparecen con el rollback.
--
-- Este archivo NO es una migración. Los bloques `execute $migN$ ... $migN$`
-- contienen las migraciones completas, copiadas tal cual; si se editan,
-- regenerar este archivo.
do $test$
declare
  c_owner    uuid := 'fc9d39c5-e583-4d86-891a-7e0c1c42eaab';
  c_owner_m  uuid := '76daf1f1-4723-40f2-9acb-e488c657fa71';
  c_seller   uuid := 'dea2f6aa-7bf7-44f0-962a-399e04a1a7ff'; -- staff "Profesor Piano E2E"
  v_worker   uuid := gen_random_uuid();
  v_worker_m uuid;
  v_cat      uuid;
  v_p1       uuid;  -- 10.000, categoría con ofertas
  v_p2       uuid;  -- 5.000, sin ofertas
  v_p3       uuid;  -- 10.000, comisión 10 %
  v_p4       uuid;  -- 10.000, comisión fija 500
  v_s1       uuid;  -- servicio 20.000 que cuenta como corte
  v_cust     uuid;
  v_cust2    uuid;
  v_shift_w  uuid;
  v_shift_w2 uuid;
  v_sale     uuid;
  v_res      jsonb;
  r          jsonb := '{}'::jsonb;
  v_err      text;
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

  insert into public.categories (user_id, name) values (c_owner, 'CAT ROLLBACK') returning id into v_cat;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, category_id)
  values (c_owner, 'P1 ROLLBACK', 'RB-P1', 10000, 0, false, 'Unidad', v_cat) returning id into v_p1;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit)
  values (c_owner, 'P2 ROLLBACK', 'RB-P2', 5000, 0, false, 'Unidad') returning id into v_p2;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, has_commission, commission_type, commission_value)
  values (c_owner, 'P3 ROLLBACK', 'RB-P3', 10000, 0, false, 'Unidad', true, 'percentage', 10) returning id into v_p3;
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit, has_commission, commission_type, commission_value)
  values (c_owner, 'P4 ROLLBACK', 'RB-P4', 10000, 0, false, 'Unidad', true, 'fixed', 500) returning id into v_p4;
  insert into public.services (user_id, name, price, status)
  values (c_owner, 'CORTE ROLLBACK', 20000, 'active') returning id into v_s1;

  -- Oferta 20 % al producto y "lleva 3 paga 2" a la categoría: con 3 unidades
  -- gana la segunda (10.000 > 6.000). Una oferta vencida no debe contar.
  insert into public.product_offers (user_id, name, kind, value, product_id, active)
  values (c_owner, 'O 20%', 'percent', 20, v_p1, true);
  insert into public.product_offers (user_id, name, kind, buy_qty, pay_qty, category_id, active)
  values (c_owner, 'O 3x2', 'buy_n_pay_m', 3, 2, v_cat, true);
  insert into public.product_offers (user_id, name, kind, value, product_id, active, starts_on, ends_on)
  values (c_owner, 'O vencida', 'percent', 90, v_p2, true, current_date - 30, current_date - 10);

  delete from public.settings where user_id = c_owner;
  insert into public.settings (user_id, tax_rate, include_tax, promo_enabled, promo_service_ids, points_enabled, points_value)
  values (c_owner, 0.19, true, true, array[v_s1], true, 100);
  insert into public.promo_milestones (user_id, threshold, reward, is_active, reward_kind)
  values (c_owner, 10, 'Corte gratis', true, 'gratis');

  insert into public.customers (user_id, full_name, haircuts_since_reward, loyalty_points, credit_balance)
  values (c_owner, 'CLIENTE ROLLBACK', 10, 50, 0) returning id into v_cust;
  insert into public.customers (user_id, full_name, haircuts_since_reward, loyalty_points, credit_balance)
  values (c_owner, 'CLIENTE ROLLBACK 2', 0, 0, 0) returning id into v_cust2;

  insert into public.shifts (user_id, worker_id, membership_id, status, opening_cash)
  values (c_owner, v_worker, v_worker_m, 'open', 0) returning id into v_shift_w;

  -- ------------------------------------------------- migraciones (en la tx)
  execute $mig1$
-- create_sale: tope de descuento server-side para trabajadores sin
-- `pos_discount`, comisión porcentual sobre el NETO de la línea y validación
-- del cliente.
--
-- Construida sobre la definición VIVA (pg_get_functiondef al 2026-10-07), no
-- sobre el último .sql del repo. La firma NO cambia (14 argumentos, los dos
-- últimos con default): `create or replace` alcanza y no hay que tocar al
-- cliente ni a la cola offline.
--
-- [#4] DESCUENTO_NO_JUSTIFICADO. `p_manual_discount` lo declara el cliente:
--   un trabajador sin `pos_discount` podía mandar p_manual_discount = 0 y todo
--   el descuento en p_discount_amount (venta de $0). Ahora, para ESE cajero, el
--   descuento total no puede superar lo que el servidor puede justificar:
--     · ofertas de producto vigentes (espejo de `offerDiscountsFor`: la MEJOR
--       oferta de cada línea, `amount` por unidad topado en la línea, `percent`,
--       `buy_n_pay_m` solo con cantidad entera, ventana de fechas evaluada con
--       holgura de husos —de UTC-12 a UTC+14— porque `settings` no guarda la
--       zona del negocio y ante la duda no se bloquea),
--     · el premio de cortes disponible (hitos activos alcanzados por
--       `haircuts_since_reward` ANTES de esta venta; topado en el precio del
--       servicio que cuenta más caro del carrito; se toma el mayor de los
--       hitos alcanzados, más laxo que el POS que entrega el de umbral mayor),
--     · los puntos del cliente (`loyalty_points × settings.points_value`; el
--       canje real corre después de la venta, así que el saldo aún los incluye).
--   Tolerancia ±0,01. Dueño/administrador y trabajadores CON `pos_discount`:
--   sin cambios. Los flags `promo_enabled`/`points_enabled` NO se exigen a
--   propósito: el tope queda igual de acotado y no se bloquea una venta
--   legítima por un cambio de configuración a mitad de turno.
--   LÍMITE: una venta encolada offline con una oferta que se desactiva o vence
--   antes de reenviarse cae en este error (42501 → bandeja de conflictos).
--
-- [#10] Comisión porcentual sobre el neto: line_total − descuento de la línea
--   (IVA incluido, como siempre). Sin desglose por línea (cliente viejo / cola
--   offline) el descuento de la venta se prorratea por line_total. Las
--   comisiones fijas no cambian. Las líneas ya guardadas no se recalculan.
--
-- [#17] p_customer_id tiene que ser del negocio (CLIENTE_NO_ENCONTRADO). La
--   rama `credito` lee al cliente FOR UPDATE y falla si no está (antes: cupo
--   null y UPDATE de cero filas, fiado sin deuda).

create or replace function public.create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_items jsonb,
  p_staff_id uuid default null::uuid,
  p_transfer_method text default null::text,
  p_card_method text default null::text,
  p_payments jsonb default null::jsonb,
  p_client_sale_id uuid default null::uuid,
  p_expected_workspace_id uuid default null::uuid,
  p_expected_membership_id uuid default null::uuid,
  p_expected_shift_id uuid default null::uuid,
  p_manual_discount numeric default 0,
  p_amount_tendered numeric default null::numeric
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
  declare
    v_auth        uuid := (select auth.uid());
    v_uid         uuid := public.get_effective_user_id();
    v_membership_id uuid := public.get_active_membership_id();
    v_member_kind text;
    v_is_worker   boolean := false;
    v_shift_id    uuid;
    v_sale_id     uuid;
    v_gross       numeric(12,2) := 0;
    v_discount    numeric(12,2) := coalesce(p_discount_amount, 0);
    v_neto        numeric(12,2);
    v_tax_rate    numeric(5,4);
    v_include_tax boolean := true;
    v_allow_over  boolean := true;
    v_tax_exempt  boolean := false;
    v_base        numeric(12,2);
    v_tax_amount  numeric(12,2);
    v_total       numeric(12,2);
    v_stored_rate numeric(5,4);
    v_item        jsonb;
    v_product     public.products%rowtype;
    v_service     public.services%rowtype;
    v_is_service  boolean;
    v_qty         numeric(12,3);
    v_item_staff_id uuid;
    v_kind        text;
    v_unit_price  numeric(12,2);
    v_custom_price numeric(12,2);
    v_open_price  boolean;
    v_units       integer;
    v_stock_delta numeric(12,3);
    v_line_total  numeric(12,2);
    v_commission  numeric(12,2);
    v_effective_payment text;
    v_effective_transfer text;
    v_effective_card text;
    v_split        jsonb;
    v_split_sum    numeric(12,2) := 0;
    v_credit_limit numeric(12,2);
    v_current_balance numeric(12,2);
    v_manual_discount numeric(12,2) := coalesce(p_manual_discount, 0);
    v_tendered    numeric(12,2) := p_amount_tendered;
    v_line_discount numeric(12,2);
    v_line_discount_sum numeric(12,2) := 0;
    v_has_line_discounts boolean := false;
    -- [#10] líneas con comisión porcentual, para recalcular sobre el neto
    v_item_id     uuid;
    v_pct_lines   jsonb := '[]'::jsonb;
    v_pct         jsonb;
    v_net         numeric;
    -- [#4] tope de descuento
    v_must_justify boolean := false;
    v_progress    integer := 0;
    v_points      integer := 0;
    v_points_value numeric;
    v_promo_ids   uuid[];
    v_today_min   date := (now() at time zone 'Etc/GMT+12')::date;
    v_today_max   date := (now() at time zone 'Etc/GMT-14')::date;
    v_line_offer  numeric(12,2);
    v_offer_sum   numeric(12,2) := 0;
    v_max_counting_price numeric(12,2) := 0;
    v_reward      numeric(12,2) := 0;
    v_points_amount numeric(12,2) := 0;
    v_justified   numeric(12,2);
  begin
    if v_auth is null then
      raise exception 'No autenticado';
    end if;
    if v_uid is null or v_membership_id is null then
      raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
    end if;
    if p_expected_workspace_id is null
      or p_expected_membership_id is null
    then
      raise exception 'CONTEXTO_DE_TRABAJO_REQUERIDO' using errcode = '42501';
    end if;
    if p_expected_workspace_id is distinct from v_uid then
      raise exception 'CONTEXTO_DE_TRABAJO_CAMBIO' using errcode = '42501';
    end if;
    if p_expected_membership_id is distinct from v_membership_id then
      raise exception 'CONTEXTO_DE_TRABAJO_CAMBIO' using errcode = '42501';
    end if;

    select m.member_kind into v_member_kind
    from public.workspace_memberships m
    where m.id = v_membership_id
      and m.workspace_id = v_uid
      and m.auth_user_id = v_auth
      and m.status = 'active';
    if not found then
      raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
    end if;
    v_is_worker := v_member_kind = 'member' and not public.is_tenant_owner();
    if not public.worker_can('pos') then
      raise exception 'SIN_PERMISO' using errcode = '42501';
    end if;
    if p_items is null or jsonb_array_length(p_items) = 0 then
      raise exception 'La venta no tiene productos';
    end if;

    -- Idempotencia. Va ANTES de toda validacion a proposito: el reintento de
    -- una venta que ya quedo registrada no puede fallar por tope de plan, por
    -- stock ni por cupo de credito. Ya paso; solo hay que devolver su id.
    if p_client_sale_id is not null then
      select s.id into v_sale_id
      from public.sales s
      where s.user_id = v_uid and s.client_sale_id = p_client_sale_id;
      if found then
        return v_sale_id;
      end if;
      v_sale_id := null;
    end if;

    -- Descuento manual: la parte de p_discount_amount que puso el cajero a
    -- mano (DiscountModal). Lo demás —ofertas, premio de cortes, puntos— es
    -- automático; para quien no tiene `pos_discount` el servidor lo acota más
    -- abajo (DESCUENTO_NO_JUSTIFICADO).
    if v_manual_discount < 0 or v_manual_discount > greatest(v_discount, 0) then
      raise exception 'DESCUENTO_MANUAL_INVALIDO: el descuento manual ($%) no puede superar el descuento total ($%)',
        v_manual_discount, v_discount;
    end if;
    v_must_justify := v_is_worker and not public.worker_can('pos_discount');
    if v_manual_discount > 0 and v_must_justify then
      raise exception 'SIN_PERMISO_DESCUENTO' using errcode = '42501';
    end if;
    if v_tendered is not null and v_tendered < 0 then
      raise exception 'MONTO_RECIBIDO_INVALIDO: el efectivo recibido no puede ser negativo';
    end if;

    -- Tope de ventas del plan. Se evalua antes de tocar nada.
    perform public.assert_monthly_sales_limit(v_uid, 0);

    if p_payments is not null and jsonb_array_length(p_payments) > 0 then
      for v_split in select * from jsonb_array_elements(p_payments)
      loop
        if (v_split->>'amount')::numeric <= 0 then
          raise exception 'Cada split debe tener un monto mayor a cero';
        end if;
        if v_split->>'payment_method' is null then
          raise exception 'Cada split debe tener un método de pago';
        end if;
      end loop;
    end if;

    if p_payments is not null and jsonb_array_length(p_payments) > 0 then
      v_effective_payment := 'split';
      v_effective_transfer := null;
      v_effective_card := null;
    else
      v_effective_payment := coalesce(p_payment_method, 'efectivo');
      if v_effective_payment = 'transferencia' then
        v_effective_transfer := p_transfer_method;
        v_effective_card := null;
      elsif v_effective_payment = 'tarjeta' then
        v_effective_transfer := null;
        v_effective_card := p_card_method;
      else
        v_effective_transfer := null;
        v_effective_card := null;
      end if;
    end if;

    -- Resolve the open shift inside the selected membership only. The
    -- expected context freezes offline sales against workspace switches.
    if v_effective_payment != 'credito' or p_expected_shift_id is not null then
      select shift_row.id into v_shift_id
      from public.shifts shift_row
      where shift_row.user_id = v_uid
        and shift_row.membership_id = v_membership_id
        and shift_row.worker_id = v_auth
        and shift_row.status = 'open';
    end if;

    if p_expected_shift_id is distinct from v_shift_id then
      raise exception 'CONTEXTO_DE_TRABAJO_CAMBIO' using errcode = '42501';
    end if;

    if v_is_worker
      and coalesce((select cfg.require_active_shift from public.settings cfg where cfg.user_id = v_uid), false)
      and v_effective_payment != 'credito' and v_shift_id is null then
      raise exception 'Debes abrir turno antes de cobrar';
    end if;

    if p_staff_id is not null then
      perform 1 from public.staff where id = p_staff_id and user_id = v_uid;
      if not found then p_staff_id := null; end if;
    end if;

    -- Fiar requiere cliente
    if v_effective_payment = 'credito' and p_customer_id is null then
      raise exception 'El fiado requiere un cliente asignado';
    end if;

    select coalesce(s.tax_rate, 0.19),
           coalesce(s.include_tax, true),
           coalesce(s.allow_oversell, true),
           s.promo_service_ids,
           s.points_value
      into v_tax_rate, v_include_tax, v_allow_over, v_promo_ids, v_points_value
    from public.settings s where s.user_id = v_uid;
    v_tax_rate := coalesce(v_tax_rate, 0.19);

    -- [#17] El cliente tiene que ser de ESTE negocio. Se lee ANTES de insertar
    -- las líneas: el trigger sale_items_bump_haircut sube el progreso de cortes
    -- con cada línea, y el premio se justifica con el progreso PREVIO.
    if p_customer_id is not null then
      select coalesce(c.tax_exempt, false),
             coalesce(c.haircuts_since_reward, 0),
             coalesce(c.loyalty_points, 0)
        into v_tax_exempt, v_progress, v_points
      from public.customers c where c.id = p_customer_id and c.user_id = v_uid;
      if not found then
        raise exception 'CLIENTE_NO_ENCONTRADO: el cliente de la venta no existe en este negocio';
      end if;
    end if;

    if not v_include_tax or v_tax_exempt then
      v_stored_rate := 0;
    else
      v_stored_rate := v_tax_rate;
    end if;

    insert into public.sales (user_id, customer_id, staff_id, payment_method, transfer_method, card_method, discount_amount, tax_rate, shift_id, client_sale_id, membership_id, amount_tendered)
    values (v_uid, p_customer_id, p_staff_id, v_effective_payment, v_effective_transfer, v_effective_card, v_discount, v_stored_rate, v_shift_id, p_client_sale_id, v_membership_id, v_tendered)
    returning id into v_sale_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_qty := round((v_item->>'quantity')::numeric, 3);
      if v_qty is null or v_qty <= 0 then
        raise exception 'Cantidad inválida en la venta';
      end if;

      -- Descuento de la línea. Ausente = 0 (cliente viejo / cola offline).
      if v_item ? 'discount_amount' then
        v_has_line_discounts := true;
      end if;
      v_line_discount := round(coalesce(nullif(v_item->>'discount_amount', '')::numeric, 0), 2);
      if v_line_discount < 0 then
        raise exception 'DESCUENTO_INVALIDO: el descuento no puede ser negativo';
      end if;

      -- El vendedor de la línea cae por defecto al "Atendido por" de la venta.
      v_item_staff_id := coalesce((v_item->>'staff_id')::uuid, p_staff_id);
      if v_item_staff_id is not null then
        perform 1 from public.staff where id = v_item_staff_id and user_id = v_uid;
        if not found then v_item_staff_id := null; end if;
      end if;

      v_is_service := (v_item ? 'service_id') and (v_item->>'service_id') is not null;

      if v_is_service then
        select * into v_service from public.services
        where id = (v_item->>'service_id')::uuid and user_id = v_uid;
        if not found then
          raise exception 'Servicio no encontrado: %', v_item->>'service_id';
        end if;

        if v_qty <> trunc(v_qty) then
          raise exception 'CANTIDAD_ENTERA: % se cobra por unidad entera', v_service.name;
        end if;

        v_line_total := v_service.price * v_qty;

        if v_line_discount > v_line_total then
          raise exception 'DESCUENTO_EXCEDE_TOTAL: el descuento de % ($%) supera el valor de la línea ($%)',
            v_service.name, v_line_discount, v_line_total;
        end if;

        -- [#4] El premio de cortes se topa en el servicio que cuenta más caro.
        if v_must_justify and v_service.id = any(coalesce(v_promo_ids, '{}'::uuid[])) then
          v_max_counting_price := greatest(v_max_counting_price, coalesce(v_service.price, 0));
        end if;

        -- Sin persona atribuida no hay a quién comisionar. La porcentual se
        -- recalcula sobre el neto después del loop ([#10]).
        if v_item_staff_id is not null and coalesce(v_service.has_commission, false) then
          if v_service.commission_type = 'fixed' then
            v_commission := round(coalesce(v_service.commission_value, 0) * v_qty, 2);
          else
            v_commission := round(v_line_total * coalesce(v_service.commission_value, 0) / 100, 2);
          end if;
        else
          v_commission := 0;
        end if;

        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount, discount_amount)
        values
          (v_uid, v_sale_id, null, v_service.id, v_service.name, null,
           v_service.price, v_qty, v_line_total, v_item_staff_id, 'unit', 1, v_commission, v_line_discount)
        returning id into v_item_id;

        if v_item_staff_id is not null and coalesce(v_service.has_commission, false)
          and v_service.commission_type is distinct from 'fixed' then
          v_pct_lines := v_pct_lines || jsonb_build_object(
            'id', v_item_id, 'rate', coalesce(v_service.commission_value, 0),
            'line_total', v_line_total, 'line_discount', v_line_discount);
        end if;

        v_gross := v_gross + v_line_total;
        v_line_discount_sum := v_line_discount_sum + v_line_discount;
      else
        select * into v_product from public.products
        where id = (v_item->>'product_id')::uuid and user_id = v_uid
        for update;
        if not found then
          raise exception 'Producto no encontrado';
        end if;

        if v_qty <> trunc(v_qty) and not coalesce(v_product.allows_fractions, false) then
          raise exception 'CANTIDAD_ENTERA: % se vende por % entera(s)', v_product.name, v_product.unit;
        end if;

        v_kind := coalesce(v_item->>'kind', 'unit');
        v_open_price   := coalesce(v_product.open_price, false);
        v_custom_price := nullif(v_item->>'unit_price', '')::numeric;

        -- El precio lo sigue decidiendo el servidor. La única puerta es
        -- esta bandera, y está cerrada por defecto.
        if v_custom_price is not null and not v_open_price then
          raise exception 'PRECIO_NO_EDITABLE: % se cobra al precio del catálogo', v_product.name;
        end if;
        if v_open_price and v_custom_price is null then
          raise exception 'PRECIO_REQUERIDO: hay que asignarle precio a % al vender', v_product.name;
        end if;
        if v_custom_price is not null and v_custom_price < 0 then
          raise exception 'PRECIO_INVALIDO: el precio de % no puede ser negativo', v_product.name;
        end if;
        v_custom_price := round(v_custom_price, 2);

        if v_kind = 'package' then
          if v_custom_price is null and v_product.package_price is null then
            raise exception 'SIN_PRECIO_CAJA: % no tiene precio por caja', v_product.name;
          end if;
          v_unit_price := coalesce(v_custom_price, v_product.package_price);
          v_units      := greatest(coalesce(v_product.units_per_package, 1), 1);
        else
          v_kind       := 'unit';
          v_unit_price := coalesce(v_custom_price, v_product.price);
          v_units      := 1;
        end if;

        -- Un servicio del catálogo de productos (unit = 'Servicio') se cobra
        -- pero no se inventaría.
        if v_product.unit = 'Servicio'
           or not coalesce(v_product.tracks_stock, true) then
          v_stock_delta := 0;
        else
          v_stock_delta := v_qty * v_units;
        end if;

        if v_stock_delta > 0
           and not v_allow_over
           and (v_product.stock_level - v_stock_delta) < 0 then
          raise exception 'STOCK_INSUFICIENTE: % — hay % unidades y se intentan vender %',
            v_product.name, v_product.stock_level, v_stock_delta;
        end if;

        v_line_total := v_unit_price * v_qty;

        if v_line_discount > v_line_total then
          raise exception 'DESCUENTO_EXCEDE_TOTAL: el descuento de % ($%) supera el valor de la línea ($%)',
            v_product.name, v_line_discount, v_line_total;
        end if;

        -- [#4] Mejor oferta vigente para la línea (espejo de offerDiscountsFor).
        if v_must_justify and v_line_total > 0 then
          select coalesce(max(
            case o.kind
              when 'percent' then
                case when o.value > 0 then round(v_line_total * o.value / 100, 2) else 0 end
              when 'amount' then
                case when o.value > 0 then round(least(o.value * v_qty, v_line_total), 2) else 0 end
              when 'buy_n_pay_m' then
                case when v_qty = trunc(v_qty)
                       and coalesce(o.buy_qty, 0) > 0
                       and coalesce(o.pay_qty, 0) >= 1
                       and o.pay_qty < o.buy_qty
                  then round(least(floor(v_qty / o.buy_qty) * (o.buy_qty - o.pay_qty) * v_unit_price, v_line_total), 2)
                  else 0 end
              else 0
            end), 0)
            into v_line_offer
          from public.product_offers o
          where o.user_id = v_uid
            and o.active
            and (
              (o.product_id is not null and o.product_id = v_product.id)
              or (o.product_id is null and o.category_id is not null and o.category_id = v_product.category_id)
            )
            and (o.starts_on is null or o.starts_on <= v_today_max)
            and (o.ends_on is null or o.ends_on >= v_today_min);
          v_offer_sum := v_offer_sum + least(greatest(v_line_offer, 0), v_line_total);
        end if;

        if v_item_staff_id is not null and coalesce(v_product.has_commission, false) then
          if v_product.commission_type = 'fixed' then
            v_commission := round(coalesce(v_product.commission_value, 0) * v_qty, 2);
          else
            v_commission := round(v_line_total * coalesce(v_product.commission_value, 0) / 100, 2);
          end if;
        else
          v_commission := 0;
        end if;

        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount, discount_amount)
        values
          (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
           v_unit_price, v_qty, v_line_total, v_item_staff_id, v_kind, v_units, v_commission, v_line_discount)
        returning id into v_item_id;

        if v_item_staff_id is not null and coalesce(v_product.has_commission, false)
          and v_product.commission_type is distinct from 'fixed' then
          v_pct_lines := v_pct_lines || jsonb_build_object(
            'id', v_item_id, 'rate', coalesce(v_product.commission_value, 0),
            'line_total', v_line_total, 'line_discount', v_line_discount);
        end if;

        v_gross := v_gross + v_line_total;
        v_line_discount_sum := v_line_discount_sum + v_line_discount;

        if v_stock_delta > 0 then
          update public.products
            set stock_level = stock_level - v_stock_delta, updated_at = now()
          where id = v_product.id and user_id = v_uid;
        end if;
      end if;
    end loop;

    -- El descuento no puede superar lo que se está vendiendo: clampear a
    -- cero regalaba el producto en silencio.
    if v_discount < 0 then
      raise exception 'DESCUENTO_INVALIDO: el descuento no puede ser negativo';
    end if;
    if v_discount > v_gross then
      raise exception 'DESCUENTO_EXCEDE_TOTAL: el descuento ($%) supera el valor de la venta ($%)',
        v_discount, v_gross;
    end if;

    -- Si el cliente mandó el desglose por línea, tiene que ser el MISMO
    -- descuento que el total. La tolerancia es el centavo del redondeo.
    if v_has_line_discounts and abs(v_line_discount_sum - v_discount) > 0.01 then
      raise exception 'DESCUENTO_LINEAS_NO_CUADRA: los descuentos por línea ($%) no suman el descuento de la venta ($%)',
        v_line_discount_sum, v_discount;
    end if;

    -- [#4] Trabajador sin `pos_discount`: todo el descuento tiene que salir de
    -- ofertas + premio de cortes + puntos del cliente.
    if v_must_justify and v_discount > 0 then
      if p_customer_id is not null then
        if v_max_counting_price > 0 then
          select coalesce(max(round(least(
              case m.reward_kind
                when 'gratis' then v_max_counting_price
                when 'porcentaje' then v_max_counting_price * coalesce(m.reward_value, 0) / 100
                when 'monto' then coalesce(m.reward_value, 0)
                else 0
              end, v_max_counting_price), 2)), 0)
            into v_reward
          from public.promo_milestones m
          where m.user_id = v_uid
            and m.is_active
            and m.threshold > 0
            and m.threshold <= v_progress
            and m.reward_kind is distinct from 'texto';
        end if;
        v_points_amount := round(greatest(v_points, 0) * greatest(coalesce(v_points_value, 0), 0), 2);
      end if;
      v_justified := v_offer_sum + greatest(v_reward, 0) + v_points_amount;
      if v_discount > v_justified + 0.01 then
        raise exception 'DESCUENTO_NO_JUSTIFICADO: el descuento ($%) supera lo que justifican las ofertas, el premio y los puntos del cliente ($%)',
          v_discount, v_justified
          using errcode = '42501';
      end if;
    end if;

    -- [#10] Comisión porcentual sobre el NETO de la línea. Con desglose, el
    -- descuento propio de cada línea; sin él, el de la venta prorrateado por
    -- line_total.
    if v_discount > 0 and jsonb_array_length(v_pct_lines) > 0 then
      for v_pct in select * from jsonb_array_elements(v_pct_lines)
      loop
        v_net := (v_pct->>'line_total')::numeric - case
          when v_has_line_discounts then (v_pct->>'line_discount')::numeric
          when v_gross > 0 then v_discount * (v_pct->>'line_total')::numeric / v_gross
          else 0
        end;
        update public.sale_items
          set commission_amount = round(greatest(v_net, 0) * (v_pct->>'rate')::numeric / 100, 2)
        where id = (v_pct->>'id')::uuid and user_id = v_uid;
      end loop;
    end if;

    v_neto := v_gross - v_discount;

    if not v_include_tax then
      v_base := v_neto;
      v_tax_amount := 0;
      v_total := v_neto;
    elsif v_tax_exempt then
      v_base := round(v_neto / (1 + v_tax_rate), 2);
      v_tax_amount := 0;
      v_total := v_base;
    else
      v_base := round(v_neto / (1 + v_tax_rate), 2);
      v_tax_amount := round(v_neto - v_base, 2);
      v_total := v_neto;
    end if;

    update public.sales
      set subtotal = v_base, tax_amount = v_tax_amount, total = v_total
    where id = v_sale_id and user_id = v_uid;

    -- Aumentar balance de crédito si es fiado. [#17] Con el cliente bloqueado
    -- y sin tolerar que no exista.
    if v_effective_payment = 'credito' then
      select c.credit_limit, coalesce(c.credit_balance, 0)
      into v_credit_limit, v_current_balance
      from public.customers c
      where c.id = p_customer_id and c.user_id = v_uid
      for update;
      if not found then
        raise exception 'CLIENTE_NO_ENCONTRADO: el cliente de la venta no existe en este negocio';
      end if;

      if v_credit_limit is not null and (v_current_balance + v_total) > v_credit_limit then
        raise exception 'El cliente excede su cupo de crédito ($%)', v_credit_limit;
      end if;

      update public.customers
      set credit_balance = coalesce(credit_balance, 0) + v_total
      where id = p_customer_id and user_id = v_uid;
    end if;

    if p_payments is not null and jsonb_array_length(p_payments) > 0 then
      v_split_sum := 0;
      for v_split in select * from jsonb_array_elements(p_payments)
      loop
        v_split_sum := v_split_sum + (v_split->>'amount')::numeric;

        insert into public.sale_payments (sale_id, payment_method, amount, transfer_method, card_method, user_id)
        values (
          v_sale_id,
          v_split->>'payment_method',
          (v_split->>'amount')::numeric,
          case when v_split->>'payment_method' = 'transferencia' then v_split->>'transfer_method' else null end,
          case when v_split->>'payment_method' = 'tarjeta' then v_split->>'card_method' else null end,
          v_uid
        );
      end loop;

      if abs(v_split_sum - v_total) > 0.01 then
        raise exception 'La suma de los pagos (%) no coincide con el total (%)', v_split_sum, v_total;
      end if;
    elsif v_total > 0 then
      insert into public.sale_payments (sale_id, payment_method, amount, transfer_method, card_method, user_id)
      values (
        v_sale_id,
        v_effective_payment,
        v_total,
        v_effective_transfer,
        v_effective_card,
        v_uid
      );
    end if;

    return v_sale_id;

  exception
    when unique_violation then
      if p_client_sale_id is not null then
        select s.id into v_sale_id
        from public.sales s
        where s.user_id = v_uid and s.client_sale_id = p_client_sale_id;
        if found then
          return v_sale_id;
        end if;
      end if;
      raise;
  end;
$function$;

revoke all on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid, numeric, numeric) to authenticated, service_role;
$mig1$;
  execute $mig2$
-- void_sale: a qué caja va la devolución en efectivo, kind 'devolucion', y
-- no anular un fiado que el cliente ya pagó.
--
-- Construida sobre la definición VIVA de void_sale (pg_get_functiondef al
-- 2026-10-07). [#19] El .sql del repo (20261006221012_sales_void_reason.sql)
-- NO reproducía la viva (membership_id ambiguo y sin la excepción del dueño):
-- esta migración trae la función COMPLETA, así que reconstruir desde
-- supabase/migrations da la misma void_sale que producción.
--
-- [#7] Antes: la devolución salía SIEMPRE del turno abierto de quien anula, y
-- el dueño —que en la UI no abre turno— no podía anular una venta en efectivo
-- hecha en el turno de un trabajador. Ahora el efectivo vuelve:
--   1. al turno de la PROPIA venta, si sigue abierto (es el cajón donde entró);
--   2. si no, al turno abierto de quien anula;
--   3. si no hay ninguno y quien anula es dueño/administrador
--      (is_tenant_owner), se anula SIN movimiento de caja y se avisa con
--      `cash_refund_unrecorded = true`.
-- Un trabajador sigue necesitando SU turno abierto para devolver efectivo.
--
-- La función pasa de `returns void` a `returns jsonb`
--   {cash_refund, cash_refund_shift_id, cash_refund_unrecorded}.
-- Los argumentos no cambian, así que PostgREST la sigue encontrando con la
-- misma llamada (sin PGRST202); un cliente viejo simplemente ignora el cuerpo.
-- Cambiar el tipo de retorno exige DROP + CREATE (y volver a dar los grants).
--
-- [6] El movimiento de devolución se inserta con kind = 'devolucion' (antes
-- caía al default 'traslado'). close_shift/current_shift restan todos los
-- movimientos del turno sin mirar el kind: el arqueo no cambia.
--
-- [#15] credit_release_voided_sale hacía greatest(saldo − fiado, 0): anular un
-- fiado ya abonado se tragaba la plata del cliente. Ahora, si lo fiado supera
-- el saldo actual, la anulación se BLOQUEA (CREDITO_YA_ABONADO) para que la
-- devolución se resuelva primero. Nada de saldos negativos.

-- ---------------------------------------------------------------- kind
alter table public.cash_movements drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements add constraint cash_movements_kind_check
  check (kind = any (array['gasto'::text, 'traslado'::text, 'comision'::text, 'devolucion'::text]));

-- Devoluciones anteriores, que quedaron como 'traslado' por el default.
update public.cash_movements
set kind = 'devolucion'
where kind = 'traslado'
  and reason like 'Devolución - Venta #% anulada';

-- ------------------------------------------------------- crédito al anular
create or replace function public.credit_release_voided_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  credit_amount numeric := 0;
  v_balance numeric;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.payment_method = 'credito' then
    credit_amount := coalesce(new.total, 0);
  elsif new.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into credit_amount
    from public.sale_payments payment
    where payment.sale_id = new.id
      and payment.user_id = new.user_id
      and payment.payment_method = 'credito';
  end if;

  if credit_amount <= 0 then
    return new;
  end if;

  select coalesce(customer.credit_balance, 0)
  into v_balance
  from public.customers customer
  where customer.id = new.customer_id
    and customer.user_id = new.user_id
  for update;

  if not found then
    -- Sin cliente no hay deuda que liberar (no debería pasar: customer_id es FK).
    return new;
  end if;

  -- El cliente ya abonó parte o todo lo fiado: bajar el saldo a cero se
  -- tragaba esos abonos. Primero hay que resolver la devolución.
  if credit_amount > v_balance + 0.005 then
    raise exception 'CREDITO_YA_ABONADO: la venta fió $% pero el cliente solo debe $%', credit_amount, v_balance;
  end if;

  update public.customers customer
  set credit_balance = coalesce(customer.credit_balance, 0) - credit_amount
  where customer.id = new.customer_id
    and customer.user_id = new.user_id;

  return new;
end;
$function$;

-- ----------------------------------------------------------- void_sale
drop function if exists public.void_sale(uuid, text);

create function public.void_sale(p_sale_id uuid, p_reason text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  v_member_kind text;
  v_is_owner boolean := false;
  v_active_shift_id uuid;
  v_target_shift_id uuid;
  v_target_membership_id uuid;
  v_unrecorded boolean := false;
  v_cash_refund numeric := 0;
  v_sale_row record;
  v_item_row record;
  v_return_units numeric(12,3);
begin
  if v_caller is null or v_workspace is null or v_membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  select m.member_kind into v_member_kind
  from public.workspace_memberships m
  where m.id = v_membership_id
    and m.workspace_id = v_workspace
    and m.auth_user_id = v_caller
    and m.status = 'active';

  if not found or (
    v_member_kind = 'member'
    and not public.worker_can('sales')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  v_is_owner := public.is_tenant_owner();

  select
    sale.id,
    sale.status,
    sale.total,
    sale.payment_method,
    sale.shift_id,
    sale.sale_number
  into v_sale_row
  from public.sales sale
  where sale.id = p_sale_id
    and sale.user_id = v_workspace
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_sale_row.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas';
  end if;

  if v_sale_row.payment_method = 'efectivo' then
    v_cash_refund := coalesce(v_sale_row.total, 0);
  elsif v_sale_row.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into v_cash_refund
    from public.sale_payments payment
    where payment.sale_id = v_sale_row.id
      and payment.user_id = v_workspace
      and payment.payment_method = 'efectivo';
  end if;

  if v_cash_refund > 0 then
    -- Turno abierto de quien anula.
    select shift_row.id into v_active_shift_id
    from public.shifts shift_row
    where shift_row.user_id = v_workspace
      and shift_row.membership_id = v_membership_id
      and shift_row.worker_id = v_caller
      and shift_row.status = 'open';

    if v_active_shift_id is null and not v_is_owner then
      raise exception 'Debes abrir turno antes de devolver efectivo';
    end if;

    -- 1. El turno de la propia venta, si sigue abierto.
    if v_sale_row.shift_id is not null then
      select shift_row.id, shift_row.membership_id
      into v_target_shift_id, v_target_membership_id
      from public.shifts shift_row
      where shift_row.id = v_sale_row.shift_id
        and shift_row.user_id = v_workspace
        and shift_row.status = 'open'
      for update;
    end if;

    -- 2. Si no, el de quien anula.
    if v_target_shift_id is null and v_active_shift_id is not null then
      select shift_row.id, shift_row.membership_id
      into v_target_shift_id, v_target_membership_id
      from public.shifts shift_row
      where shift_row.id = v_active_shift_id
        and shift_row.user_id = v_workspace
        and shift_row.status = 'open'
      for update;
    end if;

    -- 3. Ninguno: solo llega acá el dueño/administrador (el trabajador sin
    --    turno ya fue rechazado arriba). Se anula y se avisa.
    if v_target_shift_id is null then
      if not v_is_owner then
        raise exception 'Debes abrir turno antes de devolver efectivo';
      end if;
      v_unrecorded := true;
    end if;
  end if;

  -- El motivo es opcional en la base (la pantalla lo exige): así un llamador
  -- viejo con solo p_sale_id sigue funcionando.
  update public.sales sale
  set status = 'void',
      void_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
      voided_at = now(),
      voided_by = v_caller
  where sale.id = p_sale_id
    and sale.user_id = v_workspace;

  for v_item_row in
    select
      item.product_id,
      item.quantity,
      item.unit_kind,
      item.units_per_item
    from public.sale_items item
    join public.products prod
      on prod.id = item.product_id
     and prod.user_id = v_workspace
    where item.sale_id = p_sale_id
      and item.user_id = v_workspace
      and item.product_id is not null
      -- Un servicio nunca descontó stock: no hay nada que devolverle.
      and prod.unit <> 'Servicio'
      and coalesce(prod.tracks_stock, true)
  loop
    v_return_units := case
      when v_item_row.unit_kind = 'package'
        then v_item_row.quantity * v_item_row.units_per_item
      else v_item_row.quantity
    end;

    update public.products prod
    set stock_level = prod.stock_level + v_return_units
    where prod.id = v_item_row.product_id
      and prod.user_id = v_workspace;

    insert into public.inventory_movements (
      product_id, quantity, type, reference_type, reference_id, created_by, user_id, notes
    )
    values (
      v_item_row.product_id, v_return_units, 'in', 'sale_void', p_sale_id, v_caller, v_workspace,
      'Anulación de venta #' || v_sale_row.sale_number::text
    );
  end loop;

  if v_cash_refund > 0 and v_target_shift_id is not null then
    insert into public.cash_movements (
      amount, reason, kind, shift_id, user_id, worker_id, membership_id
    )
    values (
      v_cash_refund,
      'Devolución - Venta #' || v_sale_row.sale_number::text || ' anulada',
      'devolucion',
      v_target_shift_id, v_workspace, v_caller, v_target_membership_id
    );
  end if;

  return jsonb_build_object(
    'cash_refund', v_cash_refund,
    'cash_refund_shift_id', v_target_shift_id,
    'cash_refund_unrecorded', v_unrecorded
  );
end;
$function$;

revoke all on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated, service_role;
$mig2$;

  -- ------------------------------------- [#4] trabajador sin pos_discount
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', 'rb-worker')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 5000,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A1_zero_sale_blocked', v_err);

  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 4500,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A2_expired_offer_not_counted', v_err);

  begin
    v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 10000,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 3, 'discount_amount', 10000)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'OK total=' || (select total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A3_best_offer_3x2_ok', v_err);

  begin
    v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 10000.01,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 3)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'OK total=' || (select total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A4_tolerance_cent_legacy_payload_ok', v_err);

  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 10500,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 3)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A5_over_offer_blocked', v_err);

  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 4000,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 2.5)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A6_fractional_qty_rejected_or_capped', v_err);

  -- premio (20.000) + puntos (50 × 100 = 5.000) + 3x2 (10.000) = 35.000
  begin
    v_sale := public.create_sale(p_customer_id => v_cust, p_payment_method => 'efectivo', p_discount_amount => 35000,
      p_items => jsonb_build_array(
        jsonb_build_object('service_id', v_s1, 'quantity', 1),
        jsonb_build_object('product_id', v_p1, 'quantity', 3),
        jsonb_build_object('product_id', v_p2, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'OK total=' || (select total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A7_reward_points_offer_ok', v_err);

  begin
    perform public.create_sale(p_customer_id => v_cust, p_payment_method => 'efectivo', p_discount_amount => 35100,
      p_items => jsonb_build_array(
        jsonb_build_object('service_id', v_s1, 'quantity', 1),
        jsonb_build_object('product_id', v_p1, 'quantity', 3),
        jsonb_build_object('product_id', v_p2, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A8_over_reward_points_offer_blocked', v_err);

  begin
    perform public.create_sale(p_customer_id => gen_random_uuid(), p_payment_method => 'efectivo', p_discount_amount => 0,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('B1_foreign_customer_blocked', v_err);
  perform set_config('role', 'postgres', true);

  -- ------------------------------------------------------------ dueño
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 5000,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
    v_err := 'OK total=' || (select total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('A9_owner_unchanged', v_err);

  -- [#10] comisión sobre el neto. Sin desglose: 3.000 prorrateado sobre
  -- 10.000 + 5.000 + 10.000 → 1.200 a P3 → neto 8.800 → 880. P4 (fija) sigue en 500.
  -- Resultado esperado (dry-run 2026-10-07): ver el bloque final de este archivo.
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 3000,
    p_items => jsonb_build_array(
      jsonb_build_object('product_id', v_p3, 'quantity', 1, 'staff_id', c_seller),
      jsonb_build_object('product_id', v_p2, 'quantity', 1),
      jsonb_build_object('product_id', v_p4, 'quantity', 1, 'staff_id', c_seller)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  r := r || jsonb_build_object('C1_prorated', (select jsonb_object_agg(i.product_name, i.commission_amount)
    from public.sale_items i where i.sale_id = v_sale));
  -- Con desglose: la línea con comisión trae 1.000 → neto 9.000 → 900.
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 3000,
    p_items => jsonb_build_array(
      jsonb_build_object('product_id', v_p3, 'quantity', 1, 'staff_id', c_seller, 'discount_amount', 1000),
      jsonb_build_object('product_id', v_p2, 'quantity', 1, 'discount_amount', 2000),
      jsonb_build_object('product_id', v_p4, 'quantity', 1, 'staff_id', c_seller, 'discount_amount', 0)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  r := r || jsonb_build_object('C2_per_line', (select jsonb_object_agg(i.product_name, i.commission_amount)
    from public.sale_items i where i.sale_id = v_sale));
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_p3, 'quantity', 1, 'staff_id', c_seller)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  r := r || jsonb_build_object('C3_no_discount', (select jsonb_object_agg(i.product_name, i.commission_amount)
    from public.sale_items i where i.sale_id = v_sale));

  -- [#17] + [#15] fiado
  v_sale := public.create_sale(p_customer_id => v_cust2, p_payment_method => 'credito', p_discount_amount => 0,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('D1_balance_after_credit', (select credit_balance from public.customers where id = v_cust2));
  update public.customers set credit_balance = 2000 where id = v_cust2; -- abonó 3.000
  perform set_config('role', 'authenticated', true);
  begin
    perform public.void_sale(v_sale, 'prueba');
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('D2_void_paid_credit_blocked', v_err);
  perform set_config('role', 'postgres', true);
  update public.customers set credit_balance = 7000 where id = v_cust2; -- debe esta y otra
  perform set_config('role', 'authenticated', true);
  v_res := public.void_sale(v_sale, 'prueba');
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('D3_void_unpaid_credit', jsonb_build_object('res', v_res,
    'balance', (select credit_balance from public.customers where id = v_cust2)));
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_sale(p_customer_id => gen_random_uuid(), p_payment_method => 'credito', p_discount_amount => 0,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('D4_credit_foreign_customer_blocked', v_err);
  perform set_config('role', 'postgres', true);

  -- ---------------------------------------------- [#7] devolución en efectivo
  -- E1: venta del trabajador en su turno abierto; la anula el dueño sin turno.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', 'rb-worker')::text, true);
  perform set_config('role', 'authenticated', true);
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  v_res := public.void_sale(v_sale, 'prueba');
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('E1_owner_voids_into_sale_shift', jsonb_build_object('res', v_res,
    'into_worker_shift', (v_res->>'cash_refund_shift_id')::uuid = v_shift_w,
    'movement', (select jsonb_agg(jsonb_build_object('kind', m.kind, 'amount', m.amount, 'membership', m.membership_id = v_worker_m))
       from public.cash_movements m where m.shift_id = v_shift_w)));

  -- E2: otra venta en ese turno; el turno se cierra; el dueño anula sin caja.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', 'rb-worker')::text, true);
  perform set_config('role', 'authenticated', true);
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_expected_shift_id => v_shift_w);
  perform set_config('role', 'postgres', true);
  update public.shifts set status = 'closed', closed_at = now() where id = v_shift_w;
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.void_sale(v_sale, 'prueba');
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('E2_owner_no_shift_unrecorded', jsonb_build_object('res', v_res,
    'movements_for_sale', (select count(*) from public.cash_movements m
       where m.reason like '%#' || (select sale_number from public.sales where id = v_sale)::text || ' %'),
    'status', (select status from public.sales where id = v_sale)));

  -- E3: el trabajador sin turno no puede anular una venta en efectivo.
  perform set_config('role', 'authenticated', true);
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
    p_items => jsonb_build_array(jsonb_build_object('product_id', v_p2, 'quantity', 1)),
    p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', 'rb-worker')::text, true);
  begin
    perform public.void_sale(v_sale, 'prueba');
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('E3_worker_without_shift_blocked', v_err);
  perform set_config('role', 'postgres', true);

  -- E4: con turno propio abierto, el trabajador anula y la plata sale de SU turno
  -- (la venta del dueño no tiene turno).
  insert into public.shifts (user_id, worker_id, membership_id, status, opening_cash)
  values (c_owner, v_worker, v_worker_m, 'open', 0) returning id into v_shift_w2;
  perform set_config('role', 'authenticated', true);
  v_res := public.void_sale(v_sale, 'prueba');
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object('E4_worker_voids_into_own_shift', jsonb_build_object('res', v_res,
    'into_own', (v_res->>'cash_refund_shift_id')::uuid = v_shift_w2,
    'kinds', (select jsonb_agg(m.kind) from public.cash_movements m where m.shift_id = v_shift_w2)));

  r := r || jsonb_build_object('F_kind_check', (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'cash_movements_kind_check'));

  -- Resultado del dry-run previo a aplicar (2026-10-07):
  --   A1/A2/A5/A8 → 42501 DESCUENTO_NO_JUSTIFICADO; A3, A4 (19.999,99), A7 (20.000) OK;
  --   A6 → CANTIDAD_ENTERA; B1/D4 → CLIENTE_NO_ENCONTRADO; A9 dueño OK total 0;
  --   C1 P3=880 P4=500; C2 P3=900 P4=500; C3 P3=1000; D1 saldo 5000;
  --   D2 → CREDITO_YA_ABONADO; D3 saldo 7000→2000; E1 devolución al turno de la venta
  --   (kind devolucion); E2 cash_refund_unrecorded=true sin movimiento; E3 → Debes abrir
  --   turno; E4 devolución al turno propio del trabajador.
  -- Siempre aborta: es lo que garantiza que nada de lo anterior persista.
  raise exception 'ROLLBACK_OK %', r::text;
end
$test$;
