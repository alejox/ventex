-- Clientes: quién puede escribir qué.
--
-- 20260927030000 reemplazó los GRANT de tabla por GRANT de columna, pero se los
-- dio a `anon` Y a `authenticated` sobre casi todas las columnas — incluidas
-- `credit_balance` (la deuda), `haircut_count`/`haircuts_since_reward` (el
-- contador de la promo). Cualquier sesión podía bajarse la deuda con un PATCH.
--
-- 1. `anon` no escribe clientes. El sitio público crea al cliente dentro de
--    `public_site_book` (SECURITY DEFINER), no por PostgREST.
-- 2. `authenticated` no escribe las columnas derivadas: credit_balance,
--    haircut_count, haircuts_since_reward, loyalty_points. Las escriben
--    create_sale / register_customer_payment / void_sale / los triggers de la
--    promo y del ledger, todos SECURITY DEFINER (dueño `postgres`).
-- 3. `credit_limit` y `tax_exempt` solo los cambia el dueño (is_tenant_owner()):
--    trigger BEFORE INSERT/UPDATE. Un trabajador que crea un cliente los deja en
--    su default (NULL / false).
-- 4. Borrar un cliente: solo el dueño, y nunca con saldo de fiado distinto de 0
--    (el FK de customer_payments es CASCADE: borrarlo se llevaba los abonos).
-- 5. TRUNCATE/TRIGGER no tienen nada que hacer en roles de API: TRUNCATE ignora
--    la RLS.
--
-- Los guards miran `current_user`: solo actúan cuando la sentencia corre como
-- rol de API (authenticated/anon). Las funciones SECURITY DEFINER corren como
-- su dueño y los CASCADE de FK como el dueño de la tabla, así que ni el cobro
-- ni el borrado de una cuenta desde el panel de admin quedan bloqueados.
BEGIN;

-- ---- 1/2/5. Privilegios -------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.customers FROM PUBLIC, anon;
REVOKE TRUNCATE, TRIGGER ON TABLE public.customers FROM authenticated;
REVOKE INSERT, UPDATE ON TABLE public.customers FROM authenticated;

DO $block$
DECLARE
  v_all text;
  v_writable text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO v_all
    FROM pg_attribute
   WHERE attrelid = 'public.customers'::regclass AND attnum > 0 AND NOT attisdropped;

  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO v_writable
    FROM pg_attribute
   WHERE attrelid = 'public.customers'::regclass AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN ('credit_balance', 'haircut_count', 'haircuts_since_reward', 'loyalty_points');

  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.customers FROM PUBLIC, anon, authenticated', v_all, v_all);
  EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON TABLE public.customers TO authenticated', v_writable, v_writable);
END;
$block$;

-- ---- 4. RLS: el FOR ALL se parte para que DELETE pida dueño ---------------------
DROP POLICY IF EXISTS workspace_customers_write ON public.customers;

CREATE POLICY workspace_customers_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_effective_user_id()
    AND (public.worker_can('customers') OR public.worker_can('pos') OR public.worker_can('calendar'))
  );

CREATE POLICY workspace_customers_update ON public.customers
  FOR UPDATE TO authenticated
  USING (
    user_id = public.get_effective_user_id()
    AND (public.worker_can('customers') OR public.worker_can('pos') OR public.worker_can('calendar'))
  )
  WITH CHECK (
    user_id = public.get_effective_user_id()
    AND (public.worker_can('customers') OR public.worker_can('pos') OR public.worker_can('calendar'))
  );

CREATE POLICY workspace_customers_delete ON public.customers
  FOR DELETE TO authenticated
  USING (user_id = public.get_effective_user_id() AND public.is_tenant_owner());

-- ---- 3. Cupo y exención: solo el dueño --------------------------------------
-- SECURITY INVOKER a propósito: con DEFINER, `current_user` sería el dueño de
-- la función y el guard no sabría si lo llamó PostgREST o un RPC del sistema.
CREATE OR REPLACE FUNCTION public.customers_guard_owner_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') or public.is_tenant_owner() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.credit_limit is not null or coalesce(new.tax_exempt, false) then
      raise exception 'CLIENTE_CAMPO_DE_DUENO: solo el dueño puede asignar el cupo de crédito o marcar al cliente como exento de IVA'
        using errcode = '42501';
    end if;
  elsif new.credit_limit is distinct from old.credit_limit
     or coalesce(new.tax_exempt, false) is distinct from coalesce(old.tax_exempt, false) then
    raise exception 'CLIENTE_CAMPO_DE_DUENO: solo el dueño puede cambiar el cupo de crédito o la exención de IVA'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS customers_guard_owner_fields ON public.customers;
CREATE TRIGGER customers_guard_owner_fields
  BEFORE INSERT OR UPDATE OF credit_limit, tax_exempt ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_guard_owner_fields();

-- ---- 4. Borrado: dueño y saldo en cero --------------------------------------
CREATE OR REPLACE FUNCTION public.customers_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  if not public.is_tenant_owner() then
    raise exception 'CLIENTE_SOLO_DUENO: solo el dueño puede eliminar clientes'
      using errcode = '42501';
  end if;
  if coalesce(old.credit_balance, 0) <> 0 then
    raise exception 'CLIENTE_CON_SALDO: el cliente tiene un saldo de fiado de % y no se puede eliminar', old.credit_balance
      using errcode = 'P0001';
  end if;
  return old;
end;
$function$;

DROP TRIGGER IF EXISTS customers_guard_delete ON public.customers;
CREATE TRIGGER customers_guard_delete
  BEFORE DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_guard_delete();

REVOKE EXECUTE ON FUNCTION public.customers_guard_owner_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.customers_guard_delete() FROM PUBLIC, anon, authenticated;

-- ---- Verificación ------------------------------------------------------------
DO $check$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['credit_balance', 'haircut_count', 'haircuts_since_reward', 'loyalty_points'] LOOP
    IF has_column_privilege('authenticated', 'public.customers', c, 'INSERT')
       OR has_column_privilege('authenticated', 'public.customers', c, 'UPDATE') THEN
      RAISE EXCEPTION 'customers.% sigue escribible por authenticated', c;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.customers', 'INSERT')
     OR has_table_privilege('anon', 'public.customers', 'UPDATE')
     OR has_table_privilege('anon', 'public.customers', 'DELETE')
     OR has_any_column_privilege('anon', 'public.customers', 'INSERT')
     OR has_any_column_privilege('anon', 'public.customers', 'UPDATE') THEN
    RAISE EXCEPTION 'anon sigue pudiendo escribir customers';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.customers', 'full_name', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.customers', 'credit_limit', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.customers', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated perdió privilegios que la app usa';
  END IF;
END;
$check$;

COMMIT;
