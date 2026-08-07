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
import { CancelConfirmModal } from "./components/CancelConfirmModal";
import { StatusChangeModal } from "./components/StatusChangeModal";
import { CollectionEmpty, CollectionError, CollectionFilteredEmpty, CollectionLoading } from "@/components/CollectionState";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  cancelled: "Anulada",
};

export default function PurchasesPage() {
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
  const [searchQuery, setSearchQuery] = useState("");
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [statusChangeId, setStatusChangeId] = useState<string | null>(null);
  const [filterDistributorId, setFilterDistributorId] = useState("");

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

  const filteredInvoices = useMemo(() => {
    let result = invoices;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (inv) =>
          inv.supplier_invoice_number?.toLowerCase().includes(q) ||
          String(inv.invoice_number).includes(q) ||
          inv.distributors?.business_name.toLowerCase().includes(q)
      );
    }
    if (filterDistributorId) {
      result = result.filter((inv) => inv.distributor_id === filterDistributorId);
    }
    return result;
  }, [invoices, searchQuery, filterDistributorId]);

  const purchaseColumns: DataColumn<PurchaseInvoice>[] = [
    {
      header: "Proveedor",
      mobile: "title",
      className: "font-medium text-on-surface",
      cell: (inv) => inv.distributors?.business_name ?? "—",
    },
    {
      header: "#",
      mobile: "subtitle",
      className: "pl-6 font-mono text-xs text-on-surface-variant",
      headerClassName: "pl-6",
      cell: (inv) => <span className="font-mono text-xs">#{inv.invoice_number}</span>,
    },
    {
      header: "Total",
      align: "right",
      mobile: "trailing",
      className: "font-semibold text-on-surface font-mono",
      cell: (inv) => money(Number(inv.total)),
    },
    /**
     * Estado es solo lectura: cambiarlo se hace desde Acciones, con confirmación.
     *
     * Antes era un `<select>` acá mismo, y eso mezclaba dos cosas de peso muy
     * distinto en el mismo control: Pagada/Pendiente es una etiqueta, pero
     * "Anulada" devuelve el stock al inventario. Peor todavía, por el `<select>`
     * la anulación pasaba como un `update` de la columna nada más, sin devolver
     * nada — y el camino inverso dejaba el stock restado para siempre.
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
                ? "bg-[#10b981]"
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
            {STATUS_LABEL[inv.status] ?? inv.status}
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
      className: "text-on-surface-variant",
      cell: (inv) => new Date(inv.issue_date).toLocaleDateString("es-ES"),
    },
    {
      header: "Vencimiento",
      className: "text-on-surface-variant",
      cell: (inv) => (inv.due_date ? new Date(inv.due_date).toLocaleDateString("es-ES") : "—"),
    },
    {
      header: "Acción",
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
              onClick={() => router.push(`/dashboard/purchases/${inv.id}/edit`)}
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
          <button
            type="button"
            onClick={() => setDetailInvoice(inv)}
            className="w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            title="Ver detalles"
            aria-label={`Ver detalles de la factura #${inv.invoice_number}`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {inv.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => setCancelConfirmId(inv.id)}
              className="w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
              title="Anular y devolver stock"
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
        <button
          type="button"
          onClick={() => router.push("/dashboard/purchases/new")}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Nueva compra</span>
        </button>
      </div>

      {error && <CollectionError message={error} onRetry={fetchInvoices} />}

      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        {/* El buscador queda a la vista incluso sin compras: es lo que muestra el
            ejemplo, y evita que la barra aparezca de golpe tras la primera alta. */}
        <div className="p-4 border-b border-outline-variant/10 flex flex-col sm:flex-row gap-3">
          <div className="relative w-full sm:max-w-xs">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar No. de factura"
              aria-label="Buscar compras"
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-2.5 pl-9 pr-3 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40"
            />
            <svg
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          {hasInvoices && (
            <Select
              aria-label="Filtrar por proveedor"
              containerClassName="w-full sm:w-56"
              value={filterDistributorId}
              onChange={(e) => setFilterDistributorId(e.target.value)}
            >
              <option value="">Todos los proveedores</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>{d.business_name}</option>
              ))}
            </Select>
          )}
        </div>

        {loading ? (
          <CollectionLoading label="Cargando compras…" />
        ) : !hasInvoices ? (
          <CollectionEmpty icon={<IconShoppingCart className="h-8 w-8" />} title="Aún no has creado tu primera factura de compra" description="Registra tus compras y mantén tu inventario actualizado." action={{ label: "Nueva compra", onClick: () => router.push("/dashboard/purchases/new") }} />
        ) : filteredInvoices.length === 0 ? (
          <CollectionFilteredEmpty title="Ninguna compra coincide con la búsqueda" action={{ label: "Limpiar filtros", onClick: () => { setSearchQuery(""); setFilterDistributorId(""); } }} />
        ) : (
          <DataTable
            rows={filteredInvoices}
            rowKey={(inv) => inv.id}
            minWidth={800}
            caption="Facturas de compra"
            columns={purchaseColumns}
          />
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

      <CancelConfirmModal
        invoice={cancelConfirmId ? invoices.find((i) => i.id === cancelConfirmId) ?? null : null}
        submitting={submitting}
        onCancel={() => setCancelConfirmId(null)}
        onConfirm={() => {
          const inv = invoices.find((i) => i.id === cancelConfirmId);
          if (inv) handleCancelInvoice(inv);
        }}
      />
    </div>
  );
}
