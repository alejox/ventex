-- Medios de tarjeta (Colombia: Bold, Credibanco, Redeban, SumUp, Mercado Pago…).
-- `settings` y `sales` SÍ tienen grants a nivel de tabla para authenticated, así
-- que estas columnas quedan cubiertas sin grants por columna (a diferencia de
-- `products`, donde el SELECT es columna por columna).
alter table public.settings
  add column if not exists card_methods_enabled jsonb not null
  default '["bold", "credibanco", "redeban"]'::jsonb;

alter table public.sales
  add column if not exists card_method text null;

-- create_sale + p_card_method.
--
-- OJO: esta definición NO es la del archivo 20260723010000_add_card_methods.sql.
-- Aquella quedó vieja y reintroducía tres regresiones ya corregidas: sumaba el
-- IVA sobre el precio de vitrina (que ya lo incluye), perdía allow_oversell y el
-- `for update`, y volvía a ser INVOKER (403 al cobrar). Esto es la función VIVA
-- con un parámetro más.
create or replace function public.create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_items jsonb,
  p_staff_id uuid default null::uuid,
  p_transfer_method text default null::text,
  p_card_method text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
  declare
    v_auth        uuid := (select auth.uid());
    v_uid         uuid := public.get_effective_user_id();
    v_is_worker   boolean := false;
    v_shift_id    uuid;
    v_sale_id     uuid;
    v_gross       numeric(12,2) := 0;   -- suma de precios de vitrina (IVA incluido)
    v_discount    numeric(12,2) := coalesce(p_discount_amount, 0);
    v_neto        numeric(12,2);
    v_tax_rate    numeric(5,4);
    v_include_tax boolean := true;
    v_allow_over  boolean := true;
    v_tax_exempt  boolean := false;
    v_base        numeric(12,2);        -- base gravable (sin IVA)
    v_tax_amount  numeric(12,2);
    v_total       numeric(12,2);
    v_stored_rate numeric(5,4);
    v_item        jsonb;
    v_product     public.products%rowtype;
    v_service     public.services%rowtype;
    v_is_service  boolean;
    v_qty         integer;
    v_item_staff_id uuid;
    v_effective_payment text;
    v_effective_transfer text;
    v_effective_card text;
  begin
    if v_auth is null then
      raise exception 'No autenticado';
    end if;
    if p_items is null or jsonb_array_length(p_items) = 0 then
      raise exception 'La venta no tiene productos';
    end if;

    -- El detalle del medio pertenece a SU forma de pago: una venta en efectivo
    -- no guarda ni transferencia ni tarjeta, aunque el cliente los mande.
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

    -- Los trabajadores solo cobran con turno abierto (antifraude de caja).
    select coalesce(is_worker, false) into v_is_worker
    from public.profiles where id = v_auth;
    if v_is_worker then
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

    -- Configuración fiscal del negocio. Default de tasa 0.19 (igual que el cliente).
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

    -- La tasa que queda registrada en la venta es la EFECTIVAMENTE cobrada:
    -- 0 si el negocio no es responsable de IVA o si el cliente está exento.
    if not v_include_tax or v_tax_exempt then
      v_stored_rate := 0;
    else
      v_stored_rate := v_tax_rate;
    end if;

    insert into public.sales (user_id, customer_id, staff_id, payment_method, transfer_method, card_method, discount_amount, tax_rate, shift_id)
    values (v_uid, p_customer_id, p_staff_id, v_effective_payment, v_effective_transfer, v_effective_card, v_discount, v_stored_rate, v_shift_id)
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

        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id)
        values
          (v_uid, v_sale_id, null, v_service.id, v_service.name, null,
           v_service.price, v_qty, v_service.price * v_qty, v_item_staff_id);

        v_gross := v_gross + (v_service.price * v_qty);
      else
        -- `for update`: sin el candado, dos cajas vendiendo la última unidad
        -- leerían stock_level = 1 y las dos pasarían.
        select * into v_product from public.products
        where id = (v_item->>'product_id')::uuid and user_id = v_uid
        for update;
        if not found then
          raise exception 'Producto no encontrado';
        end if;

        -- Sobreventa configurable por negocio. create_sale vende unidades
        -- sueltas (no multiplica por units_per_package, a diferencia de
        -- increment_stock).
        if not v_allow_over and (v_product.stock_level - v_qty) < 0 then
          raise exception 'STOCK_INSUFICIENTE: % — hay % unidades y se intentan vender %',
            v_product.name, v_product.stock_level, v_qty;
        end if;

        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id)
        values
          (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
           v_product.price, v_qty, v_product.price * v_qty, v_item_staff_id);

        v_gross := v_gross + (v_product.price * v_qty);

        update public.products
          set stock_level = stock_level - v_qty, updated_at = now()
        where id = v_product.id and user_id = v_uid;
      end if;
    end loop;

    -- Matemática de IVA — espejo EXACTO de computeTotals. El orden de las ramas
    -- es load-bearing: !include_tax -> tax_exempt -> responsable.
    v_neto := greatest(v_gross - v_discount, 0);

    if not v_include_tax then
      -- No responsable: no hay IVA que reportar ni que eximir.
      v_base := v_neto;
      v_tax_amount := 0;
      v_total := v_neto;
    elsif v_tax_exempt then
      -- Cliente exento: paga la base; gross - base es el descuento por exención.
      v_base := round(v_neto / (1 + v_tax_rate), 2);
      v_tax_amount := 0;
      v_total := v_base;
    else
      -- Responsable: el cliente paga el precio de vitrina, se desglosa la base.
      v_base := round(v_neto / (1 + v_tax_rate), 2);
      v_tax_amount := round(v_neto - v_base, 2);
      v_total := v_neto;
    end if;

    update public.sales
      set subtotal = v_base, tax_amount = v_tax_amount, total = v_total
    where id = v_sale_id and user_id = v_uid;

    return v_sale_id;
  end;
$function$;

-- La firma de 6 argumentos se va DESPUÉS de crear la de 7, en la misma
-- transacción: si convivieran, PostgREST no sabría cuál llamar.
drop function if exists public.create_sale(uuid, text, numeric, jsonb, uuid, text);

revoke execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text) from public, anon;
grant   execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text) to authenticated;
