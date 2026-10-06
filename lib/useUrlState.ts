"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Lectura de estado que vive FUERA de React —la query string y
 * `localStorage`— sin romper la hidratación.
 *
 * El problema que resuelve: la landing es estática (ISR) y el panel se
 * pre-renderiza, así que el HTML del servidor no puede conocer el `?pay=` con el
 * que vuelve el checkout. Las dos salidas obvias fallan:
 *
 *  - Inicializar `useState` leyendo `window` da un primer render del cliente
 *    distinto al HTML del servidor: error de hidratación.
 *  - Leerlo en un `useEffect` y hacer `setState` provoca renders en cascada
 *    (`react-hooks/set-state-in-effect`).
 *
 * `useSyncExternalStore` es el mecanismo previsto para esto: React usa
 * `getServerSnapshot` mientras hidrata y recién después toma el valor real del
 * cliente. El `subscribe` es vacío a propósito: ni la URL de entrada ni el
 * correo guardado cambian solos durante la vida de la pantalla.
 *
 * Los snapshots devuelven primitivas (string | null | boolean), así que la
 * comparación por `Object.is` de React es estable y no hay bucle de renders.
 */

/** Nada a lo que suscribirse: estos valores no cambian por su cuenta. */
const NEVER_CHANGES = () => () => {};

/** Parámetro de la query string. `null` durante el render del servidor. */
export function useSearchParam(name: string): string | null {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}

/** Valor de `localStorage`. `null` en el servidor y si el storage está bloqueado. */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Modo privado o storage lleno: se comporta como si no hubiera valor.
        return null;
      }
    },
    () => null,
  );
}

/**
 * Quita parámetros de la URL sin recargar ni volver a montar la pantalla.
 * Se usa al cerrar el modal de pago: el `?pay=` ya cumplió su función y no tiene
 * que quedar en el historial ni reaparecer al refrescar.
 */
export function stripSearchParams(...names: string[]): void {
  if (typeof window === "undefined" || !window.history.replaceState) return;
  const params = new URLSearchParams(window.location.search);
  let touched = false;
  for (const name of names) {
    if (params.has(name)) {
      params.delete(name);
      touched = true;
    }
  }
  if (!touched) return;
  const query = params.toString();
  // `null` y no `{}`: es la forma que documenta Next para que el cambio se
  // integre con su router en vez de pisarle el estado interno.
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
  notifyUrlChange();
}

/* -------------------------------------------------------------------------- */
/* Estado de pantalla en la URL                                               */
/* -------------------------------------------------------------------------- */

/**
 * Por qué búsqueda, filtros, orden y página viven en la query string: volver de
 * editar un producto tiene que dejarte DONDE ESTABAS. Con `useState`, el viaje
 * a `/dashboard/inventory/product?id=…` desmonta la lista y al volver arranca de
 * cero —página 1, sin búsqueda—, y el dueño que estaba corrigiendo precios uno
 * por uno tiene que volver a buscar cada vez. En la URL, además, el estado
 * sobrevive a un refresco y se puede compartir.
 *
 * Se escribe con `replaceState` y no `pushState`: cada tecla del buscador no es
 * un paso al que volver con "Atrás".
 */

/** Evento propio: `replaceState` no dispara `popstate`, así que avisamos a mano. */
const URL_CHANGE_EVENT = "ventex:url-state";

function notifyUrlChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(URL_CHANGE_EVENT));
}

function subscribeUrl(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(URL_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(URL_CHANGE_EVENT, callback);
  };
}

const currentSearch = () => window.location.search;
const serverSearch = () => "";

/**
 * Lee de `search` los parámetros declarados en `defaults`. Lo ausente (o vacío)
 * toma el valor por defecto. Pura: se testea sin navegador.
 */
export function readUrlParams<T extends Record<string, string>>(search: string, defaults: T): T {
  const params = new URLSearchParams(search);
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = params.get(key);
    if (value !== null && value !== "") out[key] = value as T[typeof key];
  }
  return out;
}

/**
 * Aplica `patch` sobre `search` y devuelve la query nueva (sin `?`).
 *
 * Un valor igual a su default SE BORRA: la URL de la pantalla recién abierta
 * queda limpia (`/dashboard/customers`, no `?q=&page=1&sort=`), y dos URLs que
 * muestran lo mismo son la misma URL. Los parámetros ajenos se respetan.
 */
export function writeUrlParams(
  search: string,
  patch: Record<string, string | number | null | undefined>,
  defaults: Record<string, string> = {},
): string {
  const params = new URLSearchParams(search);
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw == null ? "" : String(raw);
    if (value === "" || value === defaults[key]) params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}

/** Escribe parámetros en la URL actual sin navegar ni volver a montar. */
export function setUrlParams(
  patch: Record<string, string | number | null | undefined>,
  defaults: Record<string, string> = {},
): void {
  if (typeof window === "undefined" || !window.history.replaceState) return;
  const query = writeUrlParams(window.location.search, patch, defaults);
  const next = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
  if (next === window.location.pathname + window.location.search + window.location.hash) return;
  window.history.replaceState(null, "", next);
  notifyUrlChange();
}

/**
 * Varios parámetros de la URL como un objeto, con su setter.
 *
 * Durante la hidratación devuelve `defaults` (el servidor no ve la query) y
 * enseguida el valor real: mismo mecanismo que `useSearchParam`, pero esta vez
 * suscrito, porque la propia pantalla la cambia.
 *
 * ```ts
 * const [filters, setFilters] = useUrlParams({ q: "", status: "active" });
 * setFilters({ q: "ana" });
 * ```
 */
