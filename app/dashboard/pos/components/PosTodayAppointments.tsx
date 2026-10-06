"use client";

import type { BillableAppointment } from "@/services/appointments.service";

/**
 * Citas de hoy sin cobrar, arriba del catálogo.
 *
 * En una barbería casi todo lo que se cobra ya estaba agendado: el cliente,
 * el servicio y el barbero están en la cita. Buscarlos de nuevo en el POS era
 * tres búsquedas para un dato que el sistema ya tenía. Un clic carga los tres
 * en el carrito; el cobro sigue siendo el de siempre (método, vuelto, recibo)
 * y al registrarse la venta la cita queda COMPLETADA sola.
 */
export function PosTodayAppointments({
  items,
  selectedId,
  onPick,
}: {
  items: BillableAppointment[];
  /** Cita que está cargada en el carrito de esta pestaña. */
  selectedId: string | null;
  onPick: (appointment: BillableAppointment) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Citas de hoy por cobrar" className="mb-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Citas de hoy por cobrar
        </h2>
        <span className="text-[11px] text-on-surface-variant">
          {items.length === 1 ? "1 cita" : `${items.length} citas`}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((a) => {
          const selected = a.id === selectedId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a)}
              aria-pressed={selected}
              className={`flex w-56 shrink-0 flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                selected
                  ? "border-primary bg-primary/10"
                  : "border-outline-variant/20 bg-surface-container hover:border-primary/40 hover:bg-surface-container-high"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-bold tabular-nums text-on-surface">
                  {a.start_time.slice(0, 5)}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                    a.status === "confirmed"
                      ? "bg-primary/10 text-primary"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {a.status === "confirmed" ? "Confirmada" : "Pendiente"}
                </span>
              </span>
              <span className="w-full truncate text-sm font-semibold text-on-surface">
                {a.customer_name ?? "Sin cliente"}
              </span>
              <span className="w-full truncate text-xs text-on-surface-variant">
                {[a.service_name, a.staff_name].filter(Boolean).join(" · ")}
              </span>
              <span className={`mt-1 text-xs font-bold ${selected ? "text-primary" : "text-emerald-600"}`}>
                {selected ? "En el carrito" : "Cobrar →"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
