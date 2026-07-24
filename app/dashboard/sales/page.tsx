"use client";

import { useEffect, useState } from "react";
import { IconShoppingCart, IconWallet, IconTrendingUp, IconSearch } from "@/app/assets/icons/DashboardIcons";
import { useSettingsStore } from "@/stores/settings.store";
import { useSalesStore } from "@/stores/sales.store";
import { SALES_PERIODS, SALES_PAGE_SIZE, type SaleListItem } from "@/services/sales.service";
import { COLOMBIA_TRANSFER_METHODS, getTransferMethodName } from "@/config/transferMethods";
import { getCardMethodName } from "@/config/cardMethods";
import { DataTable, type DataColumn } from "@/components/DataTable";

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
  tarjeta: "Datáfono",
  transferencia: "Transferencia",
};

/**
 * Etiqueta del medio de pago con su detalle: "Transferencia (Nequi)",
 * "Datáfono (Bold)". Una sola definición para la tabla y para el detalle de la
 * venta, que antes repetían la misma expresión ternaria.
 */
function paymentLabelOf(
  paymentMethod: string,
  transferMethod: string | null,
  cardMethod: string | null,
): string {
  const label = PAYMENT_LABELS[paymentMethod] ?? paymentMethod;
  if (paymentMethod === "transferencia" && transferMethod) {
    return `${label} (${getTransferMethodName(transferMethod)})`;
  }
  if (paymentMethod === "tarjeta" && cardMethod) {
    return `${label} (${getCardMethodName(cardMethod)})`;
  }
  return label;
}

const PAYMENT_FILTERS = [
  { value: "", label: "Todos" },
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Datáfono" },
  { value: "transferencia", label: "Transferencia" },
] as const;

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

