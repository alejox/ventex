import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePosStore } from "@/stores/pos.store";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";

function IconReceipt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconPrinter(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.728 6.75H17.27m-10.543 0L5.43 3.656A1.125 1.125 0 016.425 3h11.15a1.125 1.125 0 01.995.656l-1.298 3.094m-10.543 0h10.543m-10.543 0v4.5m10.543-4.5v4.5m-10.543 4.5h10.543M6.728 15.75v4.125A1.125 1.125 0 007.853 21h8.294a1.125 1.125 0 001.125-1.125V15.75m-10.543 0L5.43 12.656A1.125 1.125 0 016.425 12h11.15a1.125 1.125 0 01.995.656l-1.298 3.094" />
    </svg>
  );
}

interface RecentSalesModalProps {
  onClose: () => void;
  /**
   * Reimprime el comprobante de esa venta (C7). Lo resuelve la pantalla que
   * abre el panel, porque es la que tiene el recibo montado y los datos del
   * negocio. Rechaza si no se pudo leer la venta.
   */
  onReprint: (saleId: string) => Promise<void>;
}

export function RecentSalesModal({ onClose, onReprint }: RecentSalesModalProps) {
  const fmtMoney = useFormatMoney();
  const sales = usePosStore((s) => s.recentSales);
  const loading = usePosStore((s) => s.recentSalesLoading);
  const fetchRecentSales = usePosStore((s) => s.fetchRecentSales);
  /** La venta cuyo comprobante se está armando, para el spinner de su fila. */
  const [printingId, setPrintingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchRecentSales();
  }, [fetchRecentSales]);

  const reprint = (saleId: string) => {
    if (printingId) return;
    setPrintingId(saleId);
    void onReprint(saleId).finally(() => setPrintingId(null));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Ventas recientes"
      icon={
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary-ink flex items-center justify-center">
          <IconReceipt className="w-5 h-5" />
        </div>
      }
      placement="right"
      className="max-w-md!"
      bodyClassName="flex flex-col border-t border-outline-variant/10"
    >
        <div className="flex-1 overflow-y-auto p-6">
          {loading && sales.length === 0 ? (
            <div className="flex justify-center p-8">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <p className="text-center text-on-surface-variant">No hay ventas recientes.</p>
          ) : (
            <div className="overflow-hidden border border-outline-variant/20 rounded-xl">
              <table className="w-full text-left text-sm text-on-surface">
                <thead className="bg-surface-container-lowest border-b border-outline-variant/20">
                  <tr>
                    <th className="p-3 font-medium text-on-surface-variant">Venta</th>
                    <th className="p-3 font-medium text-on-surface-variant">Total</th>
                    <th className="p-3 font-medium text-on-surface-variant">Estado</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {sales.map((sale) => {
                    const voided = sale.status === "void";
                    return (
                    <tr key={sale.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-3">Venta #{sale.sale_number}</td>
                      <td className={`p-3 font-medium tabular-nums ${voided ? "line-through text-on-surface-variant" : ""}`}>
                        {fmtMoney(sale.total)}
                      </td>
                      <td className="p-3 text-xs">
                        {voided ? (
                          <span className="inline-flex items-center rounded-full bg-error/10 px-2 py-0.5 font-semibold text-error">
                            Anulada
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">
                            {sale.status === "completed" ? "Completada" : "Pendiente"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => reprint(sale.id)}
                          disabled={printingId !== null}
                          aria-label={`Reimprimir comprobante de la venta #${sale.sale_number}`}
                          title="Reimprimir comprobante"
                          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {printingId === sale.id ? (
                            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          ) : (
                            <IconPrinter className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-outline-variant/10 text-right">
          <Link
            href="/dashboard/sales"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-6 py-3 border border-outline-variant/30 rounded-xl text-on-surface hover:bg-surface-container-highest transition-colors font-medium"
          >
            Ir al historial de ventas
            <span>→</span>
          </Link>
        </div>
    </Modal>
  );
}
