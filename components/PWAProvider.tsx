"use client";

import { useEffect } from "react";

/**
 * Registra el service worker. Solo en producción: en desarrollo cachearía los
 * bundles de Turbopack y rompería el hot reload.
 */
export function PWAProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

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
