"use client";

import { useEffect } from "react";
import { usePosStore } from "@/stores/pos.store";

/**
 * Cada cuánto se reintenta mientras queden ventas sin enviar.
 *
 * 30s y no 5s: el evento `online` ya cubre la vuelta de la conexión: esto es
 * solo la red de contención para cuando el navegador dice que hay internet y en
 * realidad no llega a Supabase (el wifi del local conectado sin salida, el caso
 * más común de todos).
 */
const REINTENTO_MS = 30_000;

/**
 * Drena la cola de ventas sin conexión mientras el POS esté abierto.
 *
 * Tres disparadores, porque ninguno alcanza solo:
 *
 * - `online`: la señal buena, pero el navegador la da apenas hay interfaz de
 *   red, no cuando Supabase vuelve a contestar.
 * - volver a la pestaña: el cajero apagó y prendió el router y volvió al POS
 *   sin que se disparara nada.
 * - intervalo: el wifi que figura conectado pero no sale a internet. Sin esto
 *   las ventas se quedan quietas hasta el próximo cobro.
 */
export function useOfflineSync() {
  const syncPendingSales = usePosStore((s) => s.syncPendingSales);
  const refreshPendingSales = usePosStore((s) => s.refreshPendingSales);

  useEffect(() => {
    let vivo = true;

    const intentar = () => {
      if (!vivo) return;
      void syncPendingSales();
    };

    // Al montar: puede haber quedado algo de la sesión anterior en el equipo.
    void refreshPendingSales().then(intentar);

    const alVolverALaPestana = () => {
      if (document.visibilityState === "visible") intentar();
    };

    window.addEventListener("online", intentar);
    document.addEventListener("visibilitychange", alVolverALaPestana);
    const timer = window.setInterval(intentar, REINTENTO_MS);

    return () => {
      vivo = false;
      window.removeEventListener("online", intentar);
      document.removeEventListener("visibilitychange", alVolverALaPestana);
      window.clearInterval(timer);
    };
  }, [syncPendingSales, refreshPendingSales]);
}
