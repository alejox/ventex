"use client";

import { useSyncExternalStore } from "react";

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
  window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
}
