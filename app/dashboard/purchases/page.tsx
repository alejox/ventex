"use client";

import { useEffect, useState, useMemo } from "react";
import { IconPlus, IconBox } from "@/app/assets/icons/DashboardIcons";
import { usePurchasesStore } from "@/stores/purchases.store";
import type { PurchaseInvoice } from "@/services/purchases.service";
import * as purchasesService from "@/services/purchases.service";
import { useDistributorsStore } from "@/stores/distributors.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { DistributorQuickModal } from "@/components/DistributorQuickModal";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { Select } from "@/components/ui/Select";
import { useBusinessTax } from "@/lib/useBusinessTax";
import { PurchaseInvoiceDetailModal } from "@/components/PurchaseInvoiceDetailModal";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { useProfile } from "@/components/ProfileProvider";
import { can } from "@/lib/permissions";
import { PurchaseFormModal, type PurchaseFormPayload } from "./components/PurchaseFormModal";
import { CancelConfirmModal } from "./components/CancelConfirmModal";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchasesPage() {
  const invoices = usePurchasesStore((s) => s.invoices);
  const loading = usePurchasesStore((s) => s.loading);
  const error = usePurchasesStore((s) => s.error);
  const submitting = usePurchasesStore((s) => s.submitting);
  const fetchInvoices = usePurchasesStore((s) => s.fetchInvoices);
  const createInvoice = usePurchasesStore((s) => s.createInvoice);
  const updateStatus = usePurchasesStore((s) => s.updateStatus);
  const updateInvoice = usePurchasesStore((s) => s.updateInvoice);
  const cancelInvoice = usePurchasesStore((s) => s.cancelInvoice);

  const distributors = useDistributorsStore((s) => s.distributors);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);

  const products = useInventoryStore((s) => s.products);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [modalOpen, setModalOpen] = useState(false);
  const [distributorModalOpen, setDistributorModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<PurchaseInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [editLines, setEditLines] = useState<{ product_id: string; product_name: string; description: string; quantity: number; unit_price: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [filterDistributorId, setFilterDistributorId] = useState("");

  const { rawRate: businessTaxRate, rawPercentLabel: percentLabel } = useBusinessTax();

  const profile = useProfile();
  const canSeeCosts = can(profile, "inventory_costs");

  useEffect(() => {
    fetchInvoices();
    fetchDistributors();
    fetchInventory();
  }, [fetchInvoices, fetchDistributors, fetchInventory]);

  const openModal = () => {
    setEditingInvoice(null);
    setEditLines([]);
    setModalOpen(true);
  };

  const openEdit = async (invoice: PurchaseInvoice) => {
    setEditingInvoice(invoice);
    setEditLines([]);
    setModalOpen(true);
    try {
      const items = await purchasesService.fetchPurchaseInvoiceItems(invoice.id);
      setEditLines(
        items.map((item) => ({
          product_id: item.product_id ?? "",
          product_name: item.products?.name ?? item.description,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        }))
      );
    } catch {
      setEditLines([]);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingInvoice(null);
  };

  const handleSubmitForm = async (payload: PurchaseFormPayload) => {
    return editingInvoice
      ? await updateInvoice(editingInvoice.id, payload)
      : await createInvoice(payload);
  };

  const handleDistributorCreated = () => {
    fetchDistributors();
  };

  const handleCancelInvoice = async (invoice: PurchaseInvoice) => {
    try {
      const items = await purchasesService.fetchPurchaseInvoiceItems(invoice.id);
      const ok = await cancelInvoice(
        invoice.id,
        items.map((i) => ({ product_id: i.product_id ?? "", quantity: i.quantity }))
      );
      if (ok) setCancelConfirmId(null);
    } catch {
      // error handled by store
    }
  };

  const filteredInvoices = useMemo(
    () => {
      let result = invoices;
      if (searchQuery) {
        result = result.filter(
          (inv) =>
            inv.supplier_invoice_number?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      if (filterDistributorId) {
        result = result.filter((inv) => inv.distributor_id === filterDistributorId);
      }
      return result;
    },
    [invoices, searchQuery, filterDistributorId]
  );

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
    {
      header: "Estado",
      align: "center",
      mobile: "badge",
      cell: (inv) => (
        <div className="flex items-center gap-2">
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
          <Select
            size="sm"
            containerClassName="w-32"
            value={inv.status}
            onChange={(e) => updateStatus(inv.id, e.target.value)}
            aria-label={`Estado de la factura #${inv.invoice_number}`}
          >
            <option value="paid">Pagada</option>
            <option value="pending">Pendiente</option>
            <option value="cancelled">Anulada</option>
          </Select>
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
      header: "Recibido",
      className: "text-xs text-on-surface-variant",
      cell: (inv) => (inv.created_at ? new Date(inv.created_at).toLocaleDateString("es-ES") : "—"),
    },
    {
      header: "Acción",
      align: "center",
      mobile: "actions",
      headerClassName: "w-16",
      cell: (inv) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => openEdit(inv)}
            className="w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            title="Editar factura"
            aria-label={`Editar factura #${inv.invoice_number}`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
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

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Compras</h1>
          <p className="text-sm text-on-surface-variant mt-1">Registra compras a proveedores y actualiza el stock.</p>
        </div>
        <button
          onClick={openModal}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Nueva Compra</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando compras…</p>
      ) : invoices.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconBox />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay compras</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Registra tu primera compra para mantener el inventario actualizado.
          </p>
          <button
            onClick={openModal}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Registrar primera compra
          </button>
        </div>
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-outline-variant/10">
            <div className="relative max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por factura…"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-2 pl-9 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
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
          </div>
          <DataTable
            rows={filteredInvoices}
            rowKey={(inv) => inv.id}
            minWidth={800}
            caption="Facturas de compra"
            columns={purchaseColumns}
          />
        </div>
      )}

      {modalOpen && (
        <PurchaseFormModal
          key={`${editingInvoice?.id ?? "new"}:${editLines.length}`}
          editingInvoice={editingInvoice}
          initialLines={editLines}
          distributors={distributors}
          products={products}
          submitting={submitting}
          error={error}
          canSeeCosts={canSeeCosts}
          percentLabel={percentLabel}
          businessTaxRate={businessTaxRate}
          onClose={closeModal}
          onSubmit={handleSubmitForm}
          onOpenDistributorModal={() => setDistributorModalOpen(true)}
          onOpenCategoryModal={() => setCategoryModalOpen(true)}
        />
      )}

      {distributorModalOpen && (
        <DistributorQuickModal
          onClose={() => setDistributorModalOpen(false)}
          onCreated={handleDistributorCreated}
        />
      )}

      {categoryModalOpen && (
        <CategoryQuickModal onClose={() => setCategoryModalOpen(false)} />
      )}

      {detailInvoice && (
        <PurchaseInvoiceDetailModal
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
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
