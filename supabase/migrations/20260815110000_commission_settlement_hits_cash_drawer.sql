-- La comisión pagada en efectivo sale del cajón, y el arqueo tiene que saberlo.
--
-- Hasta acá `settle_commissions` creaba el gasto —correcto para el estado de
-- resultados— pero no tocaba la caja. Resultado: el dueño le pagaba $51.500 al
-- barbero del efectivo del mostrador y al cerrar turno el arqueo reportaba
-- $51.500 de FALTANTE, como si alguien se hubiera robado la plata. Justo el
-- descuadre que los turnos existen para detectar, disparado por una operación
-- legítima.
--
-- `close_shift` ya calcula `expected := opening_cash + cash_total -
-- withdrawal_total`, y `withdrawal_total` suma TODOS los `cash_movements` del
-- turno sin mirar el `kind`. Así que alcanza con anotar el movimiento: no hay
-- que tocar el arqueo.
--
-- Lo que NO se hace es reusar `kind = 'gasto'`: ese valor le dice al sistema que
-- además cree un gasto, y la liquidación ya creó el suyo. Sería contar la misma
-- plata dos veces en el estado de resultados.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Un tercer destino para la plata que sale del cajón.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cash_movements
  DROP CONSTRAINT IF EXISTS cash_movements_kind_check;
ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_kind_check
  CHECK (kind IN ('gasto', 'traslado', 'comision'));

COMMENT ON COLUMN public.cash_movements.kind IS
  'gasto = descuadra la caja Y va al estado de resultados. traslado = solo descuadra la caja (mover a la caja fuerte no es una pérdida). comision = solo descuadra la caja, porque el gasto ya lo creó la liquidación que lo originó.';

-- ---------------------------------------------------------------------------
-- 2) El vínculo, para poder reversarlo al anular.
-- ---------------------------------------------------------------------------
ALTER TABLE public.commission_settlements
  ADD COLUMN IF NOT EXISTS cash_movement_id uuid
  REFERENCES public.cash_movements(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) De qué cajón sale.
