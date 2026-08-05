-- Precio de caja y precio de unidad INDEPENDIENTES.
--
-- Antes había un solo `unit_price` y el costo de la caja se derivaba
-- multiplicando. Es falso en la práctica: el proveedor cobra $12.000 la caja y
-- $1.100 la unidad suelta, porque suelto sale más caro. Son dos números que el
-- usuario tiene que poder tipear libremente.
--
-- Con eso, `unit_kind` deja de tener sentido —existía solo para decir a cuál de
-- los dos se refería el único precio— y se elimina. Las 6 filas existentes eran
-- todas 'unit' sin cajas, así que no hay nada que convertir.
alter table public.invoice_items
  add column if not exists package_price numeric not null default 0;

alter table public.invoice_items
  drop constraint if exists invoice_items_package_price_check;
alter table public.invoice_items
  add constraint invoice_items_package_price_check
  check (package_price >= 0);

comment on column public.invoice_items.package_price is
  'Costo de UNA caja. Independiente de unit_price: line_total = package_quantity * package_price + sueltas * unit_price.';
comment on column public.invoice_items.unit_price is
  'Costo de UNA unidad suelta. Independiente de package_price.';

-- La RPC nombraba unit_kind: hay que rehacerla antes de soltar la columna.
create or replace function public.replace_purchase_invoice_items(
  p_invoice_id uuid,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant uuid := public.get_effective_user_id();
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoices
     where id = p_invoice_id
       and user_id = v_tenant
       and type = 'compra'
  ) then
    raise exception 'Factura de compra no encontrada';
  end if;

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
end;
$function$;

alter table public.invoice_items drop column if exists unit_kind;

revoke execute on function public.replace_purchase_invoice_items(uuid, jsonb) from public, anon;
grant   execute on function public.replace_purchase_invoice_items(uuid, jsonb) to authenticated;
