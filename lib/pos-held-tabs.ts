/**
 * Ventas en espera (pestañas del POS) que sobreviven a una recarga (C16).
 *
 * Antes las pestañas vivían solo en memoria: un F5, un corte de luz o el
 * navegador que se cerró por error borraban los carritos que el cajero tenía
 * aparcados mientras el cliente iba por la billetera. Ahora el store guarda
 * una foto en IndexedDB (ver `saveHeldTabs` en `services/pos.service.ts`) y la
 * vuelve a cargar al iniciar el POS.
 *
 * Acá vive solo la lógica pura —qué se guarda, cómo se reconcilia contra el
 * catálogo de HOY, qué muestra cada pestaña— para testearla sin IndexedDB
 * (`tests/pos-held-tabs.test.ts`).
 *
 * TENENCIA: igual que la cola offline, la foto se guarda por usuario Y
 * negocio. IndexedDB es por origen, no por cuenta: sin la clave, otra persona
 * que entre en la misma tablet vería —y cobraría— el carrito ajeno.
 */

export const HELD_TABS_VERSION = 1;

/** Lo mínimo de una línea para reconciliarla contra el catálogo. */
interface HeldLine<I extends { id: string; kind: string }> {
  item: I;
  unitKind?: string;
  quantity: number;
  staffId?: string | null;
}

/** Lo mínimo de una pestaña para guardarla y restaurarla. */
export interface HeldTabShape<I extends { id: string; kind: string }> {
  id: string;
  name: string;
  cart: HeldLine<I>[];
  customerId: string | null;
  staffId: string | null;
}

export interface HeldTabsSnapshot<T> {
  version: number;
  /** ISO. Una foto de hace días no se restaura (ver `MAX_AGE_MS`). */
  savedAt: string;
  activeTabId: string;
  tabs: T[];
}

/** Más vieja que esto, la foto se descarta: los precios y el stock ya cambiaron. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Clave de la foto: un usuario en un negocio. */
export function heldTabsKey(context: { authUserId: string; workspaceId: string }): string {
  return `${context.authUserId}:${context.workspaceId}`;
}

/**
 * La foto a guardar, o null si no hay nada que valga la pena guardar (una
 * sola pestaña vacía): en ese caso quien llama BORRA la foto, para que una
 * venta cobrada no reaparezca al recargar.
 */
export function snapshotHeldTabs<T extends HeldTabShape<{ id: string; kind: string }>>(
  tabs: T[],
  activeTabId: string,
  now: Date,
): HeldTabsSnapshot<T> | null {
  if (tabs.length === 0) return null;
  if (tabs.length === 1 && tabs[0].cart.length === 0) return null;
  return {
    version: HELD_TABS_VERSION,
    savedAt: now.toISOString(),
    activeTabId: tabs.some((t) => t.id === activeTabId) ? activeTabId : tabs[0].id,
    tabs,
  };
}

/**
 * Reconciliación al restaurar:
 * - cada línea toma el ítem del catálogo ACTUAL (precio, stock, nombre de
 *   hoy); la que ya no existe —producto borrado o desactivado— se descarta;
 * - un cliente o un "Atendido por" que ya no está en las listas se suelta
 *   (queda en el valor por defecto), en vez de cobrar a nombre de un fantasma;
 * - una foto vieja, de otra versión o sin pestañas válidas no se restaura.
 *
 * Devuelve también cuántas líneas se perdieron, para avisarle al cajero.
 */
export function restoreHeldTabs<I extends { id: string; kind: string }, T extends HeldTabShape<I>>(
  snapshot: HeldTabsSnapshot<T> | null | undefined,
  options: {
    catalog: I[];
    customerIds: Set<string>;
    staffIds: Set<string>;
    now: Date;
  },
): { tabs: T[]; activeTabId: string; droppedLines: number } | null {
  if (!snapshot || snapshot.version !== HELD_TABS_VERSION || !Array.isArray(snapshot.tabs)) return null;
  const savedAt = Date.parse(snapshot.savedAt);
  if (!Number.isFinite(savedAt) || options.now.getTime() - savedAt > MAX_AGE_MS) return null;

  const byKey = new Map(options.catalog.map((item) => [`${item.kind}:${item.id}`, item]));
  let droppedLines = 0;
  const tabs = snapshot.tabs
    .filter((t) => t && typeof t.id === "string" && Array.isArray(t.cart))
    .map((tab) => {
      const cart = tab.cart.flatMap((line) => {
        const fresh = line?.item ? byKey.get(`${line.item.kind}:${line.item.id}`) : undefined;
        if (!fresh || !(line.quantity > 0)) {
          droppedLines += 1;
          return [];
        }
        const lineStaff = line.staffId && !options.staffIds.has(line.staffId) ? null : line.staffId;
        return [{ ...line, item: fresh, ...(line.staffId !== undefined ? { staffId: lineStaff } : {}) }];
      });
      return {
        ...tab,
        cart,
        customerId: tab.customerId && options.customerIds.has(tab.customerId) ? tab.customerId : null,
        staffId: tab.staffId && options.staffIds.has(tab.staffId) ? tab.staffId : null,
      } as T;
    });

  if (tabs.length === 0 || tabs.every((t) => t.cart.length === 0)) return null;
  const activeTabId = tabs.some((t) => t.id === snapshot.activeTabId) ? snapshot.activeTabId : tabs[0].id;
  return { tabs, activeTabId, droppedLines };
}

/** Unidades de una pestaña, para la etiqueta "N · $X". */
export function heldTabUnits(cart: { quantity: number }[]): number {
  return Math.round(cart.reduce((s, l) => s + (Number.isFinite(l.quantity) ? l.quantity : 0), 0) * 1000) / 1000;
}
