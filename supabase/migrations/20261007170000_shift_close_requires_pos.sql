-- Turnos: sin permiso de caja no se abre NI se cierra turno.
--
-- 20261007150000 había dejado que un trabajador cerrara SU turno aunque le
-- hubieran quitado `pos`. Decisión del negocio: quitar el permiso de caja es
-- quitar el acceso a la caja, también para cerrarla. Si el dueño lo quita con
-- un turno abierto, ese turno lo cierra el DUEÑO (close_shift con p_shift_id,
-- desde Personal → Historial de turnos); la pantalla de permisos lo avisa.
--
-- Se restaura el chequeo `worker_can('pos')` en close_shift y current_shift.
-- El resto de 20261007150000 (redondeo a centavos, visibilidad por membresía,
-- revocar TRUNCATE) queda igual.

create or replace function public.close_shift(p_closing_cash numeric, p_notes text default null::text, p_shift_id uuid default null::uuid)
 returns json
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  sale_count integer;
  sale_total numeric;
  cash_total numeric;
  abono_total numeric;
  withdrawal_total numeric;
  by_kind jsonb;
  totals jsonb;
  expected numeric;
  cash_difference numeric;
  closed_time timestamptz := now();
begin
  if workspace is null or v_membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'El efectivo contado no puede ser negativo';
  end if;
  -- Sin permiso de caja no se toca la caja, tampoco para cerrarla: si el
  -- dueño se lo quitó con un turno abierto, ese turno lo cierra el dueño
  -- (Personal → Historial de turnos, con p_shift_id).
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO: No tienes permiso de caja. Pídele al dueño que cierre tu turno.' using errcode = '42501';
  end if;
  -- La plata se cuenta en centavos: lo que la UI muestra es lo que se guarda.
  p_closing_cash := round(p_closing_cash, 2);

  if p_shift_id is not null then
    -- Cerrar el turno de otra persona es del dueño/admin.
    if not public.is_tenant_owner() then
      raise exception 'OWNER_REQUIRED' using errcode = '42501';
    end if;
    select * into active_shift
    from public.shifts shift_row
    where shift_row.id = p_shift_id
      and shift_row.user_id = workspace
      and shift_row.status = 'open'
    for update;
  else
    select * into active_shift
    from public.shifts shift_row
    where shift_row.user_id = workspace
      and shift_row.membership_id = v_membership_id
      and shift_row.status = 'open'
    for update;
  end if;

  if not found then
    raise exception 'Turno no encontrado o ya cerrado';
  end if;

  select
    count(*)::integer,
    coalesce(sum(sale_row.total), 0)
  into sale_count, sale_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = active_shift.membership_id
    and sale_row.status = 'completed';

  select coalesce(sum(
      case
        when sale_row.payment_method = 'efectivo' then sale_row.total
        when sale_row.payment_method = 'split' then coalesce((
          select sum(payment.amount)
          from public.sale_payments payment
          where payment.sale_id = sale_row.id
            and payment.user_id = workspace
            and payment.payment_method = 'efectivo'
        ), 0)
        else 0
      end
    ), 0)
  into cash_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = active_shift.membership_id
    and sale_row.status in ('completed', 'void');

  select coalesce(sum(payment.amount), 0)
  into abono_total
  from public.customer_payments payment
  where payment.shift_id = active_shift.id
    and payment.user_id = workspace
    and payment.payment_method = 'efectivo';

  select coalesce(sum(movement.amount), 0)
  into withdrawal_total
  from public.cash_movements movement
  where movement.shift_id = active_shift.id
    and movement.membership_id = active_shift.membership_id;

  select coalesce(jsonb_object_agg(kind, kind_total), '{}'::jsonb)
  into by_kind
  from (
    select movement.kind, sum(movement.amount) as kind_total
    from public.cash_movements movement
    where movement.shift_id = active_shift.id
      and movement.membership_id = active_shift.membership_id
    group by movement.kind
  ) grouped_movements;

  select coalesce(jsonb_object_agg(payment_method, method_total), '{}'::jsonb)
  into totals
  from (
    select sale_row.payment_method, sum(sale_row.total) as method_total
    from public.sales sale_row
    where sale_row.shift_id = active_shift.id
      and sale_row.user_id = workspace
      and sale_row.membership_id = active_shift.membership_id
      and sale_row.status = 'completed'
    group by sale_row.payment_method
  ) grouped_sales;

  expected := round(active_shift.opening_cash + cash_total + abono_total - withdrawal_total, 2);
  cash_difference := round(p_closing_cash - expected, 2);

  if cash_difference <> 0 and nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'JUSTIFICACION_REQUERIDA';
  end if;

  update public.shifts
  set status = 'closed',
      closed_at = closed_time,
      closing_cash = p_closing_cash,
      expected_cash = expected,
      difference = cash_difference,
      sales_total = sale_total,
      sales_count = sale_count,
      withdrawals_total = withdrawal_total,
      totals_by_method = totals,
      cash_sales = cash_total,
      cash_abonos = abono_total,
      movements_by_kind = by_kind,
      notes = coalesce(p_notes, notes)
  where id = active_shift.id;

  if cash_difference <> 0 then
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      severity,
      data
    )
    values (
      workspace,
      'shift_discrepancy',
      'Descuadre de caja',
      format('El turno cerró con una diferencia de %s', cash_difference),
      'warning',
      jsonb_build_object(
        'shift_id', active_shift.id,
        'membership_id', active_shift.membership_id,
        'difference', cash_difference
      )
    );
  end if;

  return json_build_object(
    'id', active_shift.id,
    'workspace_id', active_shift.user_id,
    'membership_id', active_shift.membership_id,
    'opened_at', active_shift.opened_at,
    'closed_at', closed_time,
    'opening_cash', active_shift.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', expected,
    'difference', cash_difference,
    'sales_total', sale_total,
    'sales_count', sale_count,
    'cash_total', cash_total,
    'cash_in', cash_total,
    'cash_abonos', abono_total,
    'withdrawals_total', withdrawal_total,
    'movements_by_kind', by_kind,
    'totals_by_method', totals
  );