const SALE_COLUMNS: DataColumn<SaleListItem>[] = [
  {
    header: "Cliente",
    mobile: "title",
    className: "font-medium text-on-surface",
    cell: (s) => s.customer_name ?? "De Paso",
  },
  {
    header: "Fecha",
    mobile: "subtitle",
    className: "text-on-surface-variant",
    cell: (s) => formatDate(s.created_at),
  },
  {
    header: "Total",
    align: "right",
    mobile: "trailing",
    className: "font-bold text-on-surface",
    cell: (s) => `$${money(s.total)}`,
  },
  {
    header: "Estado",
    mobile: "badge",
    cell: (s) => (
      <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${STATUS_STYLES[s.status] ?? ""}`}>
        {STATUS_LABELS[s.status] ?? s.status}
      </span>
    ),
  },
  {
    header: "N.º",
    className: "pl-6 font-mono text-xs text-on-surface-variant",
    headerClassName: "pl-6",
    cell: (s) => <span className="font-mono text-xs">#{s.sale_number}</span>,
  },
  {
    header: "Artículos",
    align: "center",
    className: "text-on-surface-variant",
    cell: (s) => s.item_count,
  },
  {
    header: "Pago",
    className: "text-on-surface-variant",
    cell: (s) => paymentLabelOf(s.payment_method, s.transfer_method, s.card_method),
  },
];

export default function SalesPage() {
  const sales = useSalesStore((s) => s.sales);
  const loading = useSalesStore((s) => s.loading);
  const error = useSalesStore((s) => s.error);
  const detail = useSalesStore((s) => s.detail);
  const detailLoading = useSalesStore((s) => s.detailLoading);
  const fetchSales = useSalesStore((s) => s.fetchSales);
  const openDetail = useSalesStore((s) => s.openDetail);
  const closeDetail = useSalesStore((s) => s.closeDetail);

  const summary = useSalesStore((s) => s.summary);
  const period = useSalesStore((s) => s.period);
  const customFrom = useSalesStore((s) => s.customFrom);
  const customTo = useSalesStore((s) => s.customTo);
  const setPeriod = useSalesStore((s) => s.setPeriod);
  const setCustomRange = useSalesStore((s) => s.setCustomRange);
  const total = useSalesStore((s) => s.total);
  const page = useSalesStore((s) => s.page);
  const setPage = useSalesStore((s) => s.setPage);
  const customerQuery = useSalesStore((s) => s.customerQuery);
  const setCustomerQuery = useSalesStore((s) => s.setCustomerQuery);
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const transferMethodsEnabled = settings?.transfer_methods_enabled;
  const paymentMethod = useSalesStore((s) => s.paymentMethod);
  const setPaymentMethod = useSalesStore((s) => s.setPaymentMethod);
  const transferMethod = useSalesStore((s) => s.transferMethod);
  const setTransferMethod = useSalesStore((s) => s.setTransferMethod);

  // Lo que se está tecleando, que va por delante de la búsqueda aplicada.
  const [searchInput, setSearchInput] = useState(customerQuery);

  useEffect(() => {
    if (!settings) fetchSettings();
    fetchSales();
  }, [fetchSales, fetchSettings, settings]);

  // Debounce: cada tecla dispararía dos consultas (listado + resumen).
  useEffect(() => {
    if (searchInput === customerQuery) return;
    const timer = setTimeout(() => setCustomerQuery(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput, customerQuery, setCustomerQuery]);

  const firstRow = total === 0 ? 0 : page * SALES_PAGE_SIZE + 1;
  const lastRow = Math.min((page + 1) * SALES_PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Historial de Ventas</h1>
          <p className="text-sm text-on-surface-variant mt-1">Consulta las ventas registradas desde el punto de venta.</p>
        </div>
      </div>

      {/* Búsqueda por cliente. Filtra en el servidor, no sobre la página
          cargada: buscar solo entre 50 filas daría resultados que mienten. */}
      <div className="relative max-w-sm">
        <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por cliente…"
          className="w-full pl-10 pr-4 py-2.5 bg-surface-container border border-outline-variant/20 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
        />
      </div>

      {customerQuery && (
        <p className="text-xs text-on-surface-variant -mt-3">
          Mostrando solo ventas de clientes que coinciden con «{customerQuery}». Las ventas sin
          cliente asignado (De Paso) quedan fuera.
        </p>
      )}

      {/* Período. Manda sobre las tarjetas Y sobre la tabla: los totales salen
          del servidor para el período completo, no de las filas visibles. */}
      <div className="flex flex-wrap items-center gap-2">
        {SALES_PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              period === p.id
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filtro por método de pago */}
      <div className="flex flex-wrap items-center gap-2">
        {PAYMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setPaymentMethod(f.value)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              paymentMethod === f.value
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sub-filtro por método de transferencia (solo cuando se filtra por Transferencia) */}
      {paymentMethod === "transferencia" && (
        <div className="flex flex-wrap items-center gap-1.5 ml-1">
          <span className="text-[11px] text-on-surface-variant font-semibold mr-1 uppercase tracking-wider">Canal:</span>
          <button
            onClick={() => setTransferMethod("")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              !transferMethod
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            Todas
          </button>
          {(transferMethodsEnabled ?? ["nequi", "daviplata", "bancolombia"]).map((id) => {
            const m = COLOMBIA_TRANSFER_METHODS.find((x) => x.id === id);
            if (!m) return null;
            return (
            <button
              key={m.id}
              onClick={() => setTransferMethod(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                transferMethod === m.id
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
            >
              {m.shortName}
            </button>
            );
          })}
        </div>
      )}

      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3 bg-surface-container rounded-2xl border border-outline-variant/10 p-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Desde</label>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomRange(e.target.value, customTo)}
              className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Hasta</label>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomRange(customFrom, e.target.value)}
              className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Ventas totales</p>
            <p className="text-2xl font-black text-on-surface mt-1">{summary ? summary.sales_count : "—"}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#6063ee]/10 text-[#6063ee] flex items-center justify-center shrink-0">
            <IconShoppingCart className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-surface-container p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Completadas</p>
            <p className="text-2xl font-black text-on-surface mt-1">{summary ? summary.completed_count : "—"}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#10b981]/10 text-[#10b981] flex items-center justify-center shrink-0">
            <IconWallet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-surface-container p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Ingresos (completadas)</p>
            <p className="text-2xl font-black text-on-surface mt-1">{summary ? `$${money(summary.revenue)}` : "—"}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#3b82f6]/10 text-[#3b82f6] flex items-center justify-center shrink-0">
            <IconWallet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-surface-container p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Ticket promedio</p>
            <p className="text-2xl font-black text-on-surface mt-1">{summary ? `$${money(summary.avg_ticket)}` : "—"}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#f59e0b]/10 text-[#f59e0b] flex items-center justify-center shrink-0">
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
        {loading ? (
          <p className="p-12 text-center text-sm text-on-surface-variant">Cargando ventas…</p>
        ) : sales.length === 0 ? (
          <p className="p-12 text-center text-sm text-on-surface-variant">
            {customerQuery
              ? `Ninguna venta de este período es de un cliente que coincida con «${customerQuery}».`
              : period === "all"
                ? "Aún no hay ventas. Registra una desde el Punto de Venta."
                : "No hay ventas en este período. Prueba con otro rango de fechas."}
          </p>
        ) : (
          <DataTable
            rows={sales}
            rowKey={(s) => s.id}
            minWidth={820}
            caption="Historial de ventas"
            onRowClick={(s) => openDetail(s.id)}
            columns={SALE_COLUMNS}
          />
        )}

        {/* Paginación */}
        {total > SALES_PAGE_SIZE && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-outline-variant/10">
            <p className="text-xs text-on-surface-variant">
              {firstRow}–{lastRow} de {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 0 || loading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={lastRow >= total || loading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de detalle */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container w-full max-w-lg rounded-3xl border border-outline-variant/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-on-surface">
                  Venta #{detail.sale_number}
                </h2>
                {detail && (
                  <p className="text-xs text-on-surface-variant mt-1">
                    {formatDate(detail.created_at)} · {detail.customer_name ?? "De Paso"}
                  </p>
                )}
              </div>
              <button
                onClick={closeDetail}
                className="text-on-surface-variant hover:text-on-surface"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
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
                          {item.unit_kind === "package"
                            ? ` · Caja x${item.units_per_item} u. (${item.quantity * item.units_per_item} uds.)`
                            : item.sku
                              ? ` · ${item.sku}`
                              : ""}
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
                  <span>
                    Pago: {paymentLabelOf(detail.payment_method, detail.transfer_method, detail.card_method)}
                  </span>
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
