-- void_sale: a qué caja va la devolución en efectivo, kind 'devolucion', y
-- no anular un fiado que el cliente ya pagó.
--
-- Construida sobre la definición VIVA de void_sale (pg_get_functiondef al
-- 2026-10-07). [#19] El .sql del repo (20261006221012_sales_void_reason.sql)
-- NO reproducía la viva (membership_id ambiguo y sin la excepción del dueño):
-- esta migración trae la función COMPLETA, así que reconstruir desde
-- supabase/migrations da la misma void_sale que producción.
--
-- [#7] Antes: la devolución salía SIEMPRE del turno abierto de quien anula, y
-- el dueño —que en la UI no abre turno— no podía anular una venta en efectivo
-- hecha en el turno de un trabajador. Ahora el efectivo vuelve:
--   1. al turno de la PROPIA venta, si sigue abierto (es el cajón donde entró);
--   2. si no, al turno abierto de quien anula;
--   3. si no hay ninguno y quien anula es dueño/administrador
--      (is_tenant_owner), se anula SIN movimiento de caja y se avisa con
--      `cash_refund_unrecorded = true`.
-- Un trabajador sigue necesitando SU turno abierto para devolver efectivo.
--
-- La función pasa de `returns void` a `returns jsonb`
--   {cash_refund, cash_refund_shift_id, cash_refund_unrecorded}.
-- Los argumentos no cambian, así que PostgREST la sigue encontrando con la
-- misma llamada (sin PGRST202); un cliente viejo simplemente ignora el cuerpo.
-- Cambiar el tipo de retorno exige DROP + CREATE (y volver a dar los grants).
--
-- [6] El movimiento de devolución se inserta con kind = 'devolucion' (antes
-- caía al default 'traslado'). close_shift/current_shift restan todos los
-- movimientos del turno sin mirar el kind: el arqueo no cambia.
--
-- [#15] credit_release_voided_sale hacía greatest(saldo − fiado, 0): anular un
-- fiado ya abonado se tragaba la plata del cliente. Ahora, si lo fiado supera
-- el saldo actual, la anulación se BLOQUEA (CREDITO_YA_ABONADO) para que la
-- devolución se resuelva primero. Nada de saldos negativos.

-- ---------------------------------------------------------------- kind
alter table public.cash_movements drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements add constraint cash_movements_kind_check
  check (kind = any (array['gasto'::text, 'traslado'::text, 'comision'::text, 'devolucion'::text]));

-- Devoluciones anteriores, que quedaron como 'traslado' por el default.
update public.cash_movements
set kind = 'devolucion'
where kind = 'traslado'
  and reason like 'Devolución - Venta #% anulada';

-- ------------------------------------------------------- crédito al anular
create or replace function public.credit_release_voided_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  credit_amount numeric := 0;
  v_balance numeric;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.payment_method = 'credito' then
    credit_amount := coalesce(new.total, 0);
  elsif new.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into credit_amount
    from public.sale_payments payment
    where payment.sale_id = new.id
      and payment.user_id = new.user_id
      and payment.payment_method = 'credito';
  end if;

  if credit_amount <= 0 then
    return new;
  end if;

  select coalesce(customer.credit_balance, 0)
  into v_balance
  from public.customers customer
  where customer.id = new.customer_id
    and customer.user_id = new.user_id
  for update;

  if not found then
    -- Sin cliente no hay deuda que liberar (no debería pasar: customer_id es FK).
    return new;
  end if;

  -- El cliente ya abonó parte o todo lo fiado: bajar el saldo a cero se
  -- tragaba esos abonos. Primero hay que resolver la devolución.
  if credit_amount > v_balance + 0.005 then
    raise exception 'CREDITO_YA_ABONADO: la venta fió $% pero el cliente solo debe $%', credit_amount, v_balance;
  end if;

  update public.customers customer
  set credit_balance = coalesce(customer.credit_balance, 0) - credit_amount
  where customer.id = new.customer_id
    and customer.user_id = new.user_id;

  return new;
end;
$function$;

-- ----------------------------------------------------------- void_sale
drop function if exists public.void_sale(uuid, text);

create function public.void_sale(p_sale_id uuid, p_reason text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  v_member_kind text;
  v_is_owner boolean := false;
  v_active_shift_id uuid;
  v_target_shift_id uuid;
  v_target_membership_id uuid;
  v_unrecorded boolean := false;
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

  v_is_owner := public.is_tenant_owner();

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
    v_cash_refund := coalesce(v_sale_row.total, 0);
  elsif v_sale_row.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into v_cash_refund
    from public.sale_payments payment
    where payment.sale_id = v_sale_row.id
      and payment.user_id = v_workspace
      and payment.payment_method = 'efectivo';
  end if;

  if v_cash_refund > 0 then
    -- Turno abierto de quien anula.
    select shift_row.id into v_active_shift_id
    from public.shifts shift_row
    where shift_row.user_id = v_workspace
      and shift_row.membership_id = v_membership_id
      and shift_row.worker_id = v_caller
      and shift_row.status = 'open';

    if v_active_shift_id is null and not v_is_owner then
      raise exception 'Debes abrir turno antes de devolver efectivo';
    end if;

    -- 1. El turno de la propia venta, si sigue abierto.
    if v_sale_row.shift_id is not null then
      select shift_row.id, shift_row.membership_id
      into v_target_shift_id, v_target_membership_id
      from public.shifts shift_row
      where shift_row.id = v_sale_row.shift_id
        and shift_row.user_id = v_workspace
        and shift_row.status = 'open'
      for update;
    end if;

    -- 2. Si no, el de quien anula.
    if v_target_shift_id is null and v_active_shift_id is not null then
      select shift_row.id, shift_row.membership_id
      into v_target_shift_id, v_target_membership_id
      from public.shifts shift_row
      where shift_row.id = v_active_shift_id
        and shift_row.user_id = v_workspace
        and shift_row.status = 'open'
      for update;
    end if;

    -- 3. Ninguno: solo llega acá el dueño/administrador (el trabajador sin
    --    turno ya fue rechazado arriba). Se anula y se avisa.
    if v_target_shift_id is null then
      if not v_is_owner then
        raise exception 'Debes abrir turno antes de devolver efectivo';
      end if;
      v_unrecorded := true;
    end if;
  end if;

  -- El motivo es opcional en la base (la pantalla lo exige): así un llamador
  -- viejo con solo p_sale_id sigue funcionando.
  update public.sales sale
  set status = 'void',
      void_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
      voided_at = now(),
      voided_by = v_caller
  where sale.id = p_sale_id
    and sale.user_id = v_workspace;

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

    update public.products prod
    set stock_level = prod.stock_level + v_return_units
    where prod.id = v_item_row.product_id
      and prod.user_id = v_workspace;

    insert into public.inventory_movements (
      product_id, quantity, type, reference_type, reference_id, created_by, user_id, notes
    )
    values (
      v_item_row.product_id, v_return_units, 'in', 'sale_void', p_sale_id, v_caller, v_workspace,
      'Anulación de venta #' || v_sale_row.sale_number::text
    );
  end loop;

  if v_cash_refund > 0 and v_target_shift_id is not null then
    insert into public.cash_movements (
      amount, reason, kind, shift_id, user_id, worker_id, membership_id
    )
    values (
      v_cash_refund,
      'Devolución - Venta #' || v_sale_row.sale_number::text || ' anulada',
      'devolucion',
      v_target_shift_id, v_workspace, v_caller, v_target_membership_id
    );
  end if;

  return jsonb_build_object(
    'cash_refund', v_cash_refund,
    'cash_refund_shift_id', v_target_shift_id,
    'cash_refund_unrecorded', v_unrecorded
  );
end;
$function$;

revoke all on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated, service_role;
