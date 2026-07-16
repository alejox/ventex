-- ============================================================
-- Turnos (caja) para empleados.
-- Un empleado abre turno con base de caja, sus ventas quedan
-- selladas al turno y al cierre se calcula el arqueo.
-- ============================================================

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default public.get_effective_user_id(),
  worker_id uuid not null references auth.users(id) default auth.uid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric not null default 0 check (opening_cash >= 0),
  closing_cash numeric check (closing_cash >= 0),
  expected_cash numeric,
  difference numeric,
  sales_total numeric,
  sales_count integer,
  totals_by_method jsonb,
  notes text,
  status text not null default 'open' check (status in ('open', 'closed'))
);

alter table public.shifts enable row level security;

-- Lectura: todo el tenant (dueño y sus empleados) ve los turnos del negocio.
create policy shifts_select_tenant on public.shifts
  for select using (user_id = public.get_effective_user_id());

-- Insert: solo el propio turno, dentro del tenant.
create policy shifts_insert_own on public.shifts
  for insert with check (
    user_id = public.get_effective_user_id() and worker_id = (select auth.uid())
  );

-- Update: el empleado su propio turno, o el dueño cualquiera de su negocio.
create policy shifts_update_own_or_owner on public.shifts
  for update
  using (worker_id = (select auth.uid()) or user_id = (select auth.uid()))
  with check (worker_id = (select auth.uid()) or user_id = (select auth.uid()));

-- Un solo turno abierto por empleado.
create unique index shifts_one_open_per_worker
  on public.shifts (worker_id) where status = 'open';

create index shifts_user_id_opened_idx on public.shifts (user_id, opened_at desc);

-- Ventas selladas al turno.
alter table public.sales
  add column shift_id uuid references public.shifts(id) on delete set null;
create index sales_shift_id_idx on public.sales (shift_id);

-- ------------------------------------------------------------
-- Abrir turno: solo empleados, uno a la vez.
-- ------------------------------------------------------------
create or replace function public.open_shift(p_opening_cash numeric)
returns json
language plpgsql
set search_path to ''
as $$
declare
  v_auth uuid := (select auth.uid());
  v_shift public.shifts;
begin
  if v_auth is null then
    raise exception 'No autenticado';
  end if;
  if not exists (select 1 from public.profiles where id = v_auth and is_worker = true) then
    raise exception 'Solo los empleados abren turno';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'La base de caja no puede ser negativa';
  end if;
  if exists (select 1 from public.shifts where worker_id = v_auth and status = 'open') then
    raise exception 'Ya tienes un turno abierto';
  end if;

  insert into public.shifts (opening_cash) values (p_opening_cash)
  returning * into v_shift;

  return json_build_object(
    'id', v_shift.id,
    'opened_at', v_shift.opened_at,
    'opening_cash', v_shift.opening_cash
  );
end;
$$;

-- ------------------------------------------------------------
-- Turno abierto del caller + acumulados en vivo.
-- ------------------------------------------------------------
create or replace function public.current_shift()
returns json
language plpgsql
stable
set search_path to ''
as $$
declare
  v_shift public.shifts;
  v_cnt integer;
  v_total numeric;
  v_cash numeric;
  v_by_method json;
begin
  select * into v_shift from public.shifts
  where worker_id = (select auth.uid()) and status = 'open';
  if not found then
    return null;
  end if;

  select count(*)::int,
         coalesce(sum(total), 0),
         coalesce(sum(total) filter (where payment_method = 'efectivo'), 0)
    into v_cnt, v_total, v_cash
  from public.sales
  where shift_id = v_shift.id and status = 'completed';

  select coalesce(json_object_agg(payment_method, mt), '{}'::json)
    into v_by_method
  from (
    select payment_method, sum(total) as mt
    from public.sales
    where shift_id = v_shift.id and status = 'completed'
    group by payment_method
  ) x;

  return json_build_object(
    'id', v_shift.id,
    'opened_at', v_shift.opened_at,
    'opening_cash', v_shift.opening_cash,
    'sales_count', v_cnt,
    'sales_total', v_total,
    'cash_total', v_cash,
    'expected_cash', v_shift.opening_cash + v_cash,
    'totals_by_method', v_by_method
  );
end;
$$;

-- ------------------------------------------------------------
-- Cerrar turno con arqueo. p_shift_id permite al dueño cerrar
-- un turno olvidado de un empleado.
-- ------------------------------------------------------------
create or replace function public.close_shift(
  p_closing_cash numeric,
  p_notes text default null,
  p_shift_id uuid default null
)
returns json
language plpgsql
set search_path to ''
as $$
declare
  v_auth uuid := (select auth.uid());
  v_shift public.shifts;
  v_cnt integer;
  v_total numeric;
  v_cash numeric;
  v_by_method jsonb;
  v_expected numeric;
  v_diff numeric;
  v_closed_at timestamptz := now();
