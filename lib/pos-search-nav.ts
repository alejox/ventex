/**
 * Elegir del buscador del POS solo con teclado (C18).
 *
 * - ↑/↓ recorren los resultados (con vuelta al extremo opuesto);
 * - Enter agrega el resaltado o, si no hay resaltado y el filtro dejó UN solo
 *   resultado, ese.
 *
 * El escaneo tiene prioridad y no pasa por acá: un código exacto lo resuelve
 * `onSubmitCode` antes (ver `PosCatalog`). Y como el resaltado se ata a la
 * búsqueda en la que se hizo (`forQuery`), una lectura nueva del escáner —que
 * cambia el texto— nunca hereda un resaltado viejo.
 *
 * Puro y testeado (`tests/pos-search-nav.test.ts`).
 */

/** Índice resaltado tras una flecha. -1 = ninguno. */
export function nextHighlight(current: number, key: "ArrowDown" | "ArrowUp", length: number): number {
  if (length <= 0) return -1;
  if (key === "ArrowDown") return current < 0 || current >= length - 1 ? 0 : current + 1;
  return current <= 0 ? length - 1 : current - 1;
}

/** El resaltado vale solo para la búsqueda en la que se hizo. */
export function highlightFor(
  state: { index: number; forQuery: string } | null,
  query: string,
  length: number,
): number {
  if (!state || state.forQuery !== query) return -1;
  return state.index >= 0 && state.index < length ? state.index : -1;
}

/**
 * Qué agrega un Enter que no fue un código: el resaltado, o el único
 * resultado. null = nada (varios resultados y ninguno elegido).
 */
export function enterPick<T>(results: T[], highlighted: number): T | null {
  if (highlighted >= 0 && highlighted < results.length) return results[highlighted];
  return results.length === 1 ? results[0] : null;
}
