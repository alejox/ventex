"use client";

import { useEffect, useState } from "react";

/**
 * Estado de conectividad del navegador, reactivo.
 *
 * Lee `navigator.onLine` en el inicializador del estado (no en un efecto): en
 * SSR, donde `navigator` no existe, arranca en `true` para no bloquear un
 * control sin necesidad antes de que el navegador real conteste.
 *
 * Se usa para gatear el canje de puntos de fidelización en el POS (ver
 * `app/dashboard/pos/page.tsx`): a diferencia de una venta, que se encola y se
 * reenvía sola, un canje necesita el `sale_id` que solo existe una vez que el
 * servidor confirmó la venta — encolarlo también implicaría inventar un canje
 * diferido, que es justo lo que la fase 2 de puntos decidió no hacer.
 */
export function useOnlineStatus(): boolean {
  // Inicializador perezoso, no un `setState` en el cuerpo del efecto: leer
  // `navigator.onLine` ahí violaría `react-hooks/set-state-in-effect` (el
  // efecto de abajo es solo para SUSCRIBIRSE a los eventos, no para fijar el
  // valor inicial). `typeof navigator === "undefined"` cubre el render de
  // servidor, donde no existe.
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const marcarOnline = () => setOnline(true);
    const marcarOffline = () => setOnline(false);
    window.addEventListener("online", marcarOnline);
    window.addEventListener("offline", marcarOffline);
    return () => {
      window.removeEventListener("online", marcarOnline);
      window.removeEventListener("offline", marcarOffline);
    };
  }, []);

  return online;
}
