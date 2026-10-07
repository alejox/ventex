-- Turnos de caja: cierre propio sin `pos`, redondeo a centavos y visibilidad
-- por membresía.
--
-- 1. `close_shift` exigía `difference <> 0` EXACTO para pedir justificación,
--    pero el cliente redondea a centavos: un contado de 10000.004 mandaba una
--    diferencia de 0.004 que la UI mostraba como $0 y el servidor rechazaba por
--    falta de nota. Ahora el contado, el esperado y la diferencia se redondean
--    a 2 decimales en el servidor antes de comparar y de guardar.
-- 2. Un trabajador al que le quitaron `pos` a mitad de turno no podía cerrar
--    SU turno abierto (`close_shift` exigía `worker_can('pos')`) y
--    `current_shift` le devolvía null: el turno quedaba colgado hasta que el
--    dueño lo cerrara. Ahora cualquiera ve y cierra SU PROPIO turno abierto
--    (por membresía), tenga o no `pos`. Cerrar el turno de OTRO (`p_shift_id`)
--    sigue siendo del dueño/admin (`is_tenant_owner()`). Abrir turno y retirar
--    plata siguen exigiendo `pos` (open_shift / register_cash_withdrawal no se
--    tocan).
-- 3. La lectura de `shifts` estaba abierta a todo el que tuviera `pos`: un
--    cajero veía el esperado y la diferencia de sus compañeros. Ahora el
--    dueño/admin ve todos los turnos del negocio y un trabajador solo los
--    suyos (misma regla que `cash_movements`).
-- 4. `authenticated` tenía TRUNCATE/TRIGGER/REFERENCES sobre `shifts` y
--    `cash_movements`. TRUNCATE no pasa por RLS: un usuario podía vaciar las
--    tablas de TODOS los negocios. Se revocan (de anon también, por las dudas).

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
    -- El propio turno se cierra SIEMPRE, aunque ya no tenga `pos`: quitarle
    -- el permiso no puede dejar un cajón sin arqueo.
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
  -- Sin chequeo de `pos`: el turno propio se ve siempre, para poder cerrarlo
  -- aunque el permiso se haya quitado a mitad de turno.

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

-- Lectura de turnos: el dueño/admin ve todos los del negocio; un trabajador,
-- solo los de su membresía (sin exigir `pos`, por el mismo motivo que arriba).
drop policy if exists workspace_shifts_read on public.shifts;
create policy workspace_shifts_read on public.shifts
  for select to authenticated
  using (
    (select public.get_effective_user_id()) is not null
    and user_id = (select public.get_effective_user_id())
    and (
      (select public.is_tenant_owner())
      or membership_id = (select public.get_active_membership_id())
    )
  );

-- TRUNCATE no pasa por RLS. TRIGGER y REFERENCES tampoco tienen uso desde la API.
revoke truncate, trigger, references on public.shifts from anon, authenticated;
revoke truncate, trigger, references on public.cash_movements from anon, authenticated;
