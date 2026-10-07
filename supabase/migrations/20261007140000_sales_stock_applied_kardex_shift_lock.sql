-- Ventas: stock congelado por línea, kardex simétrico, turno bloqueado contra
-- el cierre y método de pago validado.
--
-- Construida sobre las definiciones VIVAS de create_sale y void_sale
-- (pg_get_functiondef al 2026-10-07, después de 20261007100000/100100). Trae
-- las dos funciones COMPLETAS.
--
-- [1] Carrera con close_shift. create_sale y void_sale leían el turno abierto
--     SIN bloquearlo: una venta (o una devolución) podía quedar en un turno que
--     close_shift ya estaba sumando y no entrar en NINGÚN arqueo. close_shift
--     toma el turno con FOR UPDATE; ahora create_sale y void_sale lo leen con
--     FOR SHARE, así que esperan a que el cierre confirme. Como el SELECT filtra
--     `status = 'open'`, Postgres vuelve a evaluar la fila ya cerrada y no la
--     devuelve: la venta cae en los errores de siempre (CONTEXTO_DE_TRABAJO_CAMBIO
--     si el cliente esperaba ese turno, "Debes abrir turno antes de cobrar" si
--     el negocio exige turno) y la devolución cae en el ruteo existente (turno
--     de quien anula / sin caja para el dueño). Al revés, un cierre que llega
--     mientras una venta tiene el turno en FOR SHARE espera a que la venta
--     confirme, y la suma.
--
-- [2] sale_items.stock_qty_applied: unidades que la línea descontó del stock al
--     venderse (0 si no controla stock o es servicio). void_sale devuelve
--     EXACTAMENTE eso; NULL = línea anterior a esta migración, que cae a la
--     regla vieja (tracks_stock/unit ACTUALES del producto). Mismo modelo que
--     invoice_items.stock_qty_applied (20261007160200). Sin backfill: las ventas
--     viejas no dejaron movimiento de kardex del que reconstruirlo.
--
-- [3] Kardex: create_sale no escribía inventory_movements pero void_sale sí
--     escribía la entrada 'sale_void'. Ahora cada línea que descuenta stock
--     deja su salida (type 'out', reference_type 'sale', reference_id = venta).
--     Y create_sale bloquea los productos de la venta en orden de id ANTES de
--     procesar las líneas, igual que replace_purchase_invoice_items: dos
--     transacciones que tocan los mismos productos los piden en el mismo orden
--     y no se cruzan en un deadlock. void_sale hace lo mismo.
--
-- [4] Método de pago: create_sale aceptaba cualquier texto en p_payment_method
--     (y en los splits). Ahora solo efectivo/tarjeta/transferencia/credito
--     (METODO_PAGO_INVALIDO); 'split' lo pone la función. El CHECK sobre
--     sales.payment_method va en 20261007140100.

-- ------------------------------------------------------------- [2] columna
alter table public.sale_items
  add column if not exists stock_qty_applied numeric(12,3);

comment on column public.sale_items.stock_qty_applied is
  'Ventas: unidades que esta línea descontó del stock al venderse. NULL = legado (void_sale usa tracks_stock/unit actuales).';

