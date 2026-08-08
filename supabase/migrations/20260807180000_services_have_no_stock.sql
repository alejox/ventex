-- Un servicio se cobra, pero NO se inventaría.
--
-- `products` no tiene columna de tipo: la unidad 'Servicio' es el discriminador
-- entre un producto y un servicio (lo escribe el alta de inventario). Hasta
-- ahora la base no lo sabía, así que un servicio recorría el mismo camino que
-- una caja de gaseosas: `create_sale` le descontaba unidades en cada venta,
-- `void_sale` se las devolvía y `register_manual_movement` lo dejaba ajustar.
-- Resultado real: un "BAÑO" de mascotas con stock -2, que además pedía
-- reposición a un proveedor y sumaba a la valorización del inventario.
--
-- Acá se corta en los tres RPCs que tocan `stock_level`, se limpian las filas
-- que ya arrastraban existencias y se agrega un CHECK que impide que vuelva a
-- pasar por cualquier camino futuro.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Venta: un servicio no descuenta stock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_items jsonb,
  p_staff_id uuid DEFAULT NULL::uuid,
  p_transfer_method text DEFAULT NULL::text,
  p_card_method text DEFAULT NULL::text,
  p_payments jsonb DEFAULT NULL::jsonb,
  p_client_sale_id uuid DEFAULT NULL::uuid,
  p_expected_workspace_id uuid DEFAULT NULL::uuid,
  p_expected_membership_id uuid DEFAULT NULL::uuid,
  p_expected_shift_id uuid DEFAULT NULL::uuid
)
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
    v_qty         integer;
    v_item_staff_id uuid;
    v_kind        text;
    v_unit_price  numeric(12,2);
    v_units       integer;
    v_stock_delta integer;
    v_line_total  numeric(12,2);
    v_commission  numeric(12,2);
    v_effective_payment text;
    v_effective_transfer text;
    v_effective_card text;
    v_split        jsonb;
    v_split_sum    numeric(12,2) := 0;
    v_credit_limit numeric(12,2);
    v_current_balance numeric(12,2);
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
    v_is_worker := v_member_kind = 'member';
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

    -- Tope de ventas del plan. Se evalua antes de tocar nada.
    -- p_add = 0: mide lo YA acumulado en el mes. El total de esta venta todavia
    -- no existe (se calcula al final), asi que no hay nada que sumarle.
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

    if v_is_worker and v_effective_payment != 'credito' and v_shift_id is null then
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

    insert into public.sales (user_id, customer_id, staff_id, payment_method, transfer_method, card_method, discount_amount, tax_rate, shift_id, client_sale_id, membership_id)
    values (v_uid, p_customer_id, p_staff_id, v_effective_payment, v_effective_transfer, v_effective_card, v_discount, v_stored_rate, v_shift_id, p_client_sale_id, v_membership_id)
    returning id into v_sale_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_qty := (v_item->>'quantity')::integer;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Cantidad inválida en la venta';
      end if;

      v_item_staff_id := (v_item->>'staff_id')::uuid;
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

        v_line_total := v_service.price * v_qty;

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
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount)
        values
          (v_uid, v_sale_id, null, v_service.id, v_service.name, null,
           v_service.price, v_qty, v_line_total, v_item_staff_id, 'unit', 1, v_commission);

        v_gross := v_gross + v_line_total;
      else
        select * into v_product from public.products
        where id = (v_item->>'product_id')::uuid and user_id = v_uid
        for update;
        if not found then
          raise exception 'Producto no encontrado';
        end if;

        v_kind := coalesce(v_item->>'kind', 'unit');
        if v_kind = 'package' then
          if v_product.package_price is null then
            raise exception 'SIN_PRECIO_CAJA: % no tiene precio por caja', v_product.name;
          end if;
          v_unit_price := v_product.package_price;
          v_units      := greatest(coalesce(v_product.units_per_package, 1), 1);
        else
          v_kind       := 'unit';
          v_unit_price := v_product.price;
          v_units      := 1;
        end if;

        -- Un servicio del catálogo de productos (unit = 'Servicio') se cobra
        -- pero no se inventaría: no hay unidades que descontar ni que puedan
        -- faltar. Con delta 0 tampoco corre el control de sobreventa: "no
        -- alcanza el stock" no significa nada para un baño de mascotas.
        if v_product.unit = 'Servicio' then
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
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item, commission_amount)
        values
          (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
           v_unit_price, v_qty, v_line_total, v_item_staff_id, v_kind, v_units, v_commission);

        v_gross := v_gross + v_line_total;

        if v_stock_delta > 0 then
          update public.products
            set stock_level = stock_level - v_stock_delta, updated_at = now()
          where id = v_product.id and user_id = v_uid;
        end if;
      end if;
    end loop;

    v_neto := greatest(v_gross - v_discount, 0);

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
    else
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
    -- Dos reintentos EN PARALELO con la misma clave: el segundo se bloquea en
    -- el indice unico hasta que el primero termina y despues choca. El bloque
    -- deshace su trabajo a medias (incluido el descuento de stock) y devuelve
    -- la venta del que gano. Cualquier otra violacion de unicidad se re-lanza.
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

