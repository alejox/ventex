-- Motivo de anulación: la pantalla de Ventas lo exige desde la revisión de UX,
-- pero `void_sale(uuid)` no tenía dónde guardarlo. Se agrega `p_reason` con
-- default para que un llamador viejo (solo p_sale_id) siga funcionando; el
-- cuerpo es el mismo de antes salvo el UPDATE, que ahora estampa motivo,
-- fecha y quién anuló.
alter table public.sales
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

drop function if exists public.void_sale(uuid);

CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id uuid, p_reason text default null)
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
  return_units numeric(12,3);
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

  -- El motivo es opcional en la base (la pantalla lo exige): así un llamador
  -- viejo con solo p_sale_id sigue funcionando.
  update public.sales
  set status = 'void',
      void_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
      voided_at = now(),
      voided_by = caller
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
      and coalesce(prod.tracks_stock, true)
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
      product_id, quantity, type, reference_type, reference_id, created_by, user_id, notes
    )
    values (
      item_row.product_id, return_units, 'in', 'sale_void', p_sale_id, caller, workspace,
      'Anulación de venta #' || sale_row.sale_number::text
    );
  end loop;

  if cash_refund > 0 then
    insert into public.cash_movements (
      amount, reason, shift_id, user_id, worker_id, membership_id
    )
    values (
      cash_refund,
      'Devolución - Venta #' || sale_row.sale_number::text || ' anulada',
      active_shift_id, workspace, caller, membership_id
    );
  end if;
end;
$function$;

revoke all on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated, service_role;