-- ------------------------------------------------------------- create_sale
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
    v_sale_number bigint;
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
        -- [4] Mismo conjunto que sale_payments_payment_method_check.
        if v_split->>'payment_method' not in ('efectivo', 'tarjeta', 'transferencia', 'credito') then
          raise exception 'METODO_PAGO_INVALIDO: método de pago desconocido (%)', v_split->>'payment_method'
            using errcode = '22023';
        end if;
      end loop;
    end if;

    if p_payments is not null and jsonb_array_length(p_payments) > 0 then
      v_effective_payment := 'split';
      v_effective_transfer := null;
      v_effective_card := null;
    else
      v_effective_payment := coalesce(p_payment_method, 'efectivo');
      -- [4] 'split' solo lo pone esta función, cuando llegan splits.
      if v_effective_payment not in ('efectivo', 'tarjeta', 'transferencia', 'credito') then
        raise exception 'METODO_PAGO_INVALIDO: método de pago desconocido (%)', v_effective_payment
          using errcode = '22023';
      end if;
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
    -- [1] FOR SHARE: si close_shift tiene el turno (FOR UPDATE), esperamos a
    -- que confirme; la fila ya cerrada deja de cumplir `status = 'open'` y no
    -- vuelve, así que la venta cae en los mismos errores de abajo en vez de
    -- quedar en un turno que ningún arqueo cuenta.
    if v_effective_payment != 'credito' or p_expected_shift_id is not null then
      select shift_row.id into v_shift_id
      from public.shifts shift_row
      where shift_row.user_id = v_uid
        and shift_row.membership_id = v_membership_id
        and shift_row.worker_id = v_auth
        and shift_row.status = 'open'
      for share;
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

    -- [3] Los productos de la venta se bloquean en orden de id ANTES de las
    -- líneas (mismo orden que replace_purchase_invoice_items): sin esto, dos
    -- operaciones sobre los mismos productos en distinto orden se cruzan en
    -- un deadlock. El FOR UPDATE de cada línea, más abajo, ya no espera.
    perform 1
      from public.products pr
     where pr.user_id = v_uid
       and pr.id in (
         select nullif(it->>'product_id', '')::uuid
           from jsonb_array_elements(p_items) as it
          where nullif(it->>'service_id', '') is null
       )
     order by pr.id
       for update;

    insert into public.sales (user_id, customer_id, staff_id, payment_method, transfer_method, card_method, discount_amount, tax_rate, shift_id, client_sale_id, membership_id, amount_tendered)
    values (v_uid, p_customer_id, p_staff_id, v_effective_payment, v_effective_transfer, v_effective_card, v_discount, v_stored_rate, v_shift_id, p_client_sale_id, v_membership_id, v_tendered)
    returning id, sale_number into v_sale_id, v_sale_number;

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
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount, discount_amount, stock_qty_applied)
        values
          (v_uid, v_sale_id, null, v_service.id, v_service.name, null,
           v_service.price, v_qty, v_line_total, v_item_staff_id, 'unit', 1, v_commission, v_line_discount, 0)
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

        -- [2] stock_qty_applied congela lo que ESTA línea descontó: es lo
        -- que void_sale devuelve, aunque mañana cambie tracks_stock.
        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount, discount_amount, stock_qty_applied)
        values
          (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
           v_unit_price, v_qty, v_line_total, v_item_staff_id, v_kind, v_units, v_commission, v_line_discount,
           greatest(v_stock_delta, 0))
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

          -- [3] Salida de kardex, espejo de la entrada 'sale_void' de void_sale.
          insert into public.inventory_movements (
            product_id, quantity, type, reference_type, reference_id, created_by, user_id, notes
          )
          values (
            v_product.id, v_stock_delta, 'out', 'sale', v_sale_id, v_auth, v_uid,
            'Venta #' || v_sale_number::text
          );
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

-- --------------------------------------------------------------- void_sale
CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- [1] Los turnos se leen con FOR SHARE: si close_shift (FOR UPDATE) está
    -- cerrando uno, se espera a que confirme y la fila cerrada ya no cumple
    -- `status = 'open'`, así que la devolución sigue el ruteo de abajo en vez
    -- de caer en un turno que ningún arqueo cuenta.

    -- Turno abierto de quien anula.
    select shift_row.id into v_active_shift_id
    from public.shifts shift_row
    where shift_row.user_id = v_workspace
      and shift_row.membership_id = v_membership_id
      and shift_row.worker_id = v_caller
      and shift_row.status = 'open'
    for share;

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
      for share;
    end if;

    -- 2. Si no, el de quien anula.
    if v_target_shift_id is null and v_active_shift_id is not null then
      select shift_row.id, shift_row.membership_id
      into v_target_shift_id, v_target_membership_id
      from public.shifts shift_row
      where shift_row.id = v_active_shift_id
        and shift_row.user_id = v_workspace
        and shift_row.status = 'open'
      for share;
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

  -- [3] Productos de la venta bloqueados en orden de id (mismo orden que
  -- create_sale y replace_purchase_invoice_items).
  perform 1
    from public.products prod
   where prod.user_id = v_workspace
     and prod.id in (
       select item.product_id
         from public.sale_items item
        where item.sale_id = p_sale_id
          and item.user_id = v_workspace
          and item.product_id is not null
     )
   order by prod.id
     for update;

  for v_item_row in
    select
      item.product_id,
      item.quantity,
      item.unit_kind,
      item.units_per_item,
      item.stock_qty_applied,
      prod.unit,
      prod.tracks_stock
    from public.sale_items item
    join public.products prod
      on prod.id = item.product_id
     and prod.user_id = v_workspace
    where item.sale_id = p_sale_id
      and item.user_id = v_workspace
      and item.product_id is not null
  loop
    -- [2] Se devuelve EXACTAMENTE lo que la línea descontó. NULL = línea de
    -- antes de 20261007140000: regla vieja, con tracks_stock/unit actuales
    -- (un servicio nunca descontó stock).
    v_return_units := coalesce(
      v_item_row.stock_qty_applied,
      case
        when v_item_row.unit = 'Servicio' or not coalesce(v_item_row.tracks_stock, true) then 0
        when v_item_row.unit_kind = 'package'
          then v_item_row.quantity * v_item_row.units_per_item
        else v_item_row.quantity
      end
    );
    continue when v_return_units <= 0;

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
