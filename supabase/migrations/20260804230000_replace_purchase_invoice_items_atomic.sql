-- Reemplazo ATÓMICO de las líneas de una compra.
--
-- `updatePurchaseInvoice` hacía DELETE y después INSERT desde el cliente, en dos
-- viajes separados. Si el INSERT fallaba —una columna que todavía no existía, la
-- red, lo que sea— el DELETE ya se había aplicado: la factura quedaba con sus
-- totales intactos y SIN productos. Pasó de verdad con la compra #7
-- ($833.952, 3 líneas, 0 filas en invoice_items).
--
-- Adentro de una función es una sola transacción: o quedan las líneas nuevas o
-- quedan las viejas. Nunca ninguna.
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

  -- La función es SECURITY DEFINER, así que salta RLS: la pertenencia al
  -- inquilino hay que exigirla acá a mano o cualquiera edita cualquier factura.
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
    quantity, package_quantity, unit_price, line_total,
    unit_kind, units_per_package
  )
  select
    v_tenant,
    p_invoice_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'description',
    (item->>'quantity')::numeric,
    coalesce((item->>'package_quantity')::numeric, 0),
    (item->>'unit_price')::numeric,
    (item->>'line_total')::numeric,
    coalesce(item->>'unit_kind', 'unit'),
    coalesce((item->>'units_per_package')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;
end;
$function$;

revoke execute on function public.replace_purchase_invoice_items(uuid, jsonb) from public, anon;
grant   execute on function public.replace_purchase_invoice_items(uuid, jsonb) to authenticated;
