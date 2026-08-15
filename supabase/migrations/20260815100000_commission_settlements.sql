-- Liquidar comisiones: la comisión pasa a tener estado.
--
-- Hasta hoy "Comisión del mes" era un cálculo EN VIVO sobre todas las ventas del
-- período. No existía el concepto de pagado: el dueño le pagaba al barbero y al
-- día siguiente veía el mismo número (o uno mayor), sin forma de saber cuánto ya
-- había liquidado. Ese es el gap.
--
-- El estado NO va en una columna de `staff` ni en un total por persona: va en la
-- LÍNEA de venta. `sale_items.commission_amount` ya es el monto congelado al
-- vender, así que `sale_items.commission_settlement_id` es el lugar natural para
-- decir "esta comisión ya se pagó, en esta liquidación". Con eso:
--   * la idempotencia es estructural: se liquida solo lo que tiene el campo NULL;
--   * excluir un ítem puntual sale gratis;
--   * el detalle del reporte y el total no pueden divergir, porque el total se
--     calcula de las mismas filas que se estampan.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) La liquidación: quién, qué período, cuánto y con qué se pagó.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_settlements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT public.get_effective_user_id()
                  REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  -- El período TAL COMO LO ELIGIÓ el usuario. Es lo que se imprime en el
  -- comprobante; el corte real viajó en instantes (ver el RPC).
  period_from   date NOT NULL,
  period_to     date NOT NULL,
  total_amount  numeric(12,2) NOT NULL CHECK (total_amount > 0),
  items_count   integer NOT NULL CHECK (items_count > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('efectivo', 'transferencia', 'tarjeta')),
  paid_on       date NOT NULL DEFAULT CURRENT_DATE,
  -- El gasto que esta liquidación generó. Nullable porque al anularla el gasto
  -- se borra y la liquidación queda como constancia de que existió.
  expense_id    uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'void')),
  -- Quién la autorizó. Es `auth.uid()`, la persona, no el negocio.
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  voided_at     timestamptz,
  CHECK (period_to >= period_from)
);

CREATE INDEX IF NOT EXISTS commission_settlements_staff_idx
  ON public.commission_settlements (user_id, staff_id, paid_on DESC);

ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_commission_settlements_user_id ON public.commission_settlements;
CREATE TRIGGER set_commission_settlements_user_id
  BEFORE INSERT ON public.commission_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- Leer: el mismo criterio que los gastos, porque una liquidación ES un gasto.
-- Escribir: NUNCA desde el cliente. Las dos escrituras válidas viven en los RPC
-- de abajo, que son SECURITY DEFINER; sin policy de escritura, un INSERT suelto
-- que se saltee la contabilidad no tiene por dónde entrar.
DROP POLICY IF EXISTS workspace_commission_settlements_read ON public.commission_settlements;
CREATE POLICY workspace_commission_settlements_read
  ON public.commission_settlements FOR SELECT
  USING (user_id = public.get_effective_user_id() AND public.worker_can('panel'));

GRANT SELECT ON public.commission_settlements TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) El estado, en la línea de venta.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS commission_settlement_id uuid
  REFERENCES public.commission_settlements(id) ON DELETE SET NULL;

-- Índice parcial: la consulta que importa es "qué falta liquidar", y lo
-- pendiente es una fracción del histórico.
CREATE INDEX IF NOT EXISTS sale_items_pending_commission_idx
  ON public.sale_items (user_id, staff_id)
  WHERE commission_settlement_id IS NULL AND commission_amount > 0;

CREATE INDEX IF NOT EXISTS sale_items_settlement_idx
  ON public.sale_items (commission_settlement_id)
  WHERE commission_settlement_id IS NOT NULL;

-- Toda columna nueva nace sin permisos. Solo SELECT: `sale_items` no tiene
-- policy de escritura y no se la va a dar ahora.
GRANT SELECT (commission_settlement_id) ON public.sale_items TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) El vínculo de vuelta desde el gasto, para trazabilidad.
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS commission_settlement_id uuid
  REFERENCES public.commission_settlements(id) ON DELETE SET NULL;

