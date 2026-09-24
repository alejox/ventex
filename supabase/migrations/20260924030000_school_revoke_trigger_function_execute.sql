-- Funciones de trigger SECURITY DEFINER del módulo escuela: las ejecuta el
-- disparador, nadie debe poder llamarlas por RPC. Se revoca EXECUTE siguiendo
-- el patrón de `set_user_id`/`touch_updated_at`/`handle_new_user`; el advisor
-- de seguridad las marcaba ejecutables por anon/authenticated vía /rest/v1/rpc/*.
-- La invocación por trigger no consulta EXECUTE, así que las reglas de borrado
-- y la reconciliación por anulación siguen intactas.
revoke all on function public.school_reconcile_voided_sale() from public, anon, authenticated;
revoke all on function public.school_guard_no_delete() from public, anon, authenticated;