-- Puntos de fidelización canjeables, fase 2 de las promociones de tienda
-- (fase 1: `product_offers`, ver 20260927000000).
--
-- Modelo elegido: LEDGER, no un contador mutable. `loyalty_points_ledger` es la
-- fuente de verdad (una fila por movimiento: earn/redeem/reverse/adjust) y
-- `customers.loyalty_points` es un CACHÉ derivado, mantenido por trigger — el
-- mismo split que ya usa el contador de cortes de salón (dato protegido,
-- trigger que lo escribe), pero acá con historial auditable en vez de un solo
-- número, porque acá SÍ hay algo que canjear y por lo tanto algo que anular.
--
-- Por qué un TRIGGER y no sumar la lógica a `create_sale`: la función ya es la
-- más crítica de la app (cobra, descuenta stock, congela comisiones, valida
-- turnos) y la fidelización es un feature de marketing — el mismo argumento
-- que ya usó el motor de cortes de salón (ver `20260815200000`). El trigger
-- se engancha en el UPDATE que fija `sales.total` (la venta se INSERTa con
-- total=0 y se corrige en un segundo UPDATE dentro de la misma transacción de
-- `create_sale` una vez calculado el neto), así que funciona igual para una
-- venta cobrada online y para una que llega más tarde por la cola offline: las
-- dos pasan por el mismo `create_sale`, y por lo tanto por el mismo UPDATE.
--
-- Por qué ledger y no una columna: el canje se ata a una venta puntual y
-- anularla tiene que poder revertir EXACTAMENTE lo que esa venta sumó y
-- restó, sin tocar movimientos de otras ventas — igual que
-- `promo_redemptions.progress_before` le permite a `undo_haircut_count`
-- reconstruir el número exacto. Una fila `reverse` por cada `earn`/`redeem`
-- deja auditoría completa y es naturalmente idempotente (índices únicos
-- parciales impiden ganar o devolver puntos dos veces por la misma venta).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Configuración del negocio, en `settings` (fila única, se crea perezosa).
-- ---------------------------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS points_enabled boolean NOT NULL DEFAULT false,
  -- Pesos que hay que gastar para ganar UN punto. NULL/0 = el trigger no
  -- entrega puntos (ver `earn_loyalty_points`): sin este número no hay tasa.
  ADD COLUMN IF NOT EXISTS points_peso_per_point numeric
    CHECK (points_peso_per_point IS NULL OR points_peso_per_point > 0),
  -- Valor en $ de UN punto al canjear.
  ADD COLUMN IF NOT EXISTS points_value numeric
    CHECK (points_value IS NULL OR points_value > 0),
  -- Mínimo de puntos que se pueden canjear de una vez. 0 = sin mínimo.
  ADD COLUMN IF NOT EXISTS points_min_redeem integer NOT NULL DEFAULT 0
    CHECK (points_min_redeem >= 0);

GRANT SELECT (points_enabled, points_peso_per_point, points_value, points_min_redeem)
  ON public.settings TO authenticated;
GRANT INSERT (points_enabled, points_peso_per_point, points_value, points_min_redeem)
  ON public.settings TO authenticated;
GRANT UPDATE (points_enabled, points_peso_per_point, points_value, points_min_redeem)
  ON public.settings TO authenticated;

COMMENT ON COLUMN public.settings.points_peso_per_point IS
  'Pesos gastados por punto ganado. NULL o <=0 apaga el otorgamiento aunque points_enabled sea true.';
COMMENT ON COLUMN public.settings.points_value IS
  'Valor en pesos de un punto al canjear. NULL o <=0 impide canjear.';

-- ---------------------------------------------------------------------------
-- 2) El saldo, cacheado en `customers` — SOLO LECTURA para la app.
--
--    Toda columna nueva nace sin permisos (ver el comentario equivalente en
--    `20260815200000`): sin GRANT, PostgREST responde "permission denied" y
--    parece un problema de RLS. Solo SELECT: el saldo lo escribe el trigger
--    de la sección 4 a partir del ledger, nunca la app directamente.
--
--    OJO, límite conocido y documentado en AGENTS.md ("Puntos de tienda"):
--    esta columna puede quedar NEGATIVA si se anula una venta que otorgó
--    puntos que el cliente ya gastó en una venta posterior. No lleva CHECK
--    >= 0 a propósito — un CHECK que fallara ahí reventaría la anulación
--    completa (`void_sale` corre en la misma transacción que este trigger), y
--    frenar una anulación por un feature de marketing es peor que dejar un
--    saldo transitoriamente negativo que los próximos puntos ganados
--    recomponen solos.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_points integer NOT NULL DEFAULT 0;

GRANT SELECT (loyalty_points) ON public.customers TO authenticated;

COMMENT ON COLUMN public.customers.loyalty_points IS
  'Saldo de puntos canjeables. Cache derivado de loyalty_points_ledger, mantenido por trigger. Puede ser negativo (ver comentario de la migración 20260927010000).';

