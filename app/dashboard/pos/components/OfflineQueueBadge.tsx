"use client";

import { usePosStore } from "@/stores/pos.store";

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
