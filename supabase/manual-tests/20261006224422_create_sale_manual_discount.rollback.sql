-- PRUEBA SIN PERSISTIR de 20261006224422_create_sale_manual_discount_and_tendered.sql
--
-- Todo corre dentro de UN bloque DO que termina SIEMPRE en `raise exception`:
-- la excepción aborta la transacción entera (DDL de la migración, usuario y
-- membresía de prueba, ventas, stock), así que no persiste nada aunque el
-- cliente SQL esté en autocommit. El resultado viaja en el mensaje del error
-- ("ROLLBACK_OK {...json...}"). ÚNICO efecto no transaccional: cada INSERT en
-- `sales` consume un valor de la identidad global `sales_sale_number_seq`
-- (hueco en la numeración global, igual que cualquier venta rechazada).
--
-- Cuenta: la del E2E (test-md4hv70zu@srv1.mail-tester.com, dueño de un salón).
-- El trabajador se crea dentro de la transacción (auth.users +
-- workspace_memberships sobre el staff existente) y desaparece con el rollback.
--
-- Este archivo NO es una migración (vive fuera de supabase/migrations). El
-- bloque `execute $mig$ ... $mig$` contiene la migración completa, copiada tal
-- cual; si se edita la migración, regenerar este archivo.
do $test$
declare
  c_owner    uuid := 'fc9d39c5-e583-4d86-891a-7e0c1c42eaab';
  c_owner_m  uuid := '76daf1f1-4723-40f2-9acb-e488c657fa71';
  c_seller   uuid := 'dea2f6aa-7bf7-44f0-962a-399e04a1a7ff'; -- staff "Profesor Piano E2E"
  v_worker   uuid := gen_random_uuid();
  v_worker_staff uuid;
  v_worker_m uuid;
  v_prod     uuid;
  v_prod_nt  uuid;
  v_items_w  jsonb;
  v_items    jsonb;
  v_items_d  jsonb;
  v_sale     uuid;
  v_sale2    uuid;
  v_cid      uuid := gen_random_uuid();
  v_stock0   numeric;
  r          jsonb := '{}'::jsonb;
  v_err      text;
begin
  -- ---------------------------------------------------------------- setup
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner, 'role', 'authenticated', 'session_id', 'rb-owner')::text, true);

  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_worker, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'rollback-worker-' || v_worker || '@example.invalid', '{}', '{}', now(), now());
  -- El plan del E2E topa los colaboradores: se reusa el staff existente como
  -- ficha del trabajador (la membresia de prueba es la unica que lo usa).
  v_worker_staff := c_seller;
  insert into public.workspace_memberships
    (workspace_id, auth_user_id, invited_email, member_kind, status, accepted_at, activated_at, staff_id, permissions)
  values (c_owner, v_worker, 'rollback-worker-' || v_worker || '@example.invalid', 'member', 'active', now(), now(),
          v_worker_staff, '{"pos": true}'::jsonb)
  returning id into v_worker_m;
  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('rb-owner', c_owner, c_owner, c_owner_m), ('rb-worker', v_worker, c_owner, v_worker_m);
  -- Producto con stock y comisión del 10 %: lo que hay que comparar.
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, has_commission, commission_type, commission_value, unit)
  values (c_owner, 'PRODUCTO ROLLBACK', 'RB-001', 11900, 100, true, true, 'percentage', 10, 'Unidad')
  returning id into v_prod;
  -- Sin inventario: el tramo del TRABAJADOR usa este. Con uno que lleva stock,
  -- products_guard_edit rechaza la venta de un trabajador sin inventory_edit
  -- (bug PREEXISTENTE, también con la función actual: en un BEFORE trigger la
  -- columna generada allows_fractions llega NULL en NEW, así que
  -- to_jsonb(new) <> to_jsonb(old) aunque solo cambie el stock).
  insert into public.products (user_id, name, sku, price, stock_level, tracks_stock, unit)
  values (c_owner, 'PRODUCTO ROLLBACK SIN STOCK', 'RB-002', 11900, 0, false, 'Unidad')
  returning id into v_prod_nt;

  v_items_w := jsonb_build_array(jsonb_build_object('product_id', v_prod_nt, 'quantity', 2, 'kind', 'unit'));
  v_items   :=jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'staff_id', c_seller, 'kind', 'unit'));
  v_items_d := jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'staff_id', c_seller, 'kind', 'unit', 'discount_amount', 2380));

  -- ------------------------------------------- A: función ACTUAL (dueño)
  perform set_config('role', 'authenticated', true);
  select stock_level into v_stock0 from public.products where id = v_prod;
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
    p_items => v_items, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  v_sale2 := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 2380,
    p_items => v_items, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object(
    'A_old_no_discount', (select jsonb_build_object('subtotal', s.subtotal, 'tax', s.tax_amount, 'total', s.total, 'discount', s.discount_amount,
        'line_total', i.line_total, 'commission', i.commission_amount)
      from public.sales s join public.sale_items i on i.sale_id = s.id where s.id = v_sale),
    'A_old_discount_2380', (select jsonb_build_object('subtotal', s.subtotal, 'tax', s.tax_amount, 'total', s.total, 'discount', s.discount_amount,
        'line_total', i.line_total, 'commission', i.commission_amount)
      from public.sales s join public.sale_items i on i.sale_id = s.id where s.id = v_sale2),
    'A_stock_delta', v_stock0 - (select stock_level from public.products where id = v_prod));

  -- ------------------------------------------------- migración (en la tx)
  execute $mig$
