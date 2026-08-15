-- Contador de cortes por cliente y configuración de promociones.
--
-- El pedido era avisarle al cliente cuántos cortes lleva. El envío se resuelve
-- con un enlace `wa.me` que abre WhatsApp con el mensaje ya escrito —el mismo
-- mecanismo del botón de Soporte que la app ya usa— y NO con la API de Meta:
-- para una barbería, contratar un BSP, esperar la aprobación de plantillas y
-- pagar por conversación es desproporcionado. Con `wa.me` no hay proveedor que
-- contratar, no hay costo por mensaje y funciona hoy.
--
-- Eso deja a la base con una sola responsabilidad: saber cuántos cortes lleva
-- cada cliente y qué promociones tiene el negocio. El mensaje se arma en el
-- cliente y lo manda una persona apretando un botón.
--
-- Qué servicios cuentan como "corte" es CONFIGURABLE y arranca vacío. Adivinar
-- que el servicio llamado "Corte" es el que cuenta sería hardcodear el catálogo
-- de un negocio en la base de todos.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) El contador, en dos números.
--
--    `haircut_count` es el acumulado de siempre; `haircuts_since_reward` se
--    reinicia al canjear un premio. Guardar los dos deja abierta la decisión
--    que el negocio todavía no tomó —premio cíclico o hito único— sin volver a
--    migrar el día que la tome.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS haircut_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS haircuts_since_reward integer NOT NULL DEFAULT 0;

-- Toda columna nueva nace sin permisos: sin GRANT, PostgREST responde
-- "permission denied" y parece un problema de RLS.
--
-- Solo SELECT: el contador lo escriben los triggers de abajo. Si la app pudiera
-- escribirlo, el número dejaría de ser una consecuencia de las ventas para
-- pasar a ser un campo editable a mano, y ya no probaría nada.
GRANT SELECT (haircut_count, haircuts_since_reward) ON public.customers TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Qué cuenta, y el texto del mensaje. Va en `settings`, la fila única de
--    configuración del negocio donde ya viven el IVA y la sobreventa.
-- ---------------------------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS promo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_service_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS promo_message text;

GRANT SELECT (promo_enabled, promo_service_ids, promo_message) ON public.settings TO authenticated;
GRANT INSERT (promo_enabled, promo_service_ids, promo_message) ON public.settings TO authenticated;
GRANT UPDATE (promo_enabled, promo_service_ids, promo_message) ON public.settings TO authenticated;

COMMENT ON COLUMN public.settings.promo_service_ids IS
  'Servicios que suman al contador de cortes. Vacio = ninguno: el negocio elige, no se adivina por el nombre del servicio.';
COMMENT ON COLUMN public.settings.promo_message IS
  'Plantilla del mensaje de WhatsApp. Variables: {cliente}, {cortes}, {negocio}, {premio}.';

-- ---------------------------------------------------------------------------
-- 3) Los hitos, cada uno con su premio.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_milestones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT public.get_effective_user_id()
               REFERENCES auth.users(id) ON DELETE CASCADE,
  threshold  integer NOT NULL CHECK (threshold > 0),
  reward     text NOT NULL CHECK (length(btrim(reward)) > 0),
  -- true = se repite (cada 10 cortes). false = se alcanza una sola vez (a los 50).
  recurring  boolean NOT NULL DEFAULT true,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, threshold)
);

ALTER TABLE public.promo_milestones ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_promo_milestones_user_id ON public.promo_milestones;
CREATE TRIGGER set_promo_milestones_user_id
  BEFORE INSERT ON public.promo_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- Leer lo puede cualquiera del negocio: el cajero necesita saber si al cliente
-- que tiene enfrente le toca premio.
DROP POLICY IF EXISTS workspace_promo_milestones_read ON public.promo_milestones;
CREATE POLICY workspace_promo_milestones_read
  ON public.promo_milestones FOR SELECT
  USING (user_id = public.get_effective_user_id());

-- Configurarlas es del dueño, igual que el resto de los ajustes del negocio.
DROP POLICY IF EXISTS workspace_promo_milestones_write ON public.promo_milestones;
CREATE POLICY workspace_promo_milestones_write
  ON public.promo_milestones FOR ALL
  USING (user_id = public.get_effective_user_id() AND public.is_tenant_owner())
  WITH CHECK (user_id = public.get_effective_user_id() AND public.is_tenant_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_milestones TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) El motor del contador.
