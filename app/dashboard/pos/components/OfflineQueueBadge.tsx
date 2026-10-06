"use client";

import { usePosStore } from "@/stores/pos.store";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

/**
 * Aviso PERMANENTE mientras no hay red (C15). A diferencia del contador de
 * abajo, este sí está siempre que corresponde: vender sin conexión es normal
 * (la venta se encola), pero el cajero tiene que saberlo ANTES de cobrar —no
 * enterarse por el modal de éxito— porque cambia lo que puede prometer: sin
 * número de venta del servidor y sin canje de puntos.
 */
export function OfflineChip() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 text-sm font-semibold backdrop-blur-sm"
    >
      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
        <path d="M1 1l22 22" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <path d="M12 20h.01" />
      </svg>
      <span>Sin conexión: las ventas se guardan en este equipo</span>
    </div>
  );
}

/**
 * Estado de la cola de ventas sin conexión.
 *
 * Solo aparece cuando hay algo que decir. Un indicador permanente en verde
 * ("todo sincronizado") se vuelve parte del fondo en dos días y deja de
 * mirarse justo el día que hay que mirarlo.
 *
 * Dos estados y son muy distintos entre sí:
 *
 * - **Pendientes** (ámbar): se envían solas, el cajero no tiene que hacer nada.
 * - **Rechazadas** (rojo): plata que entró al cajón y NO quedó registrada.
 *   Nadie las va a resolver salvo que alguien las mire, así que se muestran
 *   aunque haya cero pendientes y no se pueden descartar con un clic distraído.
 */
export function OfflineQueueBadge({ onVerRechazadas }: { onVerRechazadas: () => void }) {
  const pendingSales = usePosStore((s) => s.pendingSales);
  const rejectedSales = usePosStore((s) => s.rejectedSales);
  const syncing = usePosStore((s) => s.syncing);

  if (pendingSales === 0 && rejectedSales === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {pendingSales > 0 && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-[#f59e0b]/10 text-[#b45309] dark:text-[#fbbf24] border border-[#f59e0b]/30 px-2.5 py-1 text-[12px] font-semibold"
          title="Ventas cobradas sin conexión. Se envían solas cuando vuelva internet."
        >
          <span
            className={`w-1.5 h-1.5 rounded-full bg-current ${syncing ? "animate-pulse" : ""}`}
            aria-hidden
          />
          {syncing
            ? "Enviando ventas…"
            : `${pendingSales} ${pendingSales === 1 ? "venta sin enviar" : "ventas sin enviar"}`}
        </span>
      )}

      {rejectedSales > 0 && (
        <button
          type="button"
          onClick={onVerRechazadas}
          className="inline-flex items-center gap-1.5 rounded-full bg-error/10 text-error border border-error/30 px-2.5 py-1 text-[12px] font-semibold hover:bg-error/20 transition-colors"
        >
          {rejectedSales} {rejectedSales === 1 ? "venta sin registrar" : "ventas sin registrar"}
        </button>
      )}
    </div>
  );
}