-- create_sale: descuento MANUAL separado, descuento POR LÍNEA y efectivo recibido.
--
-- Por qué:
-- 1. `p_discount_amount` mezcla cuatro cosas —descuento manual (DiscountModal),
--    ofertas automáticas, premio de cortes y puntos— y la base confiaba en el
--    cliente. El permiso de trabajador `pos_discount` solo lo exigía la UI.
--    Ahora el POS declara cuánto de ese total es MANUAL (`p_manual_discount`) y
--    la función rechaza con `SIN_PERMISO_DESCUENTO` (42501) a un trabajador sin
--    `worker_can('pos_discount')`. El dueño y el administrador siempre pueden
--    (`worker_can` ya devuelve true para ellos, y `v_is_worker` es false).
--    LÍMITE CONOCIDO: la separación la declara el cliente. Quien llame al RPC a
--    mano puede mandar el descuento como "automático" (p_manual_discount = 0).
--    Cerrar eso exige recalcular ofertas/premio/puntos en el servidor; esto es
--    el primer paso (deja el dato y el gate para el POS honesto, que es el 100 %
--    del tráfico legítimo).
-- 2. La reimpresión no podía mostrar el descuento de cada línea ni lo recibido
--    en efectivo / el cambio: la base no los guardaba. Columnas nuevas:
--    `sale_items.discount_amount` y `sales.amount_tendered`.
--
-- Compatibilidad: los parámetros nuevos van AL FINAL y con default. Quien no
-- los manda —el cliente viejo y las ventas YA ENCOLADAS en la cola offline,
-- que se reenvían con el payload tal cual se armó— obtiene exactamente el
-- comportamiento anterior: manual = 0, líneas con descuento 0, recibido null.
-- El descuento por línea viaja DENTRO de cada item del JSON (`discount_amount`)
-- y solo se valida si el cliente lo manda: entonces la suma tiene que cuadrar
-- con `p_discount_amount` (±0,01) y ninguna línea puede superar su valor.
--
-- Sobrecarga: agregar parámetros con default crea una firma NUEVA. Si la vieja
-- quedara, una llamada con los 12 argumentos de siempre matchearía las dos
-- ("function is not unique" en Postgres; PGRST203 en PostgREST) y TODAS las
-- ventas fallarían. Por eso se dropea la vieja en esta misma migración. Es
-- seguro: es la única sobrecarga existente, ninguna otra función ni vista la
-- referencia (verificado con pg_depend/prosrc), y todo cliente la llama por
-- NOMBRE de parámetro vía PostgREST, que resuelve contra la nueva con los
-- defaults. La migración es una transacción: no hay instante sin función.
--
-- Todo lo demás del cuerpo es IDÉNTICO a la versión en producción al
-- 2026-10-06 (pg_get_functiondef). Cambios, marcados con [C-...]:
--   [C-1] firma: p_manual_discount, p_amount_tendered.
--   [C-2] declare: v_manual_discount, v_tendered, v_line_discount,
--         v_line_discount_sum, v_has_line_discounts.
--   [C-3] validación del manual / permiso / recibido, DESPUÉS de la
--         idempotencia (un reintento de una venta ya registrada no puede fallar
--         porque al trabajador le quitaron el permiso en el medio).
--   [C-4] insert de sales: amount_tendered.
--   [C-5] por línea: lectura/validación de discount_amount e insert.
--   [C-6] después del loop: la suma por línea cuadra con el total.

