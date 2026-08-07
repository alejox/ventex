-- `clear_active_workspace` quedó huérfana: su único llamador,
-- `services/workspace.service.ts:clearSelectedWorkspace`, no lo invocaba nadie
-- (`rg "clearSelectedWorkspace"` no da ningún caller) y se eliminó junto con
-- esta. Mismo patrón que `increment_stock`
-- (20260806132000_drop_orphaned_increment_stock.sql): función viva sin
-- ningún camino que la alcance.
drop function if exists public.clear_active_workspace();
