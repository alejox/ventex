"use client";

import { useEffect, useState } from "react";
import { fetchStaffSales, commissionPeriodOf } from "@/services/staff.service";
import type { CommissionSettlement, StaffSaleItem } from "@/services/staff.service";
import { useProfile } from "@/components/ProfileProvider";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Datáfono / Tarjeta",
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

interface Props {
  settlement: CommissionSettlement;
  onClose: () => void;
}

/**
 * Comprobante de una liquidación ya hecha. Imprimible.
 *
 * El detalle NO se guarda duplicado en ninguna tabla: se relee de las mismas
 * `sale_items` que quedaron estampadas con el id de esta liquidación. Por eso
 * la suma del detalle SIEMPRE es igual al total del encabezado y al monto del
 * gasto — son la misma información leída una vez, no tres copias que puedan
 * desincronizarse.
 */
export function CommissionReceiptModal({ settlement, onClose }: Props) {
  const profile = useProfile();
  const [items, setItems] = useState<StaffSaleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // El período de la liquidación, ensanchado por sus dos puntas: si una venta
    // se anuló después de pagarla, `fetchStaffSales` ya no la trae, y el detalle
    // mostraría menos de lo que se pagó. Por eso el aviso de inconsistencia va
    // aparte y no se intenta "arreglar" el número.
    fetchStaffSales(settlement.staff_id, commissionPeriodOf(settlement.period_from, settlement.period_to))
      .then((rows) => {
        if (!cancelled) setItems(rows.filter((r) => r.settlementId === settlement.id));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settlement.id, settlement.staff_id, settlement.period_from, settlement.period_to]);

  const detailTotal = items.reduce((sum, i) => sum + i.commissionAmount, 0);
  // Si el detalle legible no llega al total pagado es porque parte de esas
  // ventas se anularon después. Se DICE, no se maquilla.
  const missing = Math.round((settlement.total_amount - detailTotal) * 100) / 100;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 print:static print:bg-transparent print:p-0 print:block">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            @page { margin: 14mm; size: A4; }
            body > *:not(.commission-print-root) { display: none !important; }
            .commission-print-root { position: static !important; }
            [data-sonner-toaster] { display: none !important; }
          }
        `,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        className="commission-print-root bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92dvh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col print:max-h-none print:border-0 print:shadow-none print:rounded-none print:bg-white print:text-black"
      >
        <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-start gap-4 bg-surface-container-low shrink-0 print:hidden">
          <h2 id="receipt-title" className="text-lg sm:text-xl font-bold text-on-surface">
            Comprobante de liquidación
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 print:overflow-visible">
          <div className="text-center space-y-1 pb-5 border-b border-outline-variant/15 print:border-black">
            <h1 className="text-xl font-bold text-on-surface print:text-black">
              {profile?.businessName || "Mi Negocio"}
            </h1>
            <p className="text-sm text-on-surface-variant print:text-black">Comprobante de comisión</p>
            {settlement.status === "void" && (
              <p className="inline-block mt-2 px-3 py-1 rounded-lg text-xs font-bold bg-error-container/20 text-error-dim border border-error-container/30">
                ANULADA
              </p>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant print:text-black">Colaborador</dt>
              <dd className="font-bold text-on-surface print:text-black mt-0.5">{settlement.staff_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant print:text-black">Fecha de pago</dt>
              <dd className="font-bold text-on-surface print:text-black mt-0.5">{shortDate(settlement.paid_on)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant print:text-black">Período</dt>
              <dd className="text-on-surface print:text-black mt-0.5">
                {shortDate(settlement.period_from)} al {shortDate(settlement.period_to)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant print:text-black">Método de pago</dt>
              <dd className="text-on-surface print:text-black mt-0.5">
                {PAYMENT_LABELS[settlement.payment_method] ?? settlement.payment_method}
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="text-sm font-bold text-on-surface print:text-black mb-2">
              Detalle ({settlement.items_count} línea{settlement.items_count !== 1 ? "s" : ""})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[420px]">
                <thead>
                  <tr className="border-b border-outline-variant/20 print:border-black text-xs uppercase tracking-wide text-on-surface-variant print:text-black text-left">
                    <th className="py-2 pr-3 font-bold">Fecha</th>
                    <th className="py-2 pr-3 font-bold">Concepto</th>
                    <th className="py-2 pr-3 font-bold text-center">Cant.</th>
                    <th className="py-2 pr-3 font-bold text-right">Venta</th>
                    <th className="py-2 font-bold text-right">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {loading ? (
                    <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">Cargando…</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">Sin detalle legible.</td></tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="text-on-surface print:text-black">
                        <td className="py-2 pr-3 whitespace-nowrap text-on-surface-variant print:text-black">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })
                            : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-medium">{item.product_name}</span>
                          <span className="block text-xs text-on-surface-variant print:text-black">
                            #{item.sale_number}{item.customer_name ? ` · ${item.customer_name}` : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-center tabular-nums">{item.quantity}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-on-surface-variant print:text-black">
                          ${money(item.line_total)}
                        </td>
                        <td className="py-2 text-right tabular-nums font-semibold">${money(item.commissionAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  {missing > 0 && (
                    <tr>
                      <td colSpan={4} className="pt-3 pr-3 text-right text-on-surface-variant print:text-black">
                        Ventas anuladas después del pago
                      </td>
                      <td className="pt-3 text-right tabular-nums text-on-surface-variant print:text-black">
                        ${money(missing)}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-outline-variant/30 print:border-black">
                    <td colSpan={4} className="pt-3 pr-3 text-right font-bold text-on-surface print:text-black">
                      Total pagado
                    </td>
                    <td className="pt-3 text-right text-lg font-bold tabular-nums text-on-surface print:text-black">
                      ${money(settlement.total_amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {settlement.voidedSalesCount > 0 && (
            <div role="alert" className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-4 py-3 text-sm text-on-surface print:text-black">
              <strong className="font-bold">Atención:</strong> {settlement.voidedSalesCount} venta
              {settlement.voidedSalesCount !== 1 ? "s" : ""} de esta liquidación se anuló después de
              haberse pagado. La comisión ya salió de la caja: revisá si corresponde descontarla en la
              próxima liquidación.
            </div>
          )}

          <p className="text-xs text-on-surface-variant print:text-black pt-4 border-t border-outline-variant/15 print:border-black">
            Emitido el{" "}
            {new Date(settlement.created_at).toLocaleString("es-CO", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
            {settlement.expense_id ? " · Registrado en Gastos, categoría Comisiones" : " · Sin gasto asociado (liquidación anulada)"}
            {settlement.cash_movement_id ? " · Descontado del arqueo del turno" : ""}
          </p>
        </div>

        <div className="p-4 sm:p-6 border-t border-outline-variant/10 flex flex-col sm:flex-row gap-3 shrink-0 bg-surface-container print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary transition-colors"
          >
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
