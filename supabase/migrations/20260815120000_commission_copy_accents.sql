-- La descripción del gasto de una liquidación va con tilde.
--
-- `settle_commissions` autogenera el texto que el dueño lee en Gastos y en el
-- comprobante que le entrega al colaborador: "Comisión Carlos Henao — 01/08/2026
-- al 15/08/2026". Salió como "Comision ... - ..." porque al aplicar la migración
-- anterior se le quitaron los acentos por precaución con el canal, y esa versión
-- sin tildes fue la que quedó guardada.
--
-- Toda la UI de Ventex está en español; una cadena que el cliente ve escrita mal
-- no es un detalle de estilo. Va migración nueva y no un arreglo sobre la
-- 20260815110000 porque esa ya corrió en el proyecto remoto.

BEGIN;

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
AS $fn$
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
  v_label       text;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if not public.is_tenant_owner() then
    raise exception 'SIN_PERMISO: solo el dueño puede liquidar comisiones'
      using errcode = '42501';
  end if;

  select s.full_name into v_staff_name
  from public.staff s
  where s.id = p_staff_id and s.user_id = v_uid;
  if not found then
    raise exception 'Miembro del personal no encontrado';
  end if;

  if p_to < p_from then
    raise exception 'El período termina antes de empezar';
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
    raise exception 'SIN_COMISIONES: no hay comisiones pendientes para liquidar en ese período';
  end if;

  -- Una sola vez: es el texto del gasto Y el del retiro de caja, y que digan
  -- cosas distintas obligaría a leer dos pantallas para entender un solo pago.
  v_label := 'Comisión ' || v_staff_name || ' — ' ||
             to_char(p_from, 'DD/MM/YYYY') || ' al ' || to_char(p_to, 'DD/MM/YYYY');

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
    values (v_uid, 'Comisiones', 'Liquidaciones de comisión al personal', '#f59e0b')
    returning id into v_category;
  else
    update public.expense_categories set is_active = true
    where id = v_category and is_active = false;
  end if;

  insert into public.expenses
    (user_id, description, amount, expense_date, category_id, commission_settlement_id)
  values
    (v_uid, v_label, v_total, coalesce(p_paid_on, current_date), v_category, v_settlement)
  returning id into v_expense;

  if p_payment_method = 'efectivo' then
    v_shift_id := public.open_shift_for_commission(p_staff_id);

    if v_shift_id is not null then
      select * into v_shift
      from public.shifts shift_row
      where shift_row.id = v_shift_id and shift_row.user_id = v_uid
      for update;

      if found and v_shift.status = 'open' then
        insert into public.cash_movements
          (amount, reason, kind, shift_id, user_id, worker_id, membership_id)
        values
          (v_total, v_label, 'comision', v_shift.id, v_uid, v_actor, v_shift.membership_id)
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
$fn$;

REVOKE ALL ON FUNCTION public.settle_commissions(uuid, date, date, timestamptz, timestamptz, text, date, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.settle_commissions(uuid, date, date, timestamptz, timestamptz, text, date, uuid[]) TO authenticated;

-- Lo ya escrito con el texto viejo. Son gastos de liquidación, así que el
-- trigger `expenses_guard_commission` los protege: solo deja pasar el cambio de
-- monto/fecha, y acá únicamente se toca la descripción.
UPDATE public.expenses
   SET description = replace(replace(description, 'Comision ', 'Comisión '), ' - ', ' — ')
 WHERE commission_settlement_id IS NOT NULL
   AND description LIKE 'Comision %';

UPDATE public.cash_movements
   SET reason = replace(replace(reason, 'Comision ', 'Comisión '), ' - ', ' — ')
 WHERE kind = 'comision'
   AND reason LIKE 'Comision %';

UPDATE public.expense_categories
   SET description = 'Liquidaciones de comisión al personal'
 WHERE lower(btrim(name)) = 'comisiones'
   AND description = 'Liquidaciones de comision al personal';

COMMIT;
