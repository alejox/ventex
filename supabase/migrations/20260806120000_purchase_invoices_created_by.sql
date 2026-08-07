-- Quién cargó la factura de compra, no solo a qué negocio pertenece.
--
-- `invoices.user_id` es el tenant (get_effective_user_id()), no la persona: con
-- un empleado cargando la compra esa columna no dice quién fue. Compras no paga
-- comisión como Ventas, así que no le sirve el patrón de `sales.staff_id` (un
-- registro de staff); le alcanza con el mismo patrón que ya tiene
-- `inventory_movements.created_by`: el actor autenticado (auth.uid()), no un
-- registro de negocio.
--
-- Apunta a `profiles` y no a `auth.users` por lo mismo que allá: PostgREST
-- puede resolver el nombre con un embed. Nullable a propósito: las compras
-- históricas no tienen actor conocido y rellenarlas con el dueño inventaría
-- evidencia. El default captura al actor en el insert de cabecera que hace
-- `createPurchaseInvoice` desde el navegador, sin tocar el servicio.
alter table public.invoices
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();

create index if not exists invoices_created_by_idx
  on public.invoices (created_by);

-- Las dos RPCs que mueven stock por una compra insertan en
-- `inventory_movements`, pero hasta acá dejaban `created_by` en NULL pese a que
-- la columna existe desde 20260724133535_inventory_movements_created_by.sql
-- (agregada ahí para exactamente esto). El mismo v_actor que ahora sella
-- `invoices.created_by` sella también el movimiento.
create or replace function public.replace_purchase_invoice_items(p_invoice_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant         uuid := public.get_effective_user_id();
  v_actor          uuid := (select auth.uid());
  v_invoice_number bigint;
  v_status         text;
  v_old            jsonb;
  v_new            jsonb;
  v_nota           text;
  v_row            record;
  v_delta          integer;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  select i.invoice_number, i.status
    into v_invoice_number, v_status
    from public.invoices i
   where i.id = p_invoice_id
     and i.user_id = v_tenant
     and i.type = 'compra'
     for update;

  if not found then
    raise exception 'Factura de compra no encontrada';
  end if;

  if v_status = 'cancelled' then
    raise exception 'La compra está anulada y no se puede editar' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_old
    from (
      select ii.product_id, sum(ii.quantity) as qty
        from public.invoice_items ii
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) antes;

  v_nota := case when v_old = '{}'::jsonb then 'Compra #' else 'Edición de compra #' end
         || v_invoice_number;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  insert into public.invoice_items (
    user_id, invoice_id, product_id, description,
    quantity, package_quantity, unit_price, package_price, line_total,
    units_per_package
  )
  select
    v_tenant,
    p_invoice_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'description',
    (item->>'quantity')::numeric,
    coalesce((item->>'package_quantity')::numeric, 0),
    coalesce((item->>'unit_price')::numeric, 0),
    coalesce((item->>'package_price')::numeric, 0),
    (item->>'line_total')::numeric,
    coalesce((item->>'units_per_package')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;

  select coalesce(jsonb_object_agg(product_id::text, qty), '{}'::jsonb)
    into v_new
    from (
      select ii.product_id, sum(ii.quantity) as qty
        from public.invoice_items ii
       where ii.invoice_id = p_invoice_id
         and ii.product_id is not null
       group by ii.product_id
    ) despues;

  for v_row in
    select clave::uuid as product_id,
           coalesce((v_new ->> clave)::numeric, 0) - coalesce((v_old ->> clave)::numeric, 0) as diff
      from jsonb_object_keys(v_old || v_new) as clave
  loop
    v_delta := round(v_row.diff)::integer;
    continue when v_delta = 0;

    update public.products
       set stock_level = stock_level + v_delta
     where id = v_row.product_id
       and user_id = v_tenant;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant,
      v_actor,
      v_row.product_id,
      case when v_delta > 0 then 'in' else 'out' end,
      abs(v_delta),
      'purchase',
      p_invoice_id,
      v_nota
    );
  end loop;
end;
$function$;

create or replace function public.cancel_purchase_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant         uuid := public.get_effective_user_id();
  v_actor          uuid := (select auth.uid());
  v_invoice_number bigint;
  v_status         text;
  v_row            record;
  v_qty            integer;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  select i.invoice_number, i.status
    into v_invoice_number, v_status
    from public.invoices i
   where i.id = p_invoice_id
     and i.user_id = v_tenant
     and i.type = 'compra'
     for update;

  if not found then
    raise exception 'Factura de compra no encontrada';
  end if;

  if v_status = 'cancelled' then
    raise exception 'La compra ya está anulada' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  update public.invoices set status = 'cancelled' where id = p_invoice_id;

  for v_row in
    select ii.product_id, sum(ii.quantity) as qty
      from public.invoice_items ii
     where ii.invoice_id = p_invoice_id
       and ii.product_id is not null
     group by ii.product_id
  loop
    v_qty := round(v_row.qty)::integer;
    continue when v_qty = 0;

    update public.products
       set stock_level = stock_level - v_qty
     where id = v_row.product_id
       and user_id = v_tenant;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_actor, v_row.product_id, 'out', v_qty, 'cancellation', p_invoice_id,
      'Anulación de compra #' || v_invoice_number
    );
  end loop;
end;
$function$;

-- Mismo cierre defensivo que ya llevaba cancel_purchase_invoice: PUBLIC/anon
-- afuera, authenticated adentro, repetido después de cada `create or replace`.
revoke execute on function public.replace_purchase_invoice_items(uuid, jsonb) from public;
revoke execute on function public.replace_purchase_invoice_items(uuid, jsonb) from anon;
grant  execute on function public.replace_purchase_invoice_items(uuid, jsonb) to authenticated;

revoke execute on function public.cancel_purchase_invoice(uuid) from public;
revoke execute on function public.cancel_purchase_invoice(uuid) from anon;
grant  execute on function public.cancel_purchase_invoice(uuid) to authenticated;