-- ---------------------------------------------------------------------------
-- 2) Anulación: si la venta no descontó stock, la anulación no lo devuelve.
--    Sin este filtro, anular la venta de un servicio le INVENTABA existencias
--    positivas y le dejaba un movimiento de inventario que nunca existió.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  member_kind text;
  active_shift_id uuid;
  cash_refund numeric := 0;
  sale_row record;
  item_row record;
  return_units integer;
begin
  if caller is null or workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  select m.member_kind into member_kind
  from public.workspace_memberships m
  where m.id = membership_id
    and m.workspace_id = workspace
    and m.auth_user_id = caller
    and m.status = 'active';

  if not found or (
    member_kind = 'member'
    and not public.worker_can('sales')
  ) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  select
    sale.id,
    sale.status,
    sale.total,
    sale.payment_method,
    sale.shift_id,
    sale.sale_number
  into sale_row
  from public.sales sale
  where sale.id = p_sale_id
    and sale.user_id = workspace
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if sale_row.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas';
  end if;

  if sale_row.payment_method = 'efectivo' then
    cash_refund := sale_row.total;
  elsif sale_row.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into cash_refund
    from public.sale_payments payment
    where payment.sale_id = sale_row.id
      and payment.user_id = workspace
      and payment.payment_method = 'efectivo';
  end if;

  if cash_refund > 0 then
    select shift_row.id into active_shift_id
    from public.shifts shift_row
    where shift_row.user_id = workspace
      and shift_row.membership_id = membership_id
      and shift_row.worker_id = caller
      and shift_row.status = 'open';
    if active_shift_id is null then
      raise exception 'Debes abrir turno antes de devolver efectivo';
    end if;
  end if;

  update public.sales
  set status = 'void'
  where id = p_sale_id
    and user_id = workspace;

  for item_row in
    select
      item.product_id,
      item.quantity,
      item.unit_kind,
      item.units_per_item
    from public.sale_items item
    join public.products prod
      on prod.id = item.product_id
     and prod.user_id = workspace
    where item.sale_id = p_sale_id
      and item.user_id = workspace
      and item.product_id is not null
      -- Un servicio nunca descontó stock: no hay nada que devolverle.
      and prod.unit <> 'Servicio'
  loop
    return_units := case
      when item_row.unit_kind = 'package'
        then item_row.quantity * item_row.units_per_item
      else item_row.quantity
    end;

    update public.products
    set stock_level = stock_level + return_units
    where id = item_row.product_id
      and user_id = workspace;

    insert into public.inventory_movements (
      product_id,
      quantity,
      type,
      reference_type,
      reference_id,
      created_by,
      user_id,
      notes
    )
    values (
      item_row.product_id,
      return_units,
      'in',
      'sale_void',
      p_sale_id,
      caller,
      workspace,
      'Anulación de venta #' || sale_row.sale_number::text
    );
  end loop;

  if cash_refund > 0 then
    insert into public.cash_movements (
      amount,
      reason,
      shift_id,
      user_id,
      worker_id,
      membership_id
    )
    values (
      cash_refund,
      'Devolución - Venta #' || sale_row.sale_number::text || ' anulada',
      active_shift_id,
      workspace,
      caller,
      membership_id
    );
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Movimiento manual: un servicio no tiene existencias que entrar, sacar ni
--    ajustar. El formulario ya no lo ofrece; acá se cierra de verdad.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_manual_movement(p_product_id uuid, p_type text, p_quantity integer, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_actor uuid := (select auth.uid());
  v_units integer;
  v_stock integer;
  v_new   integer;
  v_unit  text;
begin
  if v_actor is null then
    raise exception 'No autenticado';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO: no tenés permiso para mover stock'
      using errcode = '42501';
  end if;

  if p_type not in ('in', 'out', 'adjust') then
    raise exception 'Tipo de movimiento inválido: %', p_type;
  end if;

  if p_quantity < 0 then
    raise exception 'La cantidad no puede ser negativa';
  end if;

  select coalesce(units_per_package, 1), stock_level, unit
    into v_units, v_stock, v_unit
  from public.products
  where id = p_product_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if v_unit = 'Servicio' then
    raise exception 'SIN_STOCK: un servicio no lleva inventario';
  end if;

  v_new := case p_type
             when 'adjust' then p_quantity
             when 'in'     then v_stock + (p_quantity * v_units)
             else               v_stock - (p_quantity * v_units)
           end;

  if v_new < 0 then
    raise exception 'STOCK_INSUFICIENTE: hay % unidades y se intentan retirar %',
      v_stock, abs(v_new - v_stock);
  end if;

  insert into public.inventory_movements (user_id, created_by, product_id, type, quantity, reference_type, notes)
  values (v_uid, v_actor, p_product_id, p_type, p_quantity, 'manual', nullif(p_notes, ''));

  update public.products
     set stock_level = v_new,
         updated_at  = now()
   where id = p_product_id and user_id = v_uid;
end;
$function$;

-- Recrear la función no puede aflojar quién la ejecuta.
REVOKE ALL ON FUNCTION public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.void_sale(uuid) FROM public;
REVOKE ALL ON FUNCTION public.register_manual_movement(uuid, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_sale(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_manual_movement(uuid, text, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Limpiar lo que ya quedó sucio y cerrar la puerta.
--
--    `products_guard_edit` compara el resto de la fila contra `worker_can`, que
--    depende de un contexto de sesión que en una migración no existe. Se baja y
--    se restituye dentro de la misma transacción (mismo procedimiento que usó
--    la migración que sacó las variantes).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS products_guard_edit ON public.products;

-- `minimum_stock` también: su default es 10, y con eso un servicio pedía
-- reposición eternamente.
UPDATE public.products
SET stock_level = 0,
    minimum_stock = 0
WHERE unit = 'Servicio'
  AND (stock_level <> 0 OR minimum_stock <> 0);

-- El backstop: cualquier camino que en el futuro intente inventariar un
-- servicio (una compra, un RPC nuevo) falla fuerte en vez de corromper en
-- silencio. `minimum_stock` queda afuera del CHECK a propósito: su default de
-- tabla es 10 y un insert que no lo mencione no tiene por qué reventar.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_service_has_no_stock;
ALTER TABLE public.products
  ADD CONSTRAINT products_service_has_no_stock
  CHECK (unit <> 'Servicio' OR stock_level = 0);

CREATE TRIGGER products_guard_edit BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION products_guard_edit();

COMMIT;
