-- A column-level SELECT grant does not protect loyalty_points while customers
-- retains table-wide INSERT/UPDATE grants. Replace those grants with the same
-- permissions on every existing customer column except the derived balance.
-- Future columns default to no write grant until explicitly reviewed.
-- Ledger writes still update the balance: apply_loyalty_ledger_entry() runs as
-- SECURITY DEFINER and its owner retains table privileges.
BEGIN;

REVOKE INSERT, UPDATE ON TABLE public.customers FROM PUBLIC, anon, authenticated;
REVOKE INSERT (loyalty_points), UPDATE (loyalty_points)
  ON TABLE public.customers FROM PUBLIC, anon, authenticated;

DO $block$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO v_columns
    FROM pg_attribute
   WHERE attrelid = 'public.customers'::regclass
     AND attnum > 0
     AND NOT attisdropped
     AND attname <> 'loyalty_points';

  IF v_columns IS NULL THEN
    RAISE EXCEPTION 'No writable customers columns found';
  END IF;

  EXECUTE format(
    'GRANT INSERT (%s) ON TABLE public.customers TO anon, authenticated',
    v_columns
  );
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.customers TO anon, authenticated',
    v_columns
  );

  IF has_column_privilege('anon', 'public.customers', 'loyalty_points', 'INSERT')
     OR has_column_privilege('anon', 'public.customers', 'loyalty_points', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.customers', 'loyalty_points', 'INSERT')
     OR has_column_privilege('authenticated', 'public.customers', 'loyalty_points', 'UPDATE') THEN
    RAISE EXCEPTION 'customers.loyalty_points remains writable by API roles';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.customers', 'full_name', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.customers', 'full_name', 'UPDATE')
     OR NOT has_column_privilege(
       (SELECT pg_get_userbyid(proowner) FROM pg_proc
        WHERE oid = 'public.apply_loyalty_ledger_entry()'::regprocedure),
       'public.customers', 'loyalty_points', 'UPDATE'
     ) THEN
    RAISE EXCEPTION 'customers write grants or ledger trigger owner privilege were lost';
  END IF;
END;
$block$;

-- The cashier RPC is intentionally callable by authenticated users, but not
-- by unauthenticated visitors through PostgREST's default PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer)
  TO authenticated;

COMMIT;
