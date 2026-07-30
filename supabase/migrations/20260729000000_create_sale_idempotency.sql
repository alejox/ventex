-- Idempotencia en create_sale.
--
-- El problema: `create_sale` no recibia ninguna clave del cliente, asi que un
-- reintento era indistinguible de una venta nueva. Si el servidor grababa la
-- venta y la respuesta se perdia en el camino (red intermitente, el cajero
-- toca "Cobrar" dos veces), reintentar creaba una SEGUNDA venta con su segundo
-- descuento de stock; no reintentar la perdia. No habia opcion buena.
--
-- La solucion: el cliente acuña un uuid por intento de cobro y lo reusa en
-- cada reintento del MISMO carrito. El RPC lo trata como clave de negocio:
-- si ya existe, devuelve la venta que ya esta y no toca nada.
--
-- Esto es tambien el cimiento de la cola de ventas sin conexion: sin una
-- clave estable, drenar una cola es una fabrica de ventas duplicadas.

alter table public.sales add column if not exists client_sale_id uuid;

comment on column public.sales.client_sale_id is
  'Clave de idempotencia acuñada por el cliente. Reintentar create_sale con la misma clave devuelve esta venta en vez de crear otra. NULL en las ventas anteriores a esta migracion y en las que no la manden.';

-- Parcial: las ventas historicas y las que no manden clave tienen todas NULL y
-- no deben chocar entre si.
create unique index if not exists sales_user_id_client_sale_id_key
  on public.sales (user_id, client_sale_id)
  where client_sale_id is not null;

-- Los grants de `sales` son POR COLUMNA: una columna nueva nace sin permisos y
-- PostgREST responde "permission denied" a cualquier `select *`, que parece un
-- problema de RLS y no lo es.
grant select (client_sale_id), insert (client_sale_id), update (client_sale_id)
  on public.sales to authenticated;

-- La firma cambia, asi que hay que soltar la anterior: `create or replace` con
-- una lista de parametros distinta deja DOS funciones vivas y PostgREST no
-- sabe cual llamar.
drop function if exists public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb);

create or replace function public.create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_items jsonb,
  p_staff_id uuid default null::uuid,
  p_transfer_method text default null::text,
  p_card_method text default null::text,
  p_payments jsonb default null::jsonb,
  p_client_sale_id uuid default null::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  declare
    v_auth        uuid := (select auth.uid());
    v_uid         uuid := public.get_effective_user_id();
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

    -- Workers solo cobran con turno abierto (excepto crédito: el fiado no pasa por caja)
    select coalesce(is_worker, false) into v_is_worker
    from public.profiles where id = v_auth;
    if v_is_worker and v_effective_payment != 'credito' then
      select id into v_shift_id from public.shifts
      where worker_id = v_auth and status = 'open';
      if v_shift_id is null then
        raise exception 'Debes abrir turno antes de cobrar';
      end if;
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

    insert into public.sales (user_id, customer_id, staff_id, payment_method, transfer_method, card_method, discount_amount, tax_rate, shift_id, client_sale_id)
    values (v_uid, p_customer_id, p_staff_id, v_effective_payment, v_effective_transfer, v_effective_card, v_discount, v_stored_rate, v_shift_id, p_client_sale_id)
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

        v_stock_delta := v_qty * v_units;

        if not v_allow_over and (v_product.stock_level - v_stock_delta) < 0 then
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

        update public.products
          set stock_level = stock_level - v_stock_delta, updated_at = now()
        where id = v_product.id and user_id = v_uid;
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

-- Recrear la funcion la devuelve a EXECUTE para PUBLIC, que incluye a anon.
-- Cobrar es de usuarios autenticados y nada mas.
revoke execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid) from public, anon;
grant   execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid) to authenticated;
