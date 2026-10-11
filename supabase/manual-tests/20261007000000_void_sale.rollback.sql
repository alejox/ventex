-- VALIDADA VÍA MCP el 06/10/2026: ROLLBACK_OK void_sale QA #402.
-- No persiste cambios. Las ventas QA #401/#402 se anularon después de validar;
-- para repetirla se requiere restaurar una fixture de prueba en un entorno QA.
-- Usa exclusivamente la venta QA #402 ya existente; prueba la corrección
-- dentro de una subtransacción que SIEMPRE aborta, incluso si el cliente está
-- en autocommit. Éxito esperado: excepción ROLLBACK_OK void_sale QA #402.
-- No crea ventas ni consume consecutivos.
do $test$
declare
  v_sale public.sales%rowtype;
  v_membership uuid;
  v_session text := 'qa-void-' || gen_random_uuid()::text;
  v_cash_before integer;
begin
  select * into v_sale from public.sales where sale_number = 402;
  if not found or v_sale.status <> 'completed' or v_sale.total <> 30000 or v_sale.shift_id is not null then
    raise exception 'FIXTURE_NO_DISPONIBLE: se requiere venta QA #402 completada, 30000 y sin turno';
  end if;
  if not exists (select 1 from public.sale_items i join public.services s on s.id = i.service_id
    where i.sale_id = v_sale.id and s.name = 'QA CORTE BARBERIA 0610') then
    raise exception 'FIXTURE_NO_DISPONIBLE: la venta no corresponde al servicio QA';
  end if;
  select id into v_membership from public.workspace_memberships
    where workspace_id = v_sale.user_id and auth_user_id = v_sale.user_id and member_kind = 'owner' and status = 'active';
  if v_membership is null then raise exception 'FIXTURE_NO_DISPONIBLE: dueño activo'; end if;
  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
    values (v_session, v_sale.user_id, v_sale.user_id, v_membership);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sale.user_id, 'role', 'authenticated', 'session_id', v_session)::text, true);
  select count(*) into v_cash_before from public.cash_movements where user_id = v_sale.user_id;
  execute $migration$
-- Aplicada vía MCP: 20261007024306_fix_void_sale_variable_ambiguity.sql.
-- Corrige la ambigüedad de membership_id y member_kind sin cambiar la firma.
-- El dueño vende sin turno: puede revertir ventas fuera de turno sin inventar
-- movimientos en la caja de un empleado. Las ventas vinculadas a un turno
-- mantienen la exigencia de una caja abierta para devolver efectivo.
-- Sin cambios de esquema ni de create_sale.

CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id uuid, p_reason text default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  v_member_kind text;
  v_active_shift_id uuid;
  v_cash_refund numeric := 0;
  v_sale_row record;
  v_item_row record;
  v_return_units numeric(12,3);
begin
  if v_caller is null or v_workspace is null or v_membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  select m.member_kind into v_member_kind
  from public.workspace_memberships m
  where m.id = v_membership_id
    and m.workspace_id = v_workspace
    and m.auth_user_id = v_caller
    and m.status = 'active';

  if not found or (
    v_member_kind = 'member'
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
  into v_sale_row
  from public.sales sale
  where sale.id = p_sale_id
    and sale.user_id = v_workspace
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_sale_row.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas';
  end if;

  if v_sale_row.payment_method = 'efectivo' then
    v_cash_refund := v_sale_row.total;
  elsif v_sale_row.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into v_cash_refund
    from public.sale_payments payment
    where payment.sale_id = v_sale_row.id
      and payment.user_id = v_workspace
      and payment.payment_method = 'efectivo';
  end if;

  if v_cash_refund > 0 then
    select shift_row.id into v_active_shift_id
    from public.shifts shift_row
    where shift_row.user_id = v_workspace
      and shift_row.membership_id = v_membership_id
      and shift_row.worker_id = v_caller
      and shift_row.status = 'open';
    if v_active_shift_id is null and not (v_member_kind = 'owner' and v_sale_row.shift_id is null) then
      raise exception 'Debes abrir turno antes de devolver efectivo';
    end if;
  end if;

  -- El motivo es opcional en la base (la pantalla lo exige): así un llamador
  -- viejo con solo p_sale_id sigue funcionando.
  update public.sales
  set status = 'void',
      void_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
      voided_at = now(),
      voided_by = v_caller
  where id = p_sale_id
    and user_id = v_workspace;

  for v_item_row in
    select
      item.product_id,
      item.quantity,
      item.unit_kind,
      item.units_per_item
    from public.sale_items item
    join public.products prod
      on prod.id = item.product_id
     and prod.user_id = v_workspace
    where item.sale_id = p_sale_id
      and item.user_id = v_workspace
      and item.product_id is not null
      -- Un servicio nunca descontó stock: no hay nada que devolverle.
      and prod.unit <> 'Servicio'
      and coalesce(prod.tracks_stock, true)
  loop
    v_return_units := case
      when v_item_row.unit_kind = 'package'
        then v_item_row.quantity * v_item_row.units_per_item
      else v_item_row.quantity
    end;

    update public.products
    set stock_level = stock_level + v_return_units
    where id = v_item_row.product_id
      and user_id = v_workspace;

    insert into public.inventory_movements (
      product_id, quantity, type, reference_type, reference_id, created_by, user_id, notes
    )
    values (
      v_item_row.product_id, v_return_units, 'in', 'sale_void', p_sale_id, v_caller, v_workspace,
      'Anulación de venta #' || v_sale_row.sale_number::text
    );
  end loop;

  if v_cash_refund > 0 and v_active_shift_id is not null then
    insert into public.cash_movements (
      amount, reason, shift_id, user_id, worker_id, membership_id
    )
    values (
      v_cash_refund,
      'Devolución - Venta #' || v_sale_row.sale_number::text || ' anulada',
      v_active_shift_id, v_workspace, v_caller, v_membership_id
    );
  end if;
end;
$function$;

revoke all on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated, service_role;

$migration$;
  perform set_config('role', 'authenticated', true);
  perform public.void_sale(v_sale.id, 'QA rollback: ambigüedad y dueño sin turno');
  if not exists (select 1 from public.sales where id = v_sale.id and status = 'void'
    and void_reason = 'QA rollback: ambigüedad y dueño sin turno' and voided_by = v_sale.user_id and voided_at is not null) then
    raise exception 'QA_FAILED: anulación o auditoría incorrectas';
  end if;
  if (select count(*) from public.cash_movements where user_id = v_sale.user_id) <> v_cash_before then
    raise exception 'QA_FAILED: se inventó un movimiento en caja sin turno';
  end if;
  raise exception 'ROLLBACK_OK void_sale QA #402';
end;
$test$;