-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------
alter table public.sale_items
  add column if not exists discount_amount numeric(12,2) not null default 0;

alter table public.sale_items
  drop constraint if exists sale_items_discount_amount_check;
alter table public.sale_items
  add constraint sale_items_discount_amount_check
  check (discount_amount >= 0 and discount_amount <= line_total);

comment on column public.sale_items.discount_amount is
  'Descuento de ESTA línea (oferta, premio, puntos o manual), ya incluido en sales.discount_amount. 0 en ventas anteriores a 20261006224422: el descuento de esas ventas solo existe a nivel venta.';

alter table public.sales
  add column if not exists amount_tendered numeric(12,2);

alter table public.sales
  drop constraint if exists sales_amount_tendered_check;
alter table public.sales
  add constraint sales_amount_tendered_check
  check (amount_tendered is null or amount_tendered >= 0);

comment on column public.sales.amount_tendered is
  'Efectivo que entregó el cliente (para imprimir recibido y cambio). null = no fue en efectivo, fue pago dividido, o no se anotó.';

-- ---------------------------------------------------------------------------
-- Función
-- ---------------------------------------------------------------------------
drop function if exists public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_sale(p_customer_id uuid, p_payment_method text, p_discount_amount numeric, p_items jsonb, p_staff_id uuid DEFAULT NULL::uuid, p_transfer_method text DEFAULT NULL::text, p_card_method text DEFAULT NULL::text, p_payments jsonb DEFAULT NULL::jsonb, p_client_sale_id uuid DEFAULT NULL::uuid, p_expected_workspace_id uuid DEFAULT NULL::uuid, p_expected_membership_id uuid DEFAULT NULL::uuid, p_expected_shift_id uuid DEFAULT NULL::uuid, p_manual_discount numeric DEFAULT 0, p_amount_tendered numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- [C-2]
    v_manual_discount numeric(12,2) := coalesce(p_manual_discount, 0);
    v_tendered    numeric(12,2) := p_amount_tendered;
    v_line_discount numeric(12,2);
    v_line_discount_sum numeric(12,2) := 0;
    v_has_line_discounts boolean := false;
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

    -- [C-3] Descuento manual: la parte de p_discount_amount que puso el cajero
    -- a mano (DiscountModal). Lo demás —ofertas, premio de cortes, puntos— es
    -- automático y no pide permiso. No puede ser negativo ni más que el total
    -- (`greatest` deja que un p_discount_amount negativo siga cayendo en el
    -- DESCUENTO_INVALIDO de siempre, más abajo, y no en este error).
    if v_manual_discount < 0 or v_manual_discount > greatest(v_discount, 0) then
      raise exception 'DESCUENTO_MANUAL_INVALIDO: el descuento manual ($%) no puede superar el descuento total ($%)',
        v_manual_discount, v_discount;
    end if;
    if v_manual_discount > 0
      and v_is_worker
      and not public.worker_can('pos_discount')
    then
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
           coalesce(s.allow_oversell, true)
      into v_tax_rate, v_include_tax, v_allow_over
    from public.settings s where s.user_id = v_uid;
    v_tax_rate := coalesce(v_tax_rate, 0.19);

    if p_customer_id is not null then
      select coalesce(c.tax_exempt, false) into v_tax_exempt
      from public.customers c where c.id = p_customer_id and c.user_id = v_uid;
    end if;

    if not v_include_tax or v_tax_exempt then
      v_stored_rate := 0;
    else
      v_stored_rate := v_tax_rate;
    end if;

    -- [C-4] amount_tendered
    insert into public.sales (user_id, customer_id, staff_id, payment_method, transfer_method, card_method, discount_amount, tax_rate, shift_id, client_sale_id, membership_id, amount_tendered)
    values (v_uid, p_customer_id, p_staff_id, v_effective_payment, v_effective_transfer, v_effective_card, v_discount, v_stored_rate, v_shift_id, p_client_sale_id, v_membership_id, v_tendered)
    returning id into v_sale_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_qty := round((v_item->>'quantity')::numeric, 3);
      if v_qty is null or v_qty <= 0 then
        raise exception 'Cantidad inválida en la venta';
      end if;

      -- [C-5] Descuento de la línea. Ausente = 0 (cliente viejo / cola offline).
      if v_item ? 'discount_amount' then
        v_has_line_discounts := true;
      end if;
      v_line_discount := round(coalesce(nullif(v_item->>'discount_amount', '')::numeric, 0), 2);
      if v_line_discount < 0 then
        raise exception 'DESCUENTO_INVALIDO: el descuento no puede ser negativo';
      end if;

      -- El vendedor de la línea cae por defecto al "Atendido por" de la venta.
      -- La línea sigue pudiendo pisarlo (el carrito deja elegir vendedor ítem
      -- por ítem), pero dejar de heredarlo era lo que rompía las comisiones.
      -- `p_staff_id` ya viene validado contra `staff` unas líneas más arriba.
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

        -- [C-5]
        if v_line_discount > v_line_total then
          raise exception 'DESCUENTO_EXCEDE_TOTAL: el descuento de % ($%) supera el valor de la línea ($%)',
            v_service.name, v_line_discount, v_line_total;
        end if;

        -- Sin persona atribuida no hay a quién comisionar.
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
           v_service.price, v_qty, v_line_total, v_item_staff_id, 'unit', 1, v_commission, v_line_discount);

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

        -- [C-5]
        if v_line_discount > v_line_total then
          raise exception 'DESCUENTO_EXCEDE_TOTAL: el descuento de % ($%) supera el valor de la línea ($%)',
            v_product.name, v_line_discount, v_line_total;
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
           v_unit_price, v_qty, v_line_total, v_item_staff_id, v_kind, v_units, v_commission, v_line_discount);

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

    -- [C-6] Si el cliente mandó el desglose por línea, tiene que ser el MISMO
    -- descuento que el total: si no, el recibo reimpreso diría otra cosa que
    -- lo cobrado. La tolerancia es el centavo del redondeo por línea.
    if v_has_line_discounts and abs(v_line_discount_sum - v_discount) > 0.01 then
      raise exception 'DESCUENTO_LINEAS_NO_CUADRA: los descuentos por línea ($%) no suman el descuento de la venta ($%)',
        v_line_discount_sum, v_discount;
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

    -- Aumentar balance de crédito si es fiado
    if v_effective_payment = 'credito' then
      select credit_limit, credit_balance
      into v_credit_limit, v_current_balance
      from public.customers where id = p_customer_id and user_id = v_uid;

      if v_credit_limit is not null and (v_current_balance + v_total) > v_credit_limit then
        raise exception 'El cliente excede su cupo de crédito ($%)', v_credit_limit;
      end if;

      update public.customers
      set credit_balance = credit_balance + v_total
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

