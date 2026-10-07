-- Abonos de fiado en el arqueo de caja.
--
-- Un abono en efectivo entraba al cajón pero ningún turno lo contaba: el cierre
-- daba FALTANTE... o, peor, el cajero se lo guardaba y cuadraba igual. Ahora:
--
-- * customer_payments.payment_method: efectivo | tarjeta | transferencia. Es el
--   set de sale_payments SIN 'credito' (pagar un fiado con fiado no es un pago).
--   Las filas viejas quedan en 'efectivo': el único medio que la UI de abonos
--   ofrecía era "registrar abono", que en la práctica se cobraba en mostrador.
--   Ninguna de esas filas tiene shift_id, así que NINGÚN arqueo cambia.
-- * customer_payments.shift_id: el turno al que entró el efectivo. Solo se
--   sella en abonos en efectivo y solo con un turno ABIERTO; los turnos
--   cerrados guardan su snapshot (expected_cash, withdrawals_total, ...) y no
--   se recalculan nunca.
-- * customer_payments.client_payment_id: idempotencia. Un reintento del mismo
--   abono (doble clic, red que se cae después de que la base respondió)
--   devuelve el saldo vigente sin descontar dos veces.
-- * register_customer_payment(customer, amount, notes, payment_method,
--   client_payment_id): parámetros nuevos AL FINAL y con default; la firma vieja
--   se dropea acá mismo (si conviviera, toda llamada de 3 args sería ambigua).
--   Efectivo: un TRABAJADOR necesita su turno abierto (ABONO_SIN_TURNO); el
--   DUEÑO sella su propio turno abierto si tiene, si no el ÚNICO turno abierto
--   del negocio, y si hay varios no adivina (NULL) — mismo criterio que
--   open_shift_for_commission.
-- * current_shift / close_shift: el esperado suma los abonos en efectivo del
--   turno y devuelve el desglose completo: cash_in (efectivo de ventas, con la
--   parte en efectivo de los pagos divididos), cash_abonos, movements_by_kind
--   (gasto / devolucion / comision / traslado). Esperado = base + cash_in +
--   cash_abonos − withdrawals_total. Los campos viejos se conservan.
-- * shifts.cash_sales / cash_abonos / movements_by_kind: parte del snapshot del
--   cierre. Nulos en los turnos cerrados antes de esta migración.
-- * customer_payments deja de aceptar INSERT/UPDATE/DELETE directos: el único
--   camino es el RPC, que baja el saldo en la misma transacción. Un INSERT
--   directo podía, además, sellar un abono en un turno ajeno.
BEGIN;

-- ---- Columnas ----------------------------------------------------------------
ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_payment_id uuid;

UPDATE public.customer_payments SET payment_method = 'efectivo' WHERE payment_method IS NULL;

ALTER TABLE public.customer_payments
  ALTER COLUMN payment_method SET DEFAULT 'efectivo',
  ALTER COLUMN payment_method SET NOT NULL;

ALTER TABLE public.customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_payment_method_check;
ALTER TABLE public.customer_payments
  ADD CONSTRAINT customer_payments_payment_method_check
  CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia'));

-- Un abono con turno siempre es efectivo: es lo que hace que el arqueo cuadre.
ALTER TABLE public.customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_shift_only_cash;
ALTER TABLE public.customer_payments
  ADD CONSTRAINT customer_payments_shift_only_cash
  CHECK (shift_id IS NULL OR payment_method = 'efectivo');

CREATE UNIQUE INDEX IF NOT EXISTS customer_payments_client_payment_id_key
  ON public.customer_payments (user_id, client_payment_id)
  WHERE client_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_payments_shift_idx
  ON public.customer_payments (shift_id)
  WHERE shift_id IS NOT NULL;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS cash_sales numeric,
  ADD COLUMN IF NOT EXISTS cash_abonos numeric,
  ADD COLUMN IF NOT EXISTS movements_by_kind jsonb;

-- ---- Escritura solo por RPC ---------------------------------------------------
DROP POLICY IF EXISTS workspace_customer_payments_insert ON public.customer_payments;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.customer_payments FROM PUBLIC, anon, authenticated;

