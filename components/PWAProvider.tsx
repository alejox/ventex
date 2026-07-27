"use client";

import { useEffect } from "react";

/**
 * Registra el service worker. Solo en producción: en desarrollo cachearía los
 * bundles de Turbopack y rompería el hot reload.
 *
 * En desarrollo, además, DESREGISTRA cualquiera que haya quedado vivo. No basta
 * con no registrar: un service worker instalado en una corrida de producción
 * sigue controlando el mismo origen (localhost) cuando se vuelve a `next dev`,
 * y su regla cache-first sobre `/_next/static/**` fija los chunks de Turbopack
 * —que a diferencia de los de producción NO llevan hash en el nombre— hasta que
 * alguien borre el caché a mano. El síntoma es desconcertante: la UI sigue
 * mostrando código viejo, el hard reload no alcanza, y React tira hydration
 * mismatch porque el servidor manda lo nuevo y el cliente ejecuta lo viejo.
 */
export function PWAProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .catch(() => {
          // Sin permisos o sin SW previo: no hay nada que limpiar.
        });

      // Los cachés sobreviven al unregister, así que se borran aparte. Solo los
      // propios: el prefijo evita tocar cachés de otra app en localhost.
      if (typeof caches !== "undefined") {
        caches
          .keys()
          .then((keys) =>
            Promise.all(keys.filter((k) => k.startsWith("ventex-")).map((k) => caches.delete(k))),
          )
          .catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Un registro fallido no puede tumbar la app: sin service worker
        // Ventex sigue funcionando, solo pierde la pantalla sin conexión.
      });
    };

    // Tras `load` para no competir por ancho de banda con el primer render.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
