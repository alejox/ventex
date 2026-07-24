-- Venta por CAJA o por UNIDAD.
--
-- El stock siempre se cuenta en UNIDADES sueltas (`products.stock_level`), como
-- hasta ahora. Lo que cambia es que una línea de venta puede representar una
-- caja: se cobra `package_price` y se descuentan `units_per_package` unidades.
-- Así no hay dos inventarios que sincronizar — que es de donde salen los
-- descuadres en los POS que modelan la caja como un producto aparte.

-- Precio de venta de la caja. IVA INCLUIDO, igual que `price`: los precios del
-- catálogo son precio final al público. NULL = este producto no se vende por caja.
alter table public.products add column if not exists package_price numeric(12,2);

-- `products` tiene los grants POR COLUMNA (así se esconde purchase_price):
-- una columna nueva nace sin permisos.
grant select (package_price), insert (package_price), update (package_price)
  on public.products to authenticated;

-- Qué se vendió en cada línea y cuántas unidades base consumió.
-- `units_per_item` se congela en la venta: si mañana cambia el empaque del
-- producto, el histórico tiene que seguir diciendo qué se entregó ese día.
alter table public.sale_items
  add column if not exists unit_kind text not null default 'unit'
    check (unit_kind in ('unit', 'package'));
alter table public.sale_items
  add column if not exists units_per_item integer not null default 1
    check (units_per_item > 0);

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
    v_kind        text;
    v_unit_price  numeric(12,2);
    v_units       integer;
    v_stock_delta integer;
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
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item)
        values
          (v_uid, v_sale_id, null, v_service.id, v_service.name, null,
           v_service.price, v_qty, v_service.price * v_qty, v_item_staff_id, 'unit', 1);

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

        -- Unidad o caja. El precio NUNCA llega del cliente: se resuelve acá
        -- contra la fila del producto, o cualquiera podría cobrarse lo que
        -- quisiera mandando otro número.
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

        -- El stock siempre se mueve en unidades sueltas: una caja son N.
        v_stock_delta := v_qty * v_units;

        if not v_allow_over and (v_product.stock_level - v_stock_delta) < 0 then
          raise exception 'STOCK_INSUFICIENTE: % — hay % unidades y se intentan vender %',
            v_product.name, v_product.stock_level, v_stock_delta;
        end if;

        insert into public.sale_items
          (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id, unit_kind, units_per_item)
        values
          (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
           v_unit_price, v_qty, v_unit_price * v_qty, v_item_staff_id, v_kind, v_units);

        v_gross := v_gross + (v_unit_price * v_qty);

        update public.products
          set stock_level = stock_level - v_stock_delta, updated_at = now()
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

revoke execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text) from public, anon;
grant   execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text) to authenticated;