begin
  if v_auth is null then
    raise exception 'No autenticado';
  end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'El efectivo contado no puede ser negativo';
  end if;

  if p_shift_id is not null then
    -- Cierre por el dueño (user_id del turno = su uid).
    select * into v_shift from public.shifts
    where id = p_shift_id and status = 'open' and user_id = v_auth
    for update;
    if not found then
      raise exception 'Turno no encontrado o ya cerrado';
    end if;
  else
    select * into v_shift from public.shifts
    where worker_id = v_auth and status = 'open'
    for update;
    if not found then
      raise exception 'No tienes un turno abierto';
    end if;
  end if;

  select count(*)::int,
         coalesce(sum(total), 0),
         coalesce(sum(total) filter (where payment_method = 'efectivo'), 0)
    into v_cnt, v_total, v_cash
  from public.sales
  where shift_id = v_shift.id and status = 'completed';

  select coalesce(jsonb_object_agg(payment_method, mt), '{}'::jsonb)
    into v_by_method
  from (
    select payment_method, sum(total) as mt
    from public.sales
    where shift_id = v_shift.id and status = 'completed'
    group by payment_method
  ) x;

  v_expected := v_shift.opening_cash + v_cash;
  v_diff := p_closing_cash - v_expected;

  update public.shifts set
    status = 'closed',
    closed_at = v_closed_at,
    closing_cash = p_closing_cash,
    expected_cash = v_expected,
    difference = v_diff,
    sales_total = v_total,
    sales_count = v_cnt,
    totals_by_method = v_by_method,
    notes = coalesce(p_notes, notes)
  where id = v_shift.id;

  return json_build_object(
    'id', v_shift.id,
    'opened_at', v_shift.opened_at,
    'closed_at', v_closed_at,
    'opening_cash', v_shift.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', v_expected,
    'difference', v_diff,
    'sales_total', v_total,
    'sales_count', v_cnt,
    'totals_by_method', v_by_method
  );
end;
$$;

-- ------------------------------------------------------------
-- create_sale: uid efectivo del tenant (los lookups y la venta
-- son del negocio aunque cobre un empleado) + sellado del turno.
-- Un empleado sin turno abierto no puede cobrar.
-- ------------------------------------------------------------
create or replace function public.create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount_amount numeric,
  p_items jsonb,
  p_staff_id uuid default null::uuid
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_auth       uuid := (select auth.uid());
  v_uid        uuid := public.get_effective_user_id();
  v_is_worker  boolean := false;
  v_shift_id   uuid;
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
  v_item_staff_id uuid;
begin
  if v_auth is null then
    raise exception 'No autenticado';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  -- Empleados: turno abierto obligatorio; la venta queda sellada al turno.
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

  select s.tax_rate into v_tax_rate from public.settings s where s.user_id = v_uid;
  v_tax_rate := coalesce(v_tax_rate, 0.1600);

  if p_customer_id is not null then
    select coalesce(c.tax_exempt, false) into v_tax_exempt
    from public.customers c where c.id = p_customer_id and c.user_id = v_uid;
    if v_tax_exempt then
      v_tax_rate := 0;
    end if;
  end if;

  insert into public.sales (user_id, customer_id, staff_id, payment_method, discount_amount, tax_rate, shift_id)
  values (v_uid, p_customer_id, p_staff_id, coalesce(p_payment_method, 'efectivo'), v_discount, v_tax_rate, v_shift_id)
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

      v_subtotal := v_subtotal + (v_service.price * v_qty);
    else
      select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and user_id = v_uid;
      if not found then
        raise exception 'Producto no encontrado: %', v_item->>'product_id';
      end if;

      insert into public.sale_items
        (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total, staff_id)
      values
        (v_uid, v_sale_id, v_product.id, null, v_product.name, v_product.sku,
         v_product.price, v_qty, v_product.price * v_qty, v_item_staff_id);

      v_subtotal := v_subtotal + (v_product.price * v_qty);

      update public.products
        set stock_level = stock_level - v_qty, updated_at = now()
      where id = v_product.id and user_id = v_uid;
    end if;
  end loop;

  v_taxable    := greatest(v_subtotal - v_discount, 0);
  v_tax_amount := round(v_taxable * v_tax_rate, 2);
  v_total      := v_taxable + v_tax_amount;

  perform public.assert_monthly_sales_limit(v_uid, v_total);

  update public.sales
    set subtotal = v_subtotal, tax_amount = v_tax_amount, total = v_total
  where id = v_sale_id and user_id = v_uid;

  return v_sale_id;
end;
$$;