GRANT SELECT (commission_settlement_id) ON public.expenses TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) El gasto de una liquidación no se edita ni se borra a mano.
--
--    Si el dueño pudiera cambiarle el monto, el comprobante diría una cosa y la
--    contabilidad otra, y no habría forma de saber cuál es cierta. Se anula la
--    liquidación —que reversa el gasto— o no se toca.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_commission_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
begin
  -- El RPC de anulación levanta esta bandera dentro de su propia transacción.
  if coalesce(current_setting('app.voiding_settlement', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.commission_settlement_id is not null then
      raise exception 'GASTO_DE_LIQUIDACION: este gasto nació de una liquidación de comisiones. Anulá la liquidación para reversarlo.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.commission_settlement_id is not null
     and (new.amount is distinct from old.amount
          or new.expense_date is distinct from old.expense_date
          or new.commission_settlement_id is distinct from old.commission_settlement_id) then
    raise exception 'GASTO_DE_LIQUIDACION: el monto y la fecha los fija la liquidación de comisiones.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS expenses_guard_commission ON public.expenses;
CREATE TRIGGER expenses_guard_commission
  BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_expense();

-- ---------------------------------------------------------------------------
-- 5) Liquidar. Una transacción: calcula, cobra, gasta y estampa.
--
--    El rango viaja en INSTANTES (`p_from_ts` / `p_to_ts`, este último
--    exclusivo) y no en fechas: `sales.created_at` es timestamptz y la base
--    corre en UTC, así que un corte por `created_at::date` metería la venta de
--    las 20:00 en Colombia dentro del día siguiente. Los instantes los calcula
--    el navegador desde las fechas que eligió el usuario, que es donde vive la
--    zona horaria del negocio. `p_from`/`p_to` viajan igual porque son lo que
--    se imprime en el comprobante.
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
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Pagarle a alguien es acto del dueño. Es el mismo criterio que ya rige la
  -- escritura de `expenses`, y esto CREA un gasto.
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

  -- Las líneas elegibles se BLOQUEAN antes de sumarlas. Sin `for update`, dos
  -- liquidaciones simultáneas del mismo período leerían las mismas filas
  -- pendientes y pagarían dos veces lo mismo.
  --
  -- El bloqueo va en un CTE y el resultado a un array —no a una tabla temporal—
  -- porque una temporal `on commit drop` explota si el RPC se llama dos veces
  -- dentro de la misma transacción.
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

  insert into public.commission_settlements
    (user_id, staff_id, period_from, period_to, total_amount, items_count,
     payment_method, paid_on, created_by)
  values
    (v_uid, p_staff_id, p_from, p_to, v_total, v_count,
     p_payment_method, coalesce(p_paid_on, current_date), v_actor)
  returning id into v_settlement;

  -- La categoría "Comisiones" se crea una sola vez por negocio, la primera vez
  -- que se liquida. No es `is_default`: el default es "Otros", y hay una sola.
  select c.id into v_category
  from public.expense_categories c
  where c.user_id = v_uid and lower(btrim(c.name)) = 'comisiones'
  limit 1;

  if v_category is null then
    insert into public.expense_categories (user_id, name, description, color)
    values (v_uid, 'Comisiones', 'Liquidaciones de comisión al personal', '#f59e0b')
    returning id into v_category;
  else
    -- Si estaba desactivada, vuelve: el gasto que se está creando la usa.
    update public.expense_categories set is_active = true
    where id = v_category and is_active = false;
  end if;

  insert into public.expenses
    (user_id, description, amount, expense_date, category_id, commission_settlement_id)
  values
    (v_uid,
     'Comisión ' || v_staff_name || ' — ' ||
       to_char(p_from, 'DD/MM/YYYY') || ' al ' || to_char(p_to, 'DD/MM/YYYY'),
     v_total,
     coalesce(p_paid_on, current_date),
     v_category,
     v_settlement)
  returning id into v_expense;

  update public.commission_settlements
     set expense_id = v_expense
   where id = v_settlement;

  -- El estampado va ÚLTIMO y sobre las mismas filas que se sumaron: el total
  -- del comprobante y lo que queda marcado como pagado son la misma cosa.
  update public.sale_items
     set commission_settlement_id = v_settlement
   where id = any(v_item_ids);

  return v_settlement;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Anular: devuelve las comisiones a pendiente y borra el gasto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_commission_settlement(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  v_uid       uuid := public.get_effective_user_id();
  v_expense   uuid;
  v_status    text;
begin
  if (select auth.uid()) is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.is_tenant_owner() then
    raise exception 'SIN_PERMISO: solo el dueño puede anular una liquidación'
      using errcode = '42501';
  end if;

  select s.expense_id, s.status into v_expense, v_status
  from public.commission_settlements s
  where s.id = p_settlement_id and s.user_id = v_uid
  for update;
  if not found then
    raise exception 'Liquidación no encontrada';
  end if;
  if v_status = 'void' then
    raise exception 'Esa liquidación ya estaba anulada';
  end if;

  -- Las comisiones vuelven a pendiente: es lo que hace que se puedan liquidar
  -- de nuevo sin haber pagado dos veces.
  update public.sale_items
     set commission_settlement_id = null
   where commission_settlement_id = p_settlement_id
     and user_id = v_uid;

  if v_expense is not null then
    -- La bandera deja pasar este borrado por el guard de `expenses`, que existe
    -- justo para impedir que se haga por cualquier otro camino.
    perform set_config('app.voiding_settlement', 'on', true);
    delete from public.expenses where id = v_expense and user_id = v_uid;
    perform set_config('app.voiding_settlement', 'off', true);
  end if;

  update public.commission_settlements
     set status = 'void', voided_at = now(), expense_id = null
   where id = p_settlement_id and user_id = v_uid;
end;
$$;

REVOKE ALL ON FUNCTION public.settle_commissions(uuid, date, date, timestamptz, timestamptz, text, date, uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.void_commission_settlement(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.settle_commissions(uuid, date, date, timestamptz, timestamptz, text, date, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_commission_settlement(uuid) TO authenticated;

COMMIT;
