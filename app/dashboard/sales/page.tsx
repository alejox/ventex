"use client";

import { useEffect, useMemo } from "react";
import { IconShoppingCart, IconWallet, IconTrendingUp } from "@/app/assets/icons/DashboardIcons";
import { useSalesStore } from "@/stores/sales.store";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20",
  refunded: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  void: "bg-error-container/20 text-error-dim border-error-container/30",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completada",
  refunded: "Reembolsada",
  void: "Anulada",
};

export default function SalesPage() {
  const sales = useSalesStore((s) => s.sales);
  const loading = useSalesStore((s) => s.loading);
  const error = useSalesStore((s) => s.error);
  const detail = useSalesStore((s) => s.detail);
  const detailLoading = useSalesStore((s) => s.detailLoading);
  const fetchSales = useSalesStore((s) => s.fetchSales);
  const openDetail = useSalesStore((s) => s.openDetail);
  const closeDetail = useSalesStore((s) => s.closeDetail);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const stats = useMemo(() => {
    const completed = sales.filter((s) => s.status === "completed");
    const revenue = completed.reduce((sum, s) => sum + s.total, 0);
    return {
      count: sales.length,
      revenue,
      avgTicket: completed.length > 0 ? revenue / completed.length : 0,
    };
  }, [sales]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Historial de Ventas</h1>
          <p className="text-sm text-on-surface-variant mt-1">Consulta las ventas registradas desde el punto de venta.</p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex justify-between items-center">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">Ventas</p>
            <h3 className="text-3xl font-bold text-on-surface">{stats.count}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <IconShoppingCart className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex justify-between items-center">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">Ingresos (completadas)</p>
            <h3 className="text-3xl font-bold text-on-surface">${money(stats.revenue)}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#10b981]/10 text-[#10b981] flex items-center justify-center">
            <IconWallet className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex justify-between items-center">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">Ticket promedio</p>
            <h3 className="text-3xl font-bold text-on-surface">${money(stats.avgTicket)}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] flex items-center justify-center">
            <IconTrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        {error && (
          <div className="m-5 rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                <th className="p-4 pl-6">N.º</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Cliente</th>
                <th className="p-4 text-center">Artículos</th>
                <th className="p-4">Pago</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface-variant">Cargando ventas…</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                    Aún no hay ventas. Registra una desde el Punto de Venta.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => openDetail(sale.id)}
                    className="hover:bg-surface-container-lowest transition-colors cursor-pointer"
                  >
                    <td className="p-4 pl-6 font-mono text-xs text-on-surface-variant">#{sale.sale_number}</td>
                    <td className="p-4 text-on-surface-variant">{formatDate(sale.created_at)}</td>
                    <td className="p-4 font-medium text-on-surface">{sale.customer_name ?? "De Paso"}</td>
                    <td className="p-4 text-center text-on-surface-variant">{sale.item_count}</td>
                    <td className="p-4 text-on-surface-variant">{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</td>
                    <td className="p-4 text-right font-bold text-on-surface">${money(sale.total)}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${STATUS_STYLES[sale.status] ?? ""}`}>
                        {STATUS_LABELS[sale.status] ?? sale.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de detalle */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-3xl w-full max-w-lg border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <div>
                <h2 className="text-xl font-bold text-on-surface">
                  {detail ? `Venta #${detail.sale_number}` : "Cargando…"}
                </h2>
                {detail && (
                  <p className="text-xs text-on-surface-variant mt-1">
                    {formatDate(detail.created_at)} · {detail.customer_name ?? "De Paso"}
                  </p>
                )}
              </div>
              <button
                onClick={closeDetail}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="p-12 text-center text-sm text-on-surface-variant">Cargando detalle…</div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="space-y-3">
                  {detail.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start gap-3">
                      <div>
                        <p className="text-sm font-medium text-on-surface">{item.product_name}</p>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">
                          {item.quantity} × ${money(item.unit_price)}
                          {item.sku ? ` · ${item.sku}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-on-surface shrink-0">${money(item.line_total)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-outline-variant/10 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Subtotal</span>
                    <span className="text-on-surface font-medium">${money(detail.subtotal)}</span>
                  </div>
                  {detail.discount_amount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Descuento</span>
                      <span className="text-[#10b981] font-medium">-${money(detail.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Impuesto ({Math.round(detail.tax_rate * 100)}%)</span>
                    <span className="text-on-surface font-medium">${money(detail.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-outline-variant/10">
                    <span className="text-base font-bold text-on-surface">Total</span>
                    <span className="text-2xl font-black text-[#6063ee]">${money(detail.total)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Pago: {PAYMENT_LABELS[detail.payment_method] ?? detail.payment_method}</span>
                  <span>{STATUS_LABELS[detail.status] ?? detail.status}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
