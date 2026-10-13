"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado de conectividad del navegador, reactivo.
 *
 * Usa `useSyncExternalStore` con un snapshot de servidor fijo en `true`: React
 * hidrata con ese valor y recién después pasa al real del navegador, así que
 * el HTML del servidor y el primer render del cliente siempre coinciden — aun
 * cuando el POS se abre de verdad sin conexión.
 *
 * Se usa para gatear el canje de puntos de fidelización en el POS (ver
 * `app/dashboard/pos/page.tsx`): a diferencia de una venta, que se encola y se
 * reenvía sola, un canje necesita el `sale_id` que solo existe una vez que el
 * servidor confirmó la venta — encolarlo también implicaría inventar un canje
 * diferido, que es justo lo que la fase 2 de puntos decidió no hacer.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Solo un `onLine === false` explícito es "sin conexión". Node >= 21 expone un
 * `navigator` global SIN `onLine`: leerlo como falsy pintaba el aviso de
 * "Sin conexión" en el HTML del servidor y rompía la hidratación del POS.
 */
export function onlineFrom(nav: { onLine?: boolean } | undefined): boolean {
  return nav?.onLine !== false;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return onlineFrom(typeof navigator === "undefined" ? undefined : navigator);
}

function getServerSnapshot(): boolean {
  return true;
}
