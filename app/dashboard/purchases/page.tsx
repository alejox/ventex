"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconShoppingCart } from "@/app/assets/icons/DashboardIcons";
import { usePurchasesStore } from "@/stores/purchases.store";
import type { PurchaseInvoice } from "@/services/purchases.service";
import { useDistributorsStore } from "@/stores/distributors.store";
import { Select } from "@/components/ui/Select";
import { PurchaseInvoiceDetailModal } from "@/components/PurchaseInvoiceDetailModal";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { formatDateOnly, todayISO } from "@/lib/date";
import { useCurrentPathWithSearch, useTableUrlState, useUrlParams, withBackParam } from "@/lib/useUrlState";
import { Button } from "@/components/ui/Button";
import {
  PURCHASE_FILTERS,
  amountDue,
  isOverdue,
  matchesPurchaseFilter,
  parsePurchaseFilter,
  purchaseFilterCounts,
  purchaseTotals,
  type PurchaseFilter,
} from "./purchase-filters";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusChangeModal } from "./components/StatusChangeModal";
import { CollectionEmpty, CollectionError, CollectionFilteredEmpty, CollectionLoading } from "@/components/CollectionState";
import { useFormatMoney } from "@/lib/useMoney";

const STATUS_LABEL: Record<string, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  cancelled: "Anulada",
};

