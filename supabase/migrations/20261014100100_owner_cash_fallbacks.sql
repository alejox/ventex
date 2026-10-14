-- El efectivo nunca cae en la caja de otra persona.
--
-- 1. register_customer_payment: hasta acá, un dueño/admin SIN turno propio que
--    recibía un abono en efectivo lo sellaba en "el único turno abierto" del
--    negocio, que casi siempre es el de un trabajador: le aparecía plata ajena
--    en su arqueo. Con `settings.owner_uses_shifts` encendido el dueño tiene su
--    propia caja (o eligió vender sin ella), así que ese respaldo se apaga: sin
--    turno propio el abono queda sin turno, igual que cuando hay 0 o 2+
--    abiertos. Con el ajuste apagado el comportamiento no cambia. El trabajador
--    sigue igual (ABONO_SIN_TURNO).
-- 2. open_shift_for_commission: primero la caja de quien PAGA (membresía
--    activa), después la de la persona a la que se le paga, después el único
--    turno abierto. Si el dueño tiene su caja abierta, la comisión que paga en
--    efectivo sale de ahí.
--
-- Ambas funciones se reescriben desde su definición VIVA (pg_get_functiondef,
-- 2026-10-14); solo cambia lo marcado con "CAMBIO". Firma, SECURITY DEFINER,
-- search_path y GRANT quedan iguales (CREATE OR REPLACE conserva los GRANT).

CREATE OR REPLACE FUNCTION public.register_customer_payment(p_customer_id uuid, p_amount numeric, p_notes text DEFAULT NULL::text, p_payment_method text DEFAULT 'efectivo'::text, p_client_payment_id uuid DEFAULT NULL::uuid)
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
  v_owner_uses_shifts boolean := false;
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
      -- CAMBIO: con caja de dueño/admin activada, sin turno propio no se toma
      -- prestado el turno de otro (el abono queda sin turno).
      select coalesce(bool_or(setting.owner_uses_shifts), false) into v_owner_uses_shifts
      from public.settings setting
      where setting.user_id = workspace;

      if not v_owner_uses_shifts then
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

CREATE OR REPLACE FUNCTION public.open_shift_for_commission(p_staff_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_shift uuid;
  v_count integer;
begin
  if v_uid is null then
    return null;
  end if;

  -- CAMBIO: primero la caja de quien paga (su membresía activa en este negocio).
  select shift_row.id into v_shift
  from public.shifts shift_row
  where shift_row.user_id = v_uid
    and shift_row.membership_id = public.get_active_membership_id()
    and shift_row.status = 'open'
  order by shift_row.opened_at
  limit 1;

  if v_shift is not null then
    return v_shift;
  end if;

  select shift_row.id into v_shift
  from public.shifts shift_row
  join public.workspace_memberships m
    on m.id = shift_row.membership_id
   and m.workspace_id = v_uid
   and m.staff_id = p_staff_id
   and m.status = 'active'
  where shift_row.user_id = v_uid
    and shift_row.status = 'open'
  order by shift_row.opened_at
  limit 1;

  if v_shift is not null then
    return v_shift;
  end if;

  select count(*) into v_count
  from public.shifts shift_row
  where shift_row.user_id = v_uid and shift_row.status = 'open';

  if v_count <> 1 then
    return null;
  end if;

  select shift_row.id into v_shift
  from public.shifts shift_row
  where shift_row.user_id = v_uid and shift_row.status = 'open';

  return v_shift;
end;
$function$;
