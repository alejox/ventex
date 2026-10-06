import type { PromoConfig } from "@/services/promos.service";

/**
 * ¿El formulario de Promociones tiene cambios que todavía no se guardaron?
 *
 * Importa porque "Recalcular desde el historial" corre en la base con la
 * configuración GUARDADA: con servicios recién marcados y sin guardar,
 * recalcula con los viejos y deja los contadores de todos los clientes mal.
 *
 * El orden de los servicios no cuenta: marcar A y B o B y A es lo mismo.
 * `defaultMessage` es lo que el editor precargó cuando no había mensaje
 * guardado; sin eso, abrir la pantalla ya contaría como "cambio".
 */
export function isPromoDraftDirty(
  saved: PromoConfig,
  draft: PromoConfig,
  defaultMessage: string,
): boolean {
  if (saved.enabled !== draft.enabled) return true;
  const a = new Set(saved.serviceIds);
  const b = new Set(draft.serviceIds);
  if (a.size !== b.size || [...a].some((id) => !b.has(id))) return true;
  return (saved.message ?? defaultMessage) !== (draft.message ?? defaultMessage);
}
