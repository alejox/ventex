-- Funciones de trigger SECURITY DEFINER de los puntos de fidelización: las
-- ejecuta el disparador, nadie debe poder llamarlas por RPC. Se revoca EXECUTE
-- siguiendo el mismo patrón que `20260924030000_school_revoke_trigger_function_execute.sql`;
-- el advisor de seguridad las marcaba ejecutables por anon/authenticated vía
-- /rest/v1/rpc/*. La invocación por trigger no consulta EXECUTE, así que
-- otorgar puntos, revertirlos al anular y mantener el saldo derivado siguen
-- intactos.
revoke all on function public.earn_loyalty_points() from public, anon, authenticated;
revoke all on function public.reverse_loyalty_points() from public, anon, authenticated;
revoke all on function public.apply_loyalty_ledger_entry() from public, anon, authenticated;