export default function PurchasesPage() {
  const fmtMoney = useFormatMoney();
  const router = useRouter();

  const invoices = usePurchasesStore((s) => s.invoices);
  const loading = usePurchasesStore((s) => s.loading);
  const error = usePurchasesStore((s) => s.error);
  const submitting = usePurchasesStore((s) => s.submitting);
  const fetchInvoices = usePurchasesStore((s) => s.fetchInvoices);
  const updateStatus = usePurchasesStore((s) => s.updateStatus);
  const cancelInvoice = usePurchasesStore((s) => s.cancelInvoice);

  const distributors = useDistributorsStore((s) => s.distributors);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);

  const [detailInvoice, setDetailInvoice] = useState<PurchaseInvoice | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [statusChangeId, setStatusChangeId] = useState<string | null>(null);

  // Búsqueda, orden, página y filtros viven en la URL: volver de editar una
  // compra deja el listado donde estaba (A14/D8). Orden por defecto: lo más
  // reciente primero.
  const table = useTableUrlState("", { sort: "fecha", dir: "desc" });
  const [filters, setFilters] = useUrlParams({ estado: "all", prov: "" });
  const statusFilter: PurchaseFilter = parsePurchaseFilter(filters.estado);
  const filterDistributorId = filters.prov;
  const setStatusFilter = (value: PurchaseFilter) => {
    setFilters({ estado: value });
    table.setState({ page: 1 });
  };
  // A dónde vuelve el formulario al guardar o cancelar: esta misma vista, con
  // sus filtros y página.
  const here = useCurrentPathWithSearch("/dashboard/purchases");
  const formHref = (href: string) => withBackParam(href, here, "/dashboard/purchases");
  // "Hoy" del reloj local, una vez por pantalla: decide qué está vencido.
  const [today] = useState(todayISO);

  useEffect(() => {
    fetchInvoices();
    fetchDistributors();
  }, [fetchInvoices, fetchDistributors]);

  const handleCancelInvoice = async (invoice: PurchaseInvoice) => {
    const ok = await cancelInvoice(invoice.id);
    if (ok) setCancelConfirmId(null);
  };

  const handleStatusChange = async (id: string, status: string) => {
    const ok = await updateStatus(id, status);
    if (ok) setStatusChangeId(null);
  };

  /** Lo que filtran el proveedor y los chips; el texto lo busca la tabla. */
  const byDistributor = useMemo(
    () => (filterDistributorId ? invoices.filter((inv) => inv.distributor_id === filterDistributorId) : invoices),
    [invoices, filterDistributorId],
  );
  const filteredInvoices = useMemo(
    () => byDistributor.filter((inv) => matchesPurchaseFilter(inv, statusFilter, today)),
    [byDistributor, statusFilter, today],
  );
  const counts = useMemo(() => purchaseFilterCounts(byDistributor, today), [byDistributor, today]);
  const totals = useMemo(() => purchaseTotals(byDistributor, today), [byDistributor, today]);

  const clearFilters = () => {
    setFilters({ estado: "all", prov: "" });
    table.setState({ q: "", page: 1 });
  };

  const purchaseColumns: DataColumn<PurchaseInvoice>[] = [
    {
      header: "Proveedor",
      mobile: "title",
      sortKey: "proveedor",
      sortValue: (inv) => inv.distributors?.business_name ?? "",
      className: "font-medium text-on-surface",
      // El nombre es el botón que abre el detalle (lo arma DataTable con
      // `onRowClick`): la fila ya no es un botón con botones adentro.
      cell: (inv) => inv.distributors?.business_name ?? "Sin proveedor",
    },
    {
      header: "#",
      mobile: "subtitle",
      sortKey: "numero",
      sortValue: (inv) => inv.invoice_number,
      className: "pl-6 font-mono text-xs text-on-surface-variant",
      headerClassName: "pl-6",
      cell: (inv) => <span className="font-mono text-xs">#{inv.invoice_number}</span>,
    },
    {
      header: "Total",
      align: "right",
      mobile: "trailing",
      sortKey: "total",
      sortValue: (inv) => Number(inv.total),
      className: "font-semibold text-on-surface font-mono",
      cell: (inv) => fmtMoney(Number(inv.total)),
    },
    /**
     * Estado es solo lectura: cambiarlo se hace desde Acciones, con confirmación.
     *
     * Antes era un `<select>` acá mismo, y eso mezclaba dos cosas de peso muy
     * distinto en el mismo control: Pagada/Pendiente es una etiqueta, pero
     * "Anulada" descuenta del inventario lo que entró con la compra. Peor
     * todavía, por el `<select>` la anulación pasaba como un `update` de la
     * columna nada más, sin descontar nada — y el camino inverso dejaba el
     * stock restado para siempre.
     */
    {
      header: "Estado",
      align: "center",
      mobile: "badge",
      cell: (inv) => (
        <div className="flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full shrink-0 ${
              inv.status === "paid"
                ? "bg-primary"
                : isOverdue(inv, today)
                  ? "bg-error"
                  : inv.status === "pending"
                    ? "bg-amber-500"
                    : "bg-on-surface-variant/40"
            }`}
          />
          <span
            className={`text-sm font-medium ${
              inv.status === "cancelled" ? "text-on-surface-variant" : "text-on-surface"
            }`}
          >
            {isOverdue(inv, today) ? "Vencida" : STATUS_LABEL[inv.status] ?? inv.status}
          </span>
        </div>
      ),
    },
    {
      header: "Factura Proveedor",
      className: "text-on-surface-variant font-mono text-xs",
      cell: (inv) => <span className="font-mono text-xs">{inv.supplier_invoice_number || "—"}</span>,
    },
    {
      header: "Fecha",
      sortKey: "fecha",
      // ISO: ordena bien; "13 ago" contra "02 sep" como texto, no.
      sortValue: (inv) => `${inv.issue_date}|${inv.created_at}`,
      className: "text-on-surface-variant",
      cell: (inv) => formatDateOnly(inv.issue_date, {}, "es-CO"),
    },
    {
      header: "Vencimiento",
      sortKey: "vence",
      // Sin vencimiento va al final en orden ascendente.
      sortValue: (inv) => inv.due_date ?? "9999-12-31",
      className: "text-on-surface-variant",
      cell: (inv) =>
        inv.due_date ? (
          isOverdue(inv, today) ? (
            <span className="font-semibold text-error">
              {formatDateOnly(inv.due_date, {}, "es-CO")}
              <span className="sr-only"> (vencida)</span>
            </span>
          ) : (
            formatDateOnly(inv.due_date, {}, "es-CO")
          )
        ) : (
          "—"
        ),
    },
    {
      header: "Por pagar",
      align: "right",
      sortKey: "debe",
      sortValue: (inv) => amountDue(inv),
      className: "font-mono text-on-surface",
      cell: (inv) => {
        const due = amountDue(inv);
        return due > 0 ? (
          <span className={isOverdue(inv, today) ? "text-error font-semibold" : ""}>{fmtMoney(due)}</span>
        ) : (
          <span className="text-on-surface-variant">—</span>
        );
      },
    },
    {
      header: "Acciones",
      align: "center",
      mobile: "actions",
      headerClassName: "w-16",
      cell: (inv) => (
        <div className="flex items-center justify-center gap-1">
          {inv.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => setStatusChangeId(inv.id)}
              className="w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
              title="Cambiar estado"
              aria-label={`Cambiar el estado de la factura #${inv.invoice_number}`}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {inv.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => router.push(formHref(`/dashboard/purchases/${inv.id}/edit`))}
              className="w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
              title="Editar factura"
              aria-label={`Editar factura #${inv.invoice_number}`}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          {inv.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => setCancelConfirmId(inv.id)}
              className="w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
              title="Anular y descontar del inventario"
              aria-label={`Anular la factura #${inv.invoice_number}`}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          )}
        </div>
      ),
    },
  ];

  const hasInvoices = invoices.length > 0;

  const statusChangeInvoice = statusChangeId
    ? invoices.find((i) => i.id === statusChangeId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Compras</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Registra tus compras de productos y mantén actualizadas las cantidades en tu inventario.
          </p>
        </div>
        <Button onClick={() => router.push(formHref("/dashboard/purchases/new"))} icon={<IconPlus className="w-4 h-4" />}>
          Nueva compra
        </Button>
      </div>

      {error && <CollectionError message={error} onRetry={fetchInvoices} />}

      {/* D15: cuánto se le debe a proveedores, y cuánto de eso ya venció. Cada
          tarjeta es además un atajo al filtro que la explica. */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            aria-pressed={statusFilter === "pending"}
            className="text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/20 hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <p className="text-sm font-medium text-on-surface-variant">Por pagar</p>
            <p className="text-2xl sm:text-3xl font-bold text-on-surface tabular-nums mt-1">{fmtMoney(totals.due)}</p>
            <p className="text-xs text-on-surface-variant mt-1">
              {totals.pendingCount} {totals.pendingCount === 1 ? "compra pendiente" : "compras pendientes"}
              {filterDistributorId ? " de este proveedor" : ""}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("overdue")}
            aria-pressed={statusFilter === "overdue"}
            className="text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/20 hover:border-error/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <p className="text-sm font-medium text-on-surface-variant">Vencido</p>
            <p className={`text-2xl sm:text-3xl font-bold tabular-nums mt-1 ${totals.overdue > 0 ? "text-error" : "text-on-surface"}`}>
              {fmtMoney(totals.overdue)}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {totals.overdueCount === 0
                ? "Nada vencido"
                : `${totals.overdueCount} ${totals.overdueCount === 1 ? "compra vencida" : "compras vencidas"}`}
            </p>
          </button>
        </div>
      )}

      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        {loading ? (
          <CollectionLoading label="Cargando compras…" />
        ) : !hasInvoices ? (
          <CollectionEmpty icon={<IconShoppingCart className="h-8 w-8" />} title="Aún no has creado tu primera factura de compra" description="Registra tus compras y mantén tu inventario actualizado." action={{ label: "Nueva compra", onClick: () => router.push("/dashboard/purchases/new") }} />
        ) : (
          <>
            <DataTable
              rows={filteredInvoices}
              rowKey={(inv) => inv.id}
              minWidth={900}
              caption="Facturas de compra"
              columns={purchaseColumns}
              onRowClick={(inv) => setDetailInvoice(inv)}
              searchable
              searchPlaceholder="Buscar por N° de factura o proveedor"
              getSearchText={(inv) =>
                [inv.supplier_invoice_number ?? "", `#${inv.invoice_number}`, String(inv.invoice_number), inv.distributors?.business_name ?? ""].join(" ")
              }
              state={table.state}
              onStateChange={table.setState}
              toolbar={
                <>
                  <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
                    {PURCHASE_FILTERS.map((f) => {
                      const active = statusFilter === f.value;
                      return (
                        <button
                          key={f.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setStatusFilter(f.value)}
                          className={`h-9 px-3 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            active
                              ? f.value === "overdue"
                                ? "bg-error text-on-error border-error"
                                : "bg-primary text-on-primary border-primary"
                              : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:text-on-surface"
                          }`}
                        >
                          {f.label}
                          <span className="ml-1.5 tabular-nums opacity-80">{counts[f.value]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Select
                    aria-label="Filtrar por proveedor"
                    containerClassName="w-full sm:w-56"
                    size="sm"
                    searchable
                    searchPlaceholder="Buscar proveedor"
                    value={filterDistributorId}
                    onChange={(e) => {
                      setFilters({ prov: e.target.value });
                      table.setState({ page: 1 });
                    }}
                  >
                    <option value="">Todos los proveedores</option>
                    {distributors.map((d) => (
                      <option key={d.id} value={d.id}>{d.business_name}</option>
                    ))}
                  </Select>
                </>
              }
            />
            {filteredInvoices.length === 0 && (
              <CollectionFilteredEmpty
                title="Ninguna compra coincide con los filtros"
                action={{ label: "Limpiar filtros", onClick: clearFilters }}
              />
            )}
          </>
        )}
      </div>

      {detailInvoice && (
        <PurchaseInvoiceDetailModal
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
        />
      )}

      {statusChangeInvoice && (
        <StatusChangeModal
          invoice={statusChangeInvoice}
          submitting={submitting}
          onCancel={() => setStatusChangeId(null)}
          onConfirm={(status) => handleStatusChange(statusChangeInvoice.id, status)}
        />
      )}

      {(() => {
        const inv = cancelConfirmId ? invoices.find((i) => i.id === cancelConfirmId) ?? null : null;
        return (
          <ConfirmDialog
            open={Boolean(inv)}
            title={`Anular compra #${inv?.invoice_number ?? ""}`}
            description={
              <>
                <p>Se descontarán del inventario las unidades que entraron con esta compra.</p>
                <p className="font-semibold text-error">
                  Esta acción no se puede deshacer. Una compra anulada no vuelve a Pagada ni a Pendiente: si
                  fue un error, registra una compra nueva.
                </p>
              </>
            }
            confirmLabel="Sí, anular"
            loadingLabel="Anulando…"
            tone="danger"
            loading={submitting}
            onCancel={() => setCancelConfirmId(null)}
            onConfirm={() => {
              if (inv) handleCancelInvoice(inv);
            }}
          />
        );
      })()}
    </div>
  );
}