export function useUrlParams<T extends Record<string, string>>(
  defaults: T,
): [T, (patch: Partial<Record<keyof T, string | number | null>>) => void] {
  const search = useSyncExternalStore(subscribeUrl, currentSearch, serverSearch);
  // `defaults` suele llegar como literal nuevo en cada render: se serializa
  // para que el memo dependa de su CONTENIDO y no de su identidad.
  const defaultsKey = JSON.stringify(defaults);
  const values = useMemo(
    () => readUrlParams(search, JSON.parse(defaultsKey) as T),
    [search, defaultsKey],
  );
  const set = useCallback(
    (patch: Partial<Record<keyof T, string | number | null>>) =>
      setUrlParams(patch as Record<string, string | number | null>, JSON.parse(defaultsKey)),
    [defaultsKey],
  );
  return [values, set];
}

/** Un solo parámetro de la URL, con su setter. */
export function useUrlState(
  name: string,
  defaultValue = "",
): [string, (value: string | number | null) => void] {
  const [values, set] = useUrlParams({ [name]: defaultValue });
  const setOne = useCallback((value: string | number | null) => set({ [name]: value }), [set, name]);
  return [values[name], setOne];
}

/* -------------------------------------------------------------------------- */
/* Estado de una tabla                                                        */
/* -------------------------------------------------------------------------- */

export type SortDir = "asc" | "desc";

/** Lo que una lista necesita recordar: búsqueda, orden y página. */
export interface TableState {
  q: string;
  sort: string | null;
  dir: SortDir;
  page: number;
  size: number;
}

export const DEFAULT_TABLE_STATE: TableState = { q: "", sort: null, dir: "asc", page: 1, size: 10 };

/** Prefijo opcional: dos tablas en la misma pantalla no se pisan los parámetros. */
const tableKeys = (prefix: string) => ({
  q: `${prefix}q`,
  sort: `${prefix}sort`,
  dir: `${prefix}dir`,
  page: `${prefix}page`,
  size: `${prefix}size`,
});

/**
 * Convierte los parámetros crudos en un `TableState` válido. Un `page=abc` o un
 * `size=-3` pegado a mano no rompe la tabla: cae al default.
 */
export function parseTableState(
  raw: Record<string, string>,
  prefix = "",
  defaults: TableState = DEFAULT_TABLE_STATE,
): TableState {
  const k = tableKeys(prefix);
  const page = Number.parseInt(raw[k.page] ?? "", 10);
  const size = Number.parseInt(raw[k.size] ?? "", 10);
  const dir = raw[k.dir];
  return {
    q: raw[k.q] ?? defaults.q,
    sort: raw[k.sort] ? raw[k.sort] : defaults.sort,
    dir: dir === "asc" || dir === "desc" ? dir : defaults.dir,
    page: Number.isFinite(page) && page >= 1 ? page : defaults.page,
    size: Number.isFinite(size) && size >= 1 && size <= 500 ? size : defaults.size,
  };
}

function tableDefaultsAsParams(prefix: string, defaults: TableState): Record<string, string> {
  const k = tableKeys(prefix);
  return {
    [k.q]: defaults.q,
    [k.sort]: defaults.sort ?? "",
    [k.dir]: defaults.dir,
    [k.page]: String(defaults.page),
    [k.size]: String(defaults.size),
  };
}

/**
 * Estado de tabla guardado en la URL, listo para pasarle a `<DataTable>`:
 *
 * ```tsx
 * const table = useTableUrlState();
 * <DataTable state={table.state} onStateChange={table.setState} … />
 * ```
 *
 * Cambiar la búsqueda o el orden vuelve a la página 1 (lo que buscabas puede no
 * estar en la página en la que estabas); eso lo resuelve `DataTable`.
 */
export function useTableUrlState(
  prefix = "",
  overrides: Partial<TableState> = {},
): { state: TableState; setState: (patch: Partial<TableState>) => void } {
  const defaults: TableState = { ...DEFAULT_TABLE_STATE, ...overrides };
  const [raw, setRaw] = useUrlParams(tableDefaultsAsParams(prefix, defaults));
  const state = parseTableState(raw, prefix, defaults);
  const setState = useCallback(
    (patch: Partial<TableState>) => {
      const k = tableKeys(prefix);
      const out: Record<string, string | null> = {};
      if ("q" in patch) out[k.q] = patch.q ?? "";
      if ("sort" in patch) out[k.sort] = patch.sort ?? "";
      if ("dir" in patch) out[k.dir] = patch.dir ?? null;
      if ("page" in patch) out[k.page] = patch.page != null ? String(patch.page) : null;
      if ("size" in patch) out[k.size] = patch.size != null ? String(patch.size) : null;
      setRaw(out);
    },
    [setRaw, prefix],
  );
  return { state, setState };
}

/**
 * La ruta actual con su query, reactiva a los cambios de estado de la URL.
 * Sirve como `back=` al ir a un formulario: al guardar o cancelar, el
 * formulario vuelve ahí (validado con `isSafeNext`) y la lista sigue en la
 * misma búsqueda, filtro y página.
 */
export function useCurrentPathWithSearch(pathname: string): string {
  const search = useSyncExternalStore(subscribeUrl, currentSearch, serverSearch);
  return search ? `${pathname}${search}` : pathname;
}

/**
 * `href` con `back=<ruta>` agregado. Si `back` es solo la ruta pelada no se
 * agrega nada: volver ahí es lo mismo que el default del formulario.
 */
export function withBackParam(href: string, back: string, plainPath?: string): string {
  if (!back || back === plainPath) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}back=${encodeURIComponent(back)}`;
}