-- ---------------------------------------------------------------------------
-- 3) El ledger. Cuatro tipos de movimiento:
--      earn    — otorgado al cobrar una venta (positivo).
--      redeem  — canjeado en el POS contra una venta (negativo).
--      reverse — anulación de un earn o un redeem anterior (signo contrario).
--      adjust  — reservado para un ajuste manual futuro; nada en esta fase lo
--                escribe, pero el vocabulario lo contempla desde ya.
--
--    Un `earn` y un `redeem` valen como máximo UNA VEZ por venta (índices
--    únicos parciales): es lo que hace `earn_loyalty_points` y
--    `redeem_loyalty_points` idempotentes ante un reintento o un doble clic.
--    Un `reverse` vale como máximo una vez POR MOVIMIENTO que revierte
--    (`reverses_id` es único), así que anular la misma venta dos veces no
--    duplica la devolución.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_points_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT public.get_effective_user_id()
                 REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- NULL solo tiene sentido para un futuro `adjust` manual sin venta detrás;
  -- earn/redeem/reverse siempre están atados a una.
  sale_id      uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('earn', 'redeem', 'reverse', 'adjust')),
  points       integer NOT NULL CHECK (points <> 0),
  reverses_id  uuid REFERENCES public.loyalty_points_ledger(id),
  note         text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'reverse') = (reverses_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_one_earn_per_sale
  ON public.loyalty_points_ledger (sale_id) WHERE kind = 'earn';
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_one_redeem_per_sale
  ON public.loyalty_points_ledger (sale_id) WHERE kind = 'redeem';
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_one_reverse_per_entry
  ON public.loyalty_points_ledger (reverses_id) WHERE kind = 'reverse';
CREATE INDEX IF NOT EXISTS loyalty_ledger_customer_idx
  ON public.loyalty_points_ledger (user_id, customer_id, created_at DESC);

ALTER TABLE public.loyalty_points_ledger ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_loyalty_points_ledger_user_id ON public.loyalty_points_ledger;
CREATE TRIGGER set_loyalty_points_ledger_user_id
  BEFORE INSERT ON public.loyalty_points_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- Lee cualquiera del negocio (Clientes muestra el historial); ESCRIBE nadie
-- directo — sin policy de INSERT/UPDATE/DELETE, la RLS deniega esas
-- operaciones para `authenticated` aunque el GRANT de tabla las permitiera.
-- Los únicos caminos de escritura son los triggers y el RPC de esta
-- migración, todos SECURITY DEFINER y dueños de `postgres` (bypassa RLS),
-- exactamente el mismo patrón que `promo_redemptions` (20260815210000).
DROP POLICY IF EXISTS workspace_loyalty_ledger_read ON public.loyalty_points_ledger;
CREATE POLICY workspace_loyalty_ledger_read
  ON public.loyalty_points_ledger FOR SELECT
  USING (user_id = public.get_effective_user_id());

GRANT SELECT ON public.loyalty_points_ledger TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) El saldo se deriva del ledger. Un solo trigger, dispara con CUALQUIER
--    inserción (earn, redeem, reverse o el futuro adjust): todos son un
--    delta con signo y sumarlo es la misma cuenta sin importar el `kind`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_loyalty_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
begin
  update public.customers
     set loyalty_points = loyalty_points + new.points
   where id = new.customer_id and user_id = new.user_id;

  return new;
end;
$fn$;

DROP TRIGGER IF EXISTS loyalty_ledger_apply_balance ON public.loyalty_points_ledger;
CREATE TRIGGER loyalty_ledger_apply_balance
  AFTER INSERT ON public.loyalty_points_ledger
  FOR EACH ROW EXECUTE FUNCTION public.apply_loyalty_ledger_entry();

-- ---------------------------------------------------------------------------
-- 5) Otorgar puntos al cobrar.
--
--    Se engancha al UPDATE que fija los totales (`create_sale` inserta la
--    venta con total=0 y la corrige en un UPDATE posterior, ya con el
--    descuento y el IVA aplicados — ver la migración de turnos y el cuerpo
--    actual de `create_sale`). Ese es el único momento en que `sales.total`
--    es DEFINITIVO, así que es el único momento correcto para calcular
--    puntos: hacerlo en el INSERT los habría calculado sobre 0.
--
--    Solo para `tienda` con `points_enabled`: el negocio se identifica por
--    `profiles.business_type` del TENANT (`sales.user_id` es el workspace,
--    que en este esquema coincide con el id del perfil dueño — ver
--    `services/profile.server.ts` y cómo `workspaces.id = owner_user_id`).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.earn_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_tienda  boolean;
  v_enabled boolean;
  v_peso    numeric;
  v_points  integer;
