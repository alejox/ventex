-- Atribuir la venta a un miembro del equipo (para comisiones) y permitir cobrar
-- una cita. create_sale gana p_staff_id (con default para no romper llamadas).
alter table public.sales
  add column if not exists staff_id uuid references public.staff(id) on delete set null;

create index if not exists sales_staff_id_idx on public.sales (staff_id);

-- Se elimina la firma anterior (4 args) para evitar ambigüedad con la nueva.
drop function if exists public.create_sale(uuid, text, numeric, jsonb);

create or replace function public.create_sale(
  p_customer_id     uuid,
  p_payment_method  text,
  p_discount_amount numeric,
  p_items           jsonb,
  p_staff_id        uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_sale_id    uuid;
  v_subtotal   numeric(12,2) := 0;
  v_discount   numeric(12,2) := coalesce(p_discount_amount, 0);
  v_tax_rate   numeric(5,4);
  v_tax_exempt boolean := false;
  v_taxable    numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total      numeric(12,2);
  v_item       jsonb;
  v_product    public.products%rowtype;
  v_service    public.services%rowtype;
  v_is_service boolean;
  v_qty        integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  -- Ignora staff ajeno (defensa: el id viene del cliente).
  if p_staff_id is not null then
    perform 1 from public.staff where id = p_staff_id and user_id = v_uid;
    if not found then p_staff_id := null; end if;
  end if;

  select s.tax_rate into v_tax_rate from public.settings s where s.user_id = v_uid;
  v_tax_rate := coalesce(v_tax_rate, 0.1600);

  if p_customer_id is not null then
    select coalesce(c.tax_exempt, false) into v_tax_exempt
    from public.customers c where c.id = p_customer_id and c.user_id = v_uid;
    if v_tax_exempt then
      v_tax_rate := 0;
    end if;
  end if;

  insert into public.sales (user_id, customer_id, staff_id, payment_method, discount_amount, tax_rate)
  values (v_uid, p_customer_id, p_staff_id, coalesce(p_payment_method, 'efectivo'), v_discount, v_tax_rate)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida en la venta';
    end if;

    v_is_service := (v_item ? 'service_id') and (v_item->>'service_id') is not null;

    if v_is_service then
      select * into v_service from public.services
      where id = (v_item->>'service_id')::uuid and user_id = v_uid;
      if not found then
        raise exception 'Servicio no encontrado: %', v_item->>'service_id';
      end if;

      insert into public.sale_items
        (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total)
      values
        (v_uid, v_sale_id, null, v_service.id, v_service.name, null,
         v_service.price, v_qty, v_service.price * v_qty);

      v_subtotal := v_subtotal + (v_service.price * v_qty);
    else
      select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and user_id = v_uid;
      if not found then
        raise exception 'Producto no encontrado: %', v_item->>'product_id';
      end if;

      insert into public.sale_items
        (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total)
      values
        (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
         v_product.price, v_qty, v_product.price * v_qty);

      v_subtotal := v_subtotal + (v_product.price * v_qty);

      update public.products
        set stock_level = stock_level - v_qty, updated_at = now()
      where id = v_product.id and user_id = v_uid;
    end if;
  end loop;

  v_taxable    := greatest(v_subtotal - v_discount, 0);
  v_tax_amount := round(v_taxable * v_tax_rate, 2);
  v_total      := v_taxable + v_tax_amount;

  update public.sales
    set subtotal = v_subtotal, tax_amount = v_tax_amount, total = v_total
  where id = v_sale_id and user_id = v_uid;

  return v_sale_id;
end;
$$;

revoke execute on function public.create_sale(uuid, text, numeric, jsonb, uuid) from public, anon;
grant   execute on function public.create_sale(uuid, text, numeric, jsonb, uuid) to authenticated;