-- ---- register_customer_payment -------------------------------------------------
DROP FUNCTION IF EXISTS public.register_customer_payment(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.register_customer_payment(uuid, numeric);

CREATE FUNCTION public.register_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL::text,
  p_payment_method text DEFAULT 'efectivo'::text,
  p_client_payment_id uuid DEFAULT NULL::uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  v_membership_id uuid := public.get_active_membership_id();
  method text := lower(btrim(coalesce(p_payment_method, 'efectivo')));
  current_balance numeric;
  new_balance numeric;
  existing public.customer_payments;
  v_shift_id uuid;
  open_count integer;
begin
  if caller is null or workspace is null or v_membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('customers') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor que cero';
  end if;
  if method not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'METODO_DE_PAGO_INVALIDO: %', method using errcode = '22023';
  end if;

  -- El candado sobre el cliente serializa también los reintentos: el segundo
  -- espera acá y, cuando entra, ya ve la fila del primero.
  select customer.credit_balance into current_balance
  from public.customers customer
  where customer.id = p_customer_id
    and customer.user_id = workspace
  for update;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  if p_client_payment_id is not null then
    select * into existing
    from public.customer_payments payment
    where payment.user_id = workspace
      and payment.client_payment_id = p_client_payment_id;
    if found then
      if existing.customer_id <> p_customer_id or existing.amount <> p_amount then
        raise exception 'ABONO_ID_REPETIDO: ese identificador ya se usó para otro abono'
          using errcode = '23505';
      end if;
      return coalesce(current_balance, 0);
    end if;
  end if;

  if p_amount > coalesce(current_balance, 0) then
    raise exception 'ABONO_EXCEDE_DEUDA: el abono ($%) supera la deuda ($%)',
      p_amount, coalesce(current_balance, 0);
  end if;

  if method = 'efectivo' then
    -- Turno propio (el de esta membresía), sea trabajador o dueño.
    select shift_row.id into v_shift_id
    from public.shifts shift_row
    where shift_row.user_id = workspace
      and shift_row.membership_id = v_membership_id
      and shift_row.status = 'open';

    if v_shift_id is null then
      if not public.is_tenant_owner() then
        raise exception 'ABONO_SIN_TURNO: abre tu turno de caja para recibir abonos en efectivo'
          using errcode = 'P0001';
      end if;
      select count(*), min(shift_row.id::text)::uuid
        into open_count, v_shift_id
      from public.shifts shift_row
      where shift_row.user_id = workspace
        and shift_row.status = 'open';
      if open_count <> 1 then
        v_shift_id := null;
      end if;
    end if;
  end if;

  insert into public.customer_payments (
    customer_id, amount, notes, user_id, payment_method, shift_id, client_payment_id
  )
  values (
    p_customer_id, p_amount, nullif(btrim(coalesce(p_notes, '')), ''), workspace,
    method, v_shift_id, p_client_payment_id
  );

  update public.customers customer
  set credit_balance = coalesce(customer.credit_balance, 0) - p_amount
  where customer.id = p_customer_id
    and customer.user_id = workspace
  returning customer.credit_balance into new_balance;

  return new_balance;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_customer_payment(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_customer_payment(uuid, numeric, text, text, uuid) TO authenticated;

-- ---- current_shift -------------------------------------------------------------
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
    'expected_cash', active_shift.opening_cash + cash_total + abono_total - withdrawal_total,
    'totals_by_method', totals
  );
end;
$function$;

-- ---- close_shift ---------------------------------------------------------------
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

  expected := active_shift.opening_cash + cash_total + abono_total - withdrawal_total;
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

-- ---- Verificación --------------------------------------------------------------
DO $check$
BEGIN
  IF has_table_privilege('authenticated', 'public.customer_payments', 'INSERT')
     OR has_table_privilege('anon', 'public.customer_payments', 'INSERT') THEN
    RAISE EXCEPTION 'customer_payments sigue aceptando INSERT directo';
  END IF;
  IF has_function_privilege('anon', 'public.register_customer_payment(uuid,numeric,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.register_customer_payment(uuid,numeric,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'register_customer_payment: privilegios de ejecución incorrectos';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_payments WHERE payment_method IS NULL OR shift_id IS NOT NULL) THEN
    RAISE EXCEPTION 'backfill de customer_payments inesperado';
  END IF;
END;
$check$;

COMMIT;