end;
$function$;

create or replace function public.current_shift()
 returns json
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  sale_count integer;
  sale_total numeric;
  cash_total numeric;
  abono_total numeric;
  withdrawal_total numeric;
  by_kind jsonb;
  totals jsonb;
begin
  if workspace is null or v_membership_id is null then
    return null;
  end if;
  if not public.worker_can('pos') then
    return null;
  end if;

  select * into active_shift
  from public.shifts shift_row
  where shift_row.user_id = workspace
    and shift_row.membership_id = v_membership_id
    and shift_row.status = 'open';

  if not found then
    return null;
  end if;

  select
    count(*)::integer,
    coalesce(sum(sale_row.total), 0)
  into sale_count, sale_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = v_membership_id
    and sale_row.status = 'completed';

  -- A voided cash sale still put cash in the drawer before the refund.
  -- Include that inflow here; void_sale records the matching positive cash
  -- withdrawal, so expected cash nets to zero instead of counting either side
  -- twice. Split sales contribute only their efectivo payment rows.
  select coalesce(sum(
      case
        when sale_row.payment_method = 'efectivo' then sale_row.total
        when sale_row.payment_method = 'split' then coalesce((
          select sum(payment.amount)
          from public.sale_payments payment
          where payment.sale_id = sale_row.id
            and payment.user_id = workspace
            and payment.payment_method = 'efectivo'
        ), 0)
        else 0
      end
    ), 0)
  into cash_total
  from public.sales sale_row
  where sale_row.shift_id = active_shift.id
    and sale_row.user_id = workspace
    and sale_row.membership_id = v_membership_id
    and sale_row.status in ('completed', 'void');

  -- Abonos de fiado cobrados en efectivo en este turno.
  select coalesce(sum(payment.amount), 0)
  into abono_total
  from public.customer_payments payment
  where payment.shift_id = active_shift.id
    and payment.user_id = workspace
    and payment.payment_method = 'efectivo';

  select coalesce(sum(movement.amount), 0)
  into withdrawal_total
  from public.cash_movements movement
  where movement.shift_id = active_shift.id
    and movement.membership_id = v_membership_id;

  select coalesce(jsonb_object_agg(kind, kind_total), '{}'::jsonb)
  into by_kind
  from (
    select movement.kind, sum(movement.amount) as kind_total
    from public.cash_movements movement
    where movement.shift_id = active_shift.id
      and movement.membership_id = v_membership_id
    group by movement.kind
  ) grouped_movements;

  select coalesce(jsonb_object_agg(payment_method, method_total), '{}'::jsonb)
  into totals
  from (
    select sale_row.payment_method, sum(sale_row.total) as method_total
    from public.sales sale_row
    where sale_row.shift_id = active_shift.id
      and sale_row.user_id = workspace
      and sale_row.membership_id = v_membership_id
      and sale_row.status = 'completed'
    group by sale_row.payment_method
  ) grouped_sales;

  return json_build_object(
    'id', active_shift.id,
    'workspace_id', active_shift.user_id,
    'membership_id', active_shift.membership_id,
    'opened_at', active_shift.opened_at,
    'opening_cash', active_shift.opening_cash,
    'sales_count', sale_count,
    'sales_total', sale_total,
    'cash_total', cash_total,
    'cash_in', cash_total,
    'cash_abonos', abono_total,
    'withdrawals_total', withdrawal_total,
    'movements_by_kind', by_kind,
    -- Mismo redondeo que close_shift: el esperado en vivo y el del cierre
    -- tienen que ser el mismo número.
    'expected_cash', round(active_shift.opening_cash + cash_total + abono_total - withdrawal_total, 2),
    'totals_by_method', totals
  );
end;
$function$;
