"use client";

import { useEffect, useState } from "react";
import { usePosStore } from "@/stores/pos.store";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Bandeja de ventas que se cobraron pero el servidor no aceptó.
 *
 * No es una lista de errores del sistema: cada fila es plata que está en el
 * cajón y no figura en ningún reporte. Por eso el copy habla de cuadrar la caja
 * y no de "reintentar la operación", y por eso descartar pide confirmación —
 * borrar la fila borra la única constancia de que esa venta existió.
 */
export function RejectedSalesModal({ onClose }: { onClose: () => void }) {
  const fmtMoney = useFormatMoney();
  const rejectedList = usePosStore((s) => s.rejectedList);
  const loadRejectedSales = usePosStore((s) => s.loadRejectedSales);
  const retryRejectedSale = usePosStore((s) => s.retryRejectedSale);
  const discardRejectedSale = usePosStore((s) => s.discardRejectedSale);

  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  useEffect(() => {
    void loadRejectedSales();
  }, [loadRejectedSales]);

  const conBloqueo = async (id: string, fn: () => Promise<void>) => {
    setTrabajando(id);
    try {
      await fn();
    } finally {
      setTrabajando(null);
      setConfirmando(null);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!trabajando) onClose();
      }}
      title="Ventas cobradas que no se registraron"
      description="Este dinero entró a la caja pero el servidor no aceptó la venta. Revisa cada una antes de cerrar el turno."
      className="max-h-[85vh]"
      bodyClassName="border-t border-outline-variant/15"
      footerClassName=""
      footer={
        <div className="p-4 border-t border-outline-variant/15">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
          >
            Cerrar
          </button>
        </div>
      }
    >
        <div className="p-4 space-y-3">
          {rejectedList.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">
              No quedó ninguna venta sin registrar.
            </p>
          )}

          {rejectedList.map((venta) => {
            const ocupada = trabajando === venta.clientSaleId;
            return (
              <div
                key={venta.clientSaleId}
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-bold text-on-surface tabular-nums">
                    {fmtMoney(venta.total)}
                  </span>
                  <span className="text-[12px] text-on-surface-variant">
                    {cuando(venta.queuedAt)}
                  </span>
                </div>

                <p className="text-[13px] text-on-surface-variant mt-1">
                  {venta.input.items.length}{" "}
                  {venta.input.items.length === 1 ? "ítem" : "ítems"} · {venta.input.paymentMethod}
                </p>

                <p className="text-[13px] text-error mt-2 break-words">
                  {venta.rejectedReason ?? "El servidor rechazó la venta."}
                </p>

                {confirmando === venta.clientSaleId ? (
                  <div className="mt-3 rounded-lg bg-error/5 border border-error/20 p-3">
                    <p className="text-[13px] text-on-surface">
                      Al descartarla se borra de este dispositivo y no queda ninguna constancia
                      de la venta. ¿Seguro?
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        disabled={ocupada}
                        onClick={() =>
                          conBloqueo(venta.clientSaleId, () =>
                            discardRejectedSale(venta.clientSaleId),
                          )
                        }
                        className="flex-1 py-2 rounded-lg bg-error text-white text-[13px] font-semibold disabled:opacity-50"
                      >
                        Sí, descartar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmando(null)}
                        className="flex-1 py-2 rounded-lg border border-outline-variant/30 text-on-surface text-[13px] font-semibold"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={ocupada}
                      onClick={() =>
                        conBloqueo(venta.clientSaleId, () => retryRejectedSale(venta.clientSaleId))
                      }
                      className="flex-1 py-2 rounded-lg bg-primary text-on-primary text-[13px] font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50"
                    >
                      {ocupada ? "Intentando…" : "Intentar de nuevo"}
                    </button>
                    <button
                      type="button"
                      disabled={ocupada}
                      onClick={() => setConfirmando(venta.clientSaleId)}
                      className="py-2 px-3 rounded-lg border border-outline-variant/30 text-on-surface-variant text-[13px] font-semibold hover:bg-surface-container transition-colors disabled:opacity-50"
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

    </Modal>
  );
}
