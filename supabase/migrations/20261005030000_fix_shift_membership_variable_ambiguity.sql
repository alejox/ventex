-- Disambiguate the active membership variable from SQL columns in shift RPCs.
CREATE OR REPLACE FUNCTION public.register_cash_withdrawal(p_amount numeric, p_reason text, p_kind text DEFAULT 'traslado'::text, p_category uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  movement_id uuid;
  kind text := coalesce(nullif(trim(p_kind), ''), 'traslado');
  category_id uuid;
  local_day date;
begin
  if workspace is null or v_membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El retiro debe ser mayor a cero';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del retiro es obligatorio';
  end if;
  if kind not in ('gasto', 'traslado') then
    raise exception 'Destino de retiro invalido: %', kind;
  end if;

  select * into active_shift
  from public.shifts shift_row
  where shift_row.user_id = workspace
    and shift_row.membership_id = v_membership_id
    and shift_row.status = 'open'
  for update;

  if not found then
    raise exception 'No tienes un turno abierto';
  end if;

  insert into public.cash_movements (
    amount, reason, kind, shift_id, user_id, worker_id, membership_id
  )
  values (
    p_amount, trim(p_reason), kind, active_shift.id, workspace, auth.uid(), v_membership_id
  )
  returning id into movement_id;

  if kind = 'gasto' then
    select c.id into category_id
    from public.expense_categories c
    where c.id = p_category and c.user_id = workspace and c.is_active;

    if category_id is null then
      select c.id into category_id
      from public.expense_categories c
      where c.user_id = workspace and c.is_default
      limit 1;
    end if;

    select (now() at time zone coalesce(
             (select s.timezone from public.business_sites s where s.user_id = workspace limit 1),
             'America/Bogota'
           ))::date
      into local_day;

    insert into public.expenses (
      user_id, description, amount, expense_date, category_id, cash_movement_id
    )
    values (
      workspace, trim(p_reason), p_amount, local_day, category_id, movement_id
    );
  end if;

  insert into public.notifications (
    user_id, type, title, body, severity, data
  )
  values (
    workspace,
    'cash_withdrawal',
    'Retiro de caja',
    format('Se retiraron %s de la caja: %s', p_amount, trim(p_reason)),
    'info',
    jsonb_build_object(
      'shift_id', active_shift.id,
      'membership_id', v_membership_id,
      'cash_movement_id', movement_id,
      'amount', p_amount,
      'kind', kind
    )
  );

  return movement_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_shift(p_closing_cash numeric, p_notes text DEFAULT NULL::text, p_shift_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  sale_count integer;
  sale_total numeric;
  cash_total numeric;
  withdrawal_total numeric;
  totals jsonb;
  expected numeric;
  cash_difference numeric;
  closed_time timestamptz := now();
begin
  if workspace is null or v_membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'El efectivo contado no puede ser negativo';
  end if;

  if p_shift_id is not null then
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

  select coalesce(sum(movement.amount), 0)
  into withdrawal_total
  from public.cash_movements movement
  where movement.shift_id = active_shift.id
    and movement.membership_id = active_shift.membership_id;

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

  expected := active_shift.opening_cash + cash_total - withdrawal_total;
  cash_difference := p_closing_cash - expected;

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
    'withdrawals_total', withdrawal_total,
    'totals_by_method', totals
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.current_shift()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  sale_count integer;
  sale_total numeric;
  cash_total numeric;
  withdrawal_total numeric;
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

  select coalesce(sum(movement.amount), 0)
  into withdrawal_total
  from public.cash_movements movement
  where movement.shift_id = active_shift.id
    and movement.membership_id = v_membership_id;

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
    'withdrawals_total', withdrawal_total,
    'expected_cash', active_shift.opening_cash + cash_total - withdrawal_total,
    'totals_by_method', totals
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_shift(p_opening_cash numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  opened_shift public.shifts;
begin
  if caller is null or workspace is null or v_membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'La base de caja no puede ser negativa';
  end if;
  if exists (
    select 1
    from public.shifts shift_row
    where shift_row.user_id = workspace
      and shift_row.membership_id = v_membership_id
      and shift_row.status = 'open'
  ) then
    raise exception 'Ya tienes un turno abierto';
  end if;

  insert into public.shifts (
    user_id,
    worker_id,
    membership_id,
    opening_cash
  )
  values (
    workspace,
    caller,
    v_membership_id,
    p_opening_cash
  )
  returning * into opened_shift;

  return json_build_object(
    'id', opened_shift.id,
    'workspace_id', opened_shift.user_id,
    'membership_id', opened_shift.membership_id,
    'opened_at', opened_shift.opened_at,
    'opening_cash', opened_shift.opening_cash
  );
end;
$function$;