-- Mismos permisos que la versión anterior: {postgres, authenticated, service_role}.
-- Una función NUEVA nace ejecutable por PUBLIC (y Supabase le suma anon por
-- default privileges), así que hay que revocarlo explícitamente.
revoke all on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid, numeric, numeric) to authenticated, service_role;

comment on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid, numeric, numeric) is
  'Venta transaccional del POS. p_discount_amount = descuento TOTAL (manual + ofertas + premio + puntos); p_manual_discount = la parte manual, que exige worker_can(''pos_discount'') a un trabajador (SIN_PERMISO_DESCUENTO). Cada item puede traer discount_amount (se guarda en sale_items y debe sumar p_discount_amount ±0,01). p_amount_tendered = efectivo recibido (sales.amount_tendered).';

notify pgrst, 'reload schema';

  $mig$;

  r := r || jsonb_build_object(
    'signatures', (select jsonb_agg(p.oid::regprocedure::text) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale'),
    'acl', (select p.proacl::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_sale'),
    'secdef_searchpath', (select jsonb_build_array(p.prosecdef, p.proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_sale'));

  -- ------------------------------ B: función NUEVA, mismas llamadas (dueño)
  perform set_config('role', 'authenticated', true);
  select stock_level into v_stock0 from public.products where id = v_prod;
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
    p_items => v_items, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  v_sale2 := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 2380,
    p_items => v_items, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object(
    'B_new_legacy_no_discount', (select jsonb_build_object('subtotal', s.subtotal, 'tax', s.tax_amount, 'total', s.total, 'discount', s.discount_amount,
        'line_total', i.line_total, 'commission', i.commission_amount, 'line_discount', i.discount_amount, 'tendered', s.amount_tendered)
      from public.sales s join public.sale_items i on i.sale_id = s.id where s.id = v_sale),
    'B_new_legacy_discount_2380', (select jsonb_build_object('subtotal', s.subtotal, 'tax', s.tax_amount, 'total', s.total, 'discount', s.discount_amount,
        'line_total', i.line_total, 'commission', i.commission_amount, 'line_discount', i.discount_amount, 'tendered', s.amount_tendered)
      from public.sales s join public.sale_items i on i.sale_id = s.id where s.id = v_sale2),
    'B_stock_delta', v_stock0 - (select stock_level from public.products where id = v_prod));

  -- --------------- C: dueño con manual + línea + recibido (+ idempotencia)
  perform set_config('role', 'authenticated', true);
  v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 2380,
    p_items => v_items_d, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m,
    p_client_sale_id => v_cid, p_manual_discount => 2380, p_amount_tendered => 25000);
  v_sale2 := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 2380,
    p_items => v_items_d, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m,
    p_client_sale_id => v_cid, p_manual_discount => 2380, p_amount_tendered => 25000);
  perform set_config('role', 'postgres', true);
  r := r || jsonb_build_object(
    'C_owner_manual', (select jsonb_build_object('subtotal', s.subtotal, 'tax', s.tax_amount, 'total', s.total, 'discount', s.discount_amount,
        'line_total', i.line_total, 'commission', i.commission_amount, 'line_discount', i.discount_amount, 'tendered', s.amount_tendered)
      from public.sales s join public.sale_items i on i.sale_id = s.id where s.id = v_sale),
    'C_idempotent_same_id', v_sale = v_sale2);

  -- ------------------------------------------- D: validaciones (dueño)
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 1000,
      p_items => v_items, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_manual_discount => 3000);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('D1_manual_gt_total', v_err);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 1000,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'discount_amount', 500)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('D2_lines_dont_add_up', v_err);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 30000,
      p_items => jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'discount_amount', 30000)),
      p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('D3_line_discount_gt_line', v_err);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 0,
      p_items => v_items, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m, p_amount_tendered => -1);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('D4_negative_tendered', v_err);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => -5,
      p_items => v_items, p_expected_workspace_id => c_owner, p_expected_membership_id => c_owner_m);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('D5_negative_discount_same_error_as_before', v_err);
  perform set_config('role', 'postgres', true);

  -- ------------------------------------------------ E: trabajador
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated', 'session_id', 'rb-worker')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 1000,
      p_items => v_items_w, p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_manual_discount => 1000);
    v_err := 'NO FALLO';
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('E1_worker_no_perm_manual', v_err);
  begin
    v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 1000,
      p_items => v_items_w, p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_manual_discount => 0);
    v_err := 'OK total=' || (select total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('E2_worker_no_perm_automatic_discount', v_err);
  begin
    v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 1000,
      p_items => v_items_w, p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m);
    v_err := 'OK total=' || (select total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('E3_worker_legacy_call_old_queue', v_err);
  perform set_config('role', 'postgres', true);
  update public.workspace_memberships set permissions = permissions || '{"pos_discount": true}'::jsonb where id = v_worker_m;
  perform set_config('role', 'authenticated', true);
  begin
    v_sale := public.create_sale(p_customer_id => null, p_payment_method => 'efectivo', p_discount_amount => 1000,
      p_items => v_items_w, p_expected_workspace_id => c_owner, p_expected_membership_id => v_worker_m, p_manual_discount => 1000);
    v_err := 'OK total=' || (select total from public.sales where id = v_sale);
  exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
  r := r || jsonb_build_object('E4_worker_with_perm_manual', v_err);
  perform set_config('role', 'postgres', true);

  -- Siempre aborta: es lo que garantiza que nada de lo anterior persista.
  raise exception 'ROLLBACK_OK %', r::text;
end
$test$;