--
--    Se engancha con TRIGGERS sobre `sale_items` y `sales`, no tocando
--    `create_sale`. Esa funcion es la mas critica de la app —cobra, descuenta
--    stock, congela comisiones y valida turnos— y sumarle la responsabilidad de
--    contar cortes es la clase de cambio que rompe una venta por un feature de
--    marketing. Los triggers son aditivos: si algo falla aca, falla aca.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sale_item_is_haircut(p_user_id uuid, p_service_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  select p_service_id is not null
     and exists (
       select 1 from public.settings s
       where s.user_id = p_user_id
         and p_service_id = any(s.promo_service_ids)
     );
$fn$;

CREATE OR REPLACE FUNCTION public.bump_haircut_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_customer uuid;
  v_status   text;
begin
  -- Una venta sin cliente no tiene a quien contarle nada: el que pasa por caja
  -- sin registrarse no acumula.
  select sale.customer_id, sale.status into v_customer, v_status
  from public.sales sale
  where sale.id = new.sale_id and sale.user_id = new.user_id;

  if v_customer is null or v_status is distinct from 'completed' then
    return new;
  end if;
  if not public.sale_item_is_haircut(new.user_id, new.service_id) then
    return new;
  end if;

  -- `quantity` y no 1: un ticket puede traer dos cortes (el cliente y su hijo).
  update public.customers
     set haircut_count = haircut_count + new.quantity,
         haircuts_since_reward = haircuts_since_reward + new.quantity
   where id = v_customer and user_id = new.user_id;

  return new;
end;
$fn$;

DROP TRIGGER IF EXISTS sale_items_bump_haircut ON public.sale_items;
CREATE TRIGGER sale_items_bump_haircut
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.bump_haircut_count();

CREATE OR REPLACE FUNCTION public.undo_haircut_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_cortes integer;
begin
  if new.status is not distinct from old.status or new.status <> 'void' then
    return new;
  end if;
  if new.customer_id is null then
    return new;
  end if;

  select coalesce(sum(item.quantity), 0) into v_cortes
  from public.sale_items item
  where item.sale_id = new.id
    and item.user_id = new.user_id
    and public.sale_item_is_haircut(new.user_id, item.service_id);

  if v_cortes > 0 then
    -- `greatest(...,0)`: si el negocio cambio que servicios cuentan entre la
    -- venta y la anulacion, restar podria dejar el contador en negativo, y un
    -- cliente con -2 cortes no significa nada.
    update public.customers
       set haircut_count = greatest(haircut_count - v_cortes, 0),
           haircuts_since_reward = greatest(haircuts_since_reward - v_cortes, 0)
     where id = new.customer_id and user_id = new.user_id;
  end if;

  return new;
end;
$fn$;

DROP TRIGGER IF EXISTS sales_undo_haircut ON public.sales;
CREATE TRIGGER sales_undo_haircut
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.undo_haircut_count();

-- Reconstruye el contador desde el historico de ventas. Responde la pregunta
-- de "los clientes que ya venian, arrancan en cero?": el negocio decide cuando
-- correrlo. Y es la red de seguridad del contador persistente: si alguna vez se
-- desincroniza —porque cambiaron que servicios cuentan, por ejemplo— esto lo
-- devuelve a su valor real.
CREATE OR REPLACE FUNCTION public.recalc_haircut_counts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_filas integer;
begin
  if v_uid is null or not public.is_tenant_owner() then
    raise exception 'SIN_PERMISO: solo el dueno puede recalcular el contador'
      using errcode = '42501';
  end if;

  update public.customers c
     set haircut_count = coalesce(x.cortes, 0),
         haircuts_since_reward = coalesce(x.cortes, 0)
    from (
      select c2.id,
             (select coalesce(sum(item.quantity), 0)::integer
                from public.sale_items item
                join public.sales sale on sale.id = item.sale_id
               where sale.user_id = v_uid
                 and sale.status = 'completed'
                 and sale.customer_id = c2.id
                 and item.user_id = v_uid
                 and public.sale_item_is_haircut(v_uid, item.service_id)) as cortes
        from public.customers c2
       where c2.user_id = v_uid
    ) x
   where c.id = x.id and c.user_id = v_uid;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$fn$;

REVOKE ALL ON FUNCTION public.recalc_haircut_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.recalc_haircut_counts() TO authenticated;

COMMIT;
