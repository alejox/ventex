-- Split payment: una venta puede pagarse con varios métodos.
--
-- Agrega la tabla `sale_payments` y actualiza `create_sale` para aceptar
-- un array JSONB `p_payments` opcional. Si se envía, se inserta una fila
-- por cada split y se valida que la suma coincida con el total.
--
-- Backward compatible: si p_payments es null, se crea un solo pago con
-- los parámetros legacy (p_payment_method, p_transfer_method, p_card_method).

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method text not null check (payment_method in ('efectivo', 'tarjeta', 'transferencia')),
  amount numeric(12,2) not null check (amount > 0),
  transfer_method text,
  card_method text,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id)
);

alter table public.sale_payments enable row level security;

create policy "Tenant isolation for sale_payments"
  on public.sale_payments
  for all
  using (user_id = (select public.get_effective_user_id()))
  with check (user_id = (select public.get_effective_user_id()));

create or replace function public.set_sale_payment_user_id()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.user_id is null or new.user_id = '00000000-0000-0000-0000-000000000000' then
    new.user_id := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
  end if;
  return new;
end;
$$;

drop trigger if exists set_user_id on public.sale_payments;
create trigger set_user_id
  before insert on public.sale_payments
  for each row
  execute function public.set_sale_payment_user_id();

-- ── create_sale actualizado ──────────────────────────────────────────────

create or replace function public.create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_items jsonb,
  p_staff_id uuid default null::uuid,
  p_transfer_method text default null::text,
  p_card_method text default null::text,
  p_payments jsonb default null::jsonb
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
    v_effective_payment text;
    v_effective_transfer text;
    v_effective_card text;
    v_split        jsonb;
    v_split_sum    numeric(12,2) := 0;
  begin
    if v_auth is null then
      raise exception 'No autenticado';
    end if;
    if p_items is null or jsonb_array_length(p_items) = 0 then
      raise exception 'La venta no tiene productos';
    end if;

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
  end;
$function$;

revoke execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb) from public, anon;
grant   execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb) to authenticated;
revoke execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text) from public, anon;
grant   execute on function public.create_sale(uuid, text, numeric, jsonb, uuid, text, text) to authenticated;
