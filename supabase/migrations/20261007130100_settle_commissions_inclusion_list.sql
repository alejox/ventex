-- settle_commissions: se paga LO QUE EL DUEÑO VIO, no "todo lo pendiente menos
-- lo que destildó".
--
-- Con la lista de EXCLUSIÓN el RPC tomaba toda línea pendiente del período y le
-- restaba las destildadas. Eso pagaba líneas que el dueño nunca vio:
--   * ventas registradas mientras el modal estaba abierto;
--   * líneas más allá de la fila 1.000 (el detalle no paginaba).
-- El comprobante salía por un total distinto al que se confirmó en pantalla.
--
-- Ahora el cliente manda p_item_ids (las líneas mostradas y tildadas) y
-- p_expected_total (la suma que vio). El RPC bloquea SOLO esas líneas, con los
-- mismos filtros de elegibilidad de siempre (del miembro, pendientes, con
-- comisión, venta completada, dentro del período), y si alguna ya no califica o
-- la suma bloqueada no cuadra con lo esperado (±0,01) levanta
-- LIQUIDACION_CAMBIO sin escribir nada: la UI recarga y el dueño vuelve a mirar.
--
-- Compatibilidad: los dos parámetros nuevos van AL FINAL con default NULL; con
-- NULL el comportamiento es el viejo (exclusión). La firma vieja se dropea en
-- esta misma migración — si conviviera, toda llamada sería ambigua. El cliente
-- reintenta con la firma vieja ante PGRST202.
--
-- El valor de retorno sigue siendo el uuid de la liquidación: el total que
-- quedó registrado lo lee el cliente de commission_settlements.

drop function if exists public.settle_commissions(
  uuid, date, date, timestamptz, timestamptz, text, date, uuid[]
);

create or replace function public.settle_commissions(
  p_staff_id uuid,
  p_from date,
  p_to date,
  p_from_ts timestamptz,
  p_to_ts timestamptz,
  p_payment_method text,
  p_paid_on date default current_date,
  p_exclude_item_ids uuid[] default '{}'::uuid[],
  p_item_ids uuid[] default null,
  p_expected_total numeric default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_requested   integer;
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
      and (p_item_ids is null or item.id = any(p_item_ids))
    for update of item
  )
  select coalesce(array_agg(id), '{}'::uuid[]),
         count(*),
         coalesce(sum(commission_amount), 0)
    into v_item_ids, v_count, v_total
  from locked;

  -- Modelo de inclusión: todo lo pedido tiene que seguir siendo pagable, y la
  -- suma tiene que ser la que el dueño confirmó. Si no, nada se escribe.
  if p_item_ids is not null then
    select count(distinct x) into v_requested
    from unnest(p_item_ids) as x
    where x is not null
      and not (x = any(coalesce(p_exclude_item_ids, '{}'::uuid[])));

    if v_count <> v_requested
       or (p_expected_total is not null and abs(v_total - p_expected_total) > 0.01) then
      raise exception 'LIQUIDACION_CAMBIO: las comisiones pendientes cambiaron mientras revisabas. Revisa el detalle actualizado y vuelve a confirmar.'
        using errcode = 'P0001',
              detail = format('esperado=%s registrado=%s lineas_pedidas=%s lineas_validas=%s',
                              p_expected_total, v_total, v_requested, v_count);
    end if;
  end if;

  if v_count = 0 or v_total <= 0 then
    raise exception 'SIN_COMISIONES: no hay comisiones pendientes para liquidar en ese período';
  end if;

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

  -- El efectivo sale del cajón ABIERTO HOY, aunque la fecha de pago sea
  -- anterior: es la plata que físicamente se entrega ahora. El modal lo avisa.
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
$function$;

revoke all on function public.settle_commissions(
  uuid, date, date, timestamptz, timestamptz, text, date, uuid[], uuid[], numeric
) from public, anon;
grant execute on function public.settle_commissions(
  uuid, date, date, timestamptz, timestamptz, text, date, uuid[], uuid[], numeric
) to authenticated, service_role;