begin
  select coalesce(p.business_type = 'tienda', false)
    into v_tienda
  from public.profiles p
  where p.id = new.user_id;

  if not coalesce(v_tienda, false) then
    return new;
  end if;

  select coalesce(s.points_enabled, false), s.points_peso_per_point
    into v_enabled, v_peso
  from public.settings s
  where s.user_id = new.user_id;

  if not coalesce(v_enabled, false) or v_peso is null or v_peso <= 0 then
    return new;
  end if;

  v_points := floor(new.total / v_peso)::integer;
  if v_points <= 0 then
    return new;
  end if;

  insert into public.loyalty_points_ledger (user_id, customer_id, sale_id, kind, points, created_by)
  values (new.user_id, new.customer_id, new.id, 'earn', v_points, (select auth.uid()))
  on conflict (sale_id) where (kind = 'earn') do nothing;

  return new;
end;
$fn$;

DROP TRIGGER IF EXISTS sales_earn_loyalty_points ON public.sales;
CREATE TRIGGER sales_earn_loyalty_points
  AFTER UPDATE OF subtotal, tax_amount, total ON public.sales
  FOR EACH ROW
  WHEN (new.status = 'completed' AND new.customer_id IS NOT NULL)
  EXECUTE FUNCTION public.earn_loyalty_points();

-- ---------------------------------------------------------------------------
-- 6) Anular una venta revierte lo que esa venta ganó Y lo que canjeó.
--
--    Mismo `WHEN` que ya usan `sales_release_credit_on_void` y
--    `schools_reconcile_on_void`: solo la transición completed -> void.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_row public.loyalty_points_ledger;
begin
  for v_row in
    select *
    from public.loyalty_points_ledger
    where sale_id = new.id
      and user_id = new.user_id
      and kind in ('earn', 'redeem')
  loop
    insert into public.loyalty_points_ledger
      (user_id, customer_id, sale_id, kind, points, reverses_id, note, created_by)
    values
      (v_row.user_id, v_row.customer_id, v_row.sale_id, 'reverse', -v_row.points, v_row.id,
       'Anulación de venta #' || new.sale_number::text, (select auth.uid()))
    on conflict (reverses_id) where (kind = 'reverse') do nothing;
  end loop;

  return new;
end;
$fn$;

DROP TRIGGER IF EXISTS sales_reverse_loyalty_points ON public.sales;
CREATE TRIGGER sales_reverse_loyalty_points
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW
  WHEN (old.status = 'completed' AND new.status = 'void')
  EXECUTE FUNCTION public.reverse_loyalty_points();

-- ---------------------------------------------------------------------------
-- 7) Canjear. Corre DESPUÉS de registrada la venta y atado a su id — mismo
--    motivo que `redeem_promo` (20260815200000/20260824120000): si el cobro
--    fallara, un canje adelantado le habría quemado los puntos al cliente por
--    una venta que no existió.
--
--    Server-side solo se valida el saldo: cuánto vale ese descuento contra el
--    total de la venta NO se puede verificar acá (mismo modelo de confianza
--    que el descuento manual — ver la sección "Decisiones" de
--    odd/tasks/store-offers.md). Es idempotente por venta: reintentar el
--    mismo canje devuelve el saldo ya vigente sin descontar dos veces.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(p_sale_id uuid, p_points integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_uid         uuid := public.get_effective_user_id();
  v_actor       uuid := (select auth.uid());
  v_sale        public.sales%rowtype;
  v_balance     integer;
  v_new_balance integer;
  v_existing_id uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO: no tenés permiso para canjear puntos'
      using errcode = '42501';
  end if;
  if p_points is null or p_points <= 0 then
    raise exception 'CANTIDAD_INVALIDA: los puntos a canjear tienen que ser mayores que cero';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'Solo se puede canjear contra una venta completada';
  end if;
  if v_sale.customer_id is null then
    raise exception 'SIN_CLIENTE: la venta no tiene cliente asignado';
  end if;

  -- Idempotencia primero, antes de tocar el saldo: un reintento del mismo
  -- canje (doble clic, respuesta perdida) devuelve el saldo vigente en vez de
  -- descontar de nuevo.
  select id into v_existing_id
  from public.loyalty_points_ledger
  where sale_id = p_sale_id and kind = 'redeem';
  if found then
    select loyalty_points into v_new_balance
    from public.customers where id = v_sale.customer_id and user_id = v_uid;
    return coalesce(v_new_balance, 0);
  end if;

  select loyalty_points into v_balance
  from public.customers
  where id = v_sale.customer_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  if p_points > coalesce(v_balance, 0) then
    raise exception 'PUNTOS_INSUFICIENTES: el cliente tiene % puntos disponibles', coalesce(v_balance, 0);
  end if;

  insert into public.loyalty_points_ledger (user_id, customer_id, sale_id, kind, points, created_by)
  values (v_uid, v_sale.customer_id, p_sale_id, 'redeem', -p_points, v_actor);

  select loyalty_points into v_new_balance
  from public.customers where id = v_sale.customer_id and user_id = v_uid;

  return coalesce(v_new_balance, 0);
end;
$fn$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_points(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer) TO authenticated;

COMMIT;