--
--    Primero el turno abierto de LA PERSONA a la que se le paga: en una
--    barbería con una sola caja, el barbero la tiene abierta y el dueño le paga
--    de ahí al cierre del día. Si esa persona no tiene turno (no entra al
--    sistema, o ya cerró), se cae al único turno abierto del negocio.
--
--    Con dos o más turnos abiertos y ninguno de la persona pagada, devuelve
--    NULL a propósito: adivinar de qué caja salió la plata es peor que no
--    anotarlo, porque metería un faltante en el turno de otro empleado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_shift_for_commission(p_staff_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_shift uuid;
  v_count integer;
begin
  if v_uid is null then
    return null;
  end if;

  select shift_row.id into v_shift
  from public.shifts shift_row
  join public.profiles p
    on p.id = shift_row.worker_id
   and p.staff_id = p_staff_id
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
$$;

REVOKE ALL ON FUNCTION public.open_shift_for_commission(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.open_shift_for_commission(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Liquidar, ahora tocando la caja cuando el pago es en efectivo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_commissions(
  p_staff_id uuid,
  p_from date,
  p_to date,
  p_from_ts timestamptz,
  p_to_ts timestamptz,
  p_payment_method text,
  p_paid_on date DEFAULT CURRENT_DATE,
  p_exclude_item_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  v_uid         uuid := public.get_effective_user_id();
  v_actor       uuid := (select auth.uid());
  v_settlement  uuid;
  v_expense     uuid;
  v_category    uuid;
  v_total       numeric(12,2);
  v_count       integer;
  v_staff_name  text;
  v_item_ids    uuid[];
  v_shift       public.shifts;
  v_shift_id    uuid;
  v_movement    uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if not public.is_tenant_owner() then
    raise exception 'SIN_PERMISO: solo el dueno puede liquidar comisiones'
      using errcode = '42501';
  end if;

  select s.full_name into v_staff_name
  from public.staff s
  where s.id = p_staff_id and s.user_id = v_uid;
  if not found then
    raise exception 'Miembro del personal no encontrado';
  end if;

  if p_to < p_from then
    raise exception 'El periodo termina antes de empezar';
  end if;

  with locked as (
    select item.id, item.commission_amount
    from public.sale_items item
    join public.sales sale
      on sale.id = item.sale_id
     and sale.user_id = v_uid
    where item.user_id = v_uid
      and item.staff_id = p_staff_id
      and item.commission_settlement_id is null
      and coalesce(item.commission_amount, 0) > 0
      and sale.status = 'completed'
      and sale.created_at >= p_from_ts
      and sale.created_at <  p_to_ts
      and not (item.id = any(coalesce(p_exclude_item_ids, '{}'::uuid[])))
    for update of item
  )
  select coalesce(array_agg(id), '{}'::uuid[]),
         count(*),
         coalesce(sum(commission_amount), 0)
    into v_item_ids, v_count, v_total
  from locked;

  if v_count = 0 or v_total <= 0 then
    raise exception 'SIN_COMISIONES: no hay comisiones pendientes para liquidar en ese periodo';
  end if;

  insert into public.commission_settlements
    (user_id, staff_id, period_from, period_to, total_amount, items_count,
     payment_method, paid_on, created_by)
  values
    (v_uid, p_staff_id, p_from, p_to, v_total, v_count,
     p_payment_method, coalesce(p_paid_on, current_date), v_actor)
  returning id into v_settlement;

  select c.id into v_category
  from public.expense_categories c
  where c.user_id = v_uid and lower(btrim(c.name)) = 'comisiones'
  limit 1;

  if v_category is null then
    insert into public.expense_categories (user_id, name, description, color)
    values (v_uid, 'Comisiones', 'Liquidaciones de comision al personal', '#f59e0b')
    returning id into v_category;
  else
    update public.expense_categories set is_active = true
    where id = v_category and is_active = false;
  end if;

  insert into public.expenses
    (user_id, description, amount, expense_date, category_id, commission_settlement_id)
  values
    (v_uid,
     'Comision ' || v_staff_name || ' - ' ||
       to_char(p_from, 'DD/MM/YYYY') || ' al ' || to_char(p_to, 'DD/MM/YYYY'),
     v_total,
     coalesce(p_paid_on, current_date),
     v_category,
     v_settlement)
  returning id into v_expense;

  -- Solo el efectivo sale del cajón. Una transferencia o un datafono mueven
  -- plata del banco: la caja del mostrador no se entera, y anotar un retiro
  -- inventaria un faltante que no existe.
  if p_payment_method = 'efectivo' then
    v_shift_id := public.open_shift_for_commission(p_staff_id);

    if v_shift_id is not null then
      select * into v_shift
      from public.shifts shift_row
      where shift_row.id = v_shift_id and shift_row.user_id = v_uid
      for update;

      -- El turno pudo cerrarse entre la resolucion y el bloqueo.
      if found and v_shift.status = 'open' then
        insert into public.cash_movements
          (amount, reason, kind, shift_id, user_id, worker_id, membership_id)
        values
          (v_total,
           'Comision ' || v_staff_name || ' - ' ||
             to_char(p_from, 'DD/MM/YYYY') || ' al ' || to_char(p_to, 'DD/MM/YYYY'),
           'comision',
           v_shift.id,
           v_uid,
           v_actor,
           -- La FK compuesta (shift_id, user_id, membership_id) exige la
           -- membresia DEL TURNO, no la de quien esta liquidando.
           v_shift.membership_id)
        returning id into v_movement;
      end if;
    end if;
  end if;

  update public.commission_settlements
     set expense_id = v_expense,
         cash_movement_id = v_movement
   where id = v_settlement;

  update public.sale_items
     set commission_settlement_id = v_settlement
   where id = any(v_item_ids);

  return v_settlement;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Anular: además del gasto, devolver la plata al cajón — si todavía se puede.
--
--    Un turno CERRADO ya se contó físicamente: esa plata salió de verdad y su
--    arqueo quedó firmado. Borrarle el movimiento después reescribiría un conteo
--    que alguien ya justificó. Se deja y se informa; el dueño decide.
-- ---------------------------------------------------------------------------
-- Pasa de `void` a `jsonb` para poder contar qué se pudo reversar, y Postgres no
-- deja cambiar el tipo de retorno con CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.void_commission_settlement(uuid);

CREATE FUNCTION public.void_commission_settlement(p_settlement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  v_uid          uuid := public.get_effective_user_id();
  v_expense      uuid;
  v_movement     uuid;
  v_status       text;
  v_shift_status text;
  v_cash_back    boolean := false;
begin
  if (select auth.uid()) is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.is_tenant_owner() then
    raise exception 'SIN_PERMISO: solo el dueno puede anular una liquidacion'
      using errcode = '42501';
  end if;

  select s.expense_id, s.cash_movement_id, s.status
    into v_expense, v_movement, v_status
  from public.commission_settlements s
  where s.id = p_settlement_id and s.user_id = v_uid
  for update;
  if not found then
    raise exception 'Liquidacion no encontrada';
  end if;
  if v_status = 'void' then
    raise exception 'Esa liquidacion ya estaba anulada';
  end if;

  update public.sale_items
     set commission_settlement_id = null
   where commission_settlement_id = p_settlement_id
     and user_id = v_uid;

  if v_expense is not null then
    perform set_config('app.voiding_settlement', 'on', true);
    delete from public.expenses where id = v_expense and user_id = v_uid;
    perform set_config('app.voiding_settlement', 'off', true);
  end if;

  if v_movement is not null then
    select shift_row.status into v_shift_status
    from public.cash_movements movement
    join public.shifts shift_row on shift_row.id = movement.shift_id
    where movement.id = v_movement and movement.user_id = v_uid;

    if v_shift_status = 'open' then
      delete from public.cash_movements where id = v_movement and user_id = v_uid;
      v_cash_back := true;
    end if;
  end if;

  update public.commission_settlements
     set status = 'void',
         voided_at = now(),
         expense_id = null,
         cash_movement_id = case when v_cash_back then null else cash_movement_id end
   where id = p_settlement_id and user_id = v_uid;

  return jsonb_build_object(
    'cash_returned', v_cash_back,
    -- true = salió efectivo de un turno que ya se cerró y contó: el arqueo de
    -- ese turno no se reescribe, hay que resolverlo a mano.
    'cash_locked_in_closed_shift', v_movement is not null and not v_cash_back
  );
end;
$$;

REVOKE ALL ON FUNCTION public.settle_commissions(uuid, date, date, timestamptz, timestamptz, text, date, uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.void_commission_settlement(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.settle_commissions(uuid, date, date, timestamptz, timestamptz, text, date, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_commission_settlement(uuid) TO authenticated;

COMMIT;
