"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { IconPlus, IconBox } from "@/app/assets/icons/DashboardIcons";
import { usePurchasesStore } from "@/stores/purchases.store";
import type { PurchaseInvoice } from "@/services/purchases.service";
import * as purchasesService from "@/services/purchases.service";
import { useDistributorsStore } from "@/stores/distributors.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { DistributorQuickModal } from "@/components/DistributorQuickModal";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { PurchaseInvoiceDetailModal } from "@/components/PurchaseInvoiceDetailModal";
import { ProductModal } from "@/components/ProductModal";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().slice(0, 10);

interface LineForm {
  product_id: string;
  product_name: string;
  description: string;
  quantity: number;
  unit_price: number;
}

const emptyLine = (): LineForm => ({
  product_id: "",
  product_name: "",
  description: "",
  quantity: 1,
  unit_price: 0,
});

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
  const [distributorId, setDistributorId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [status, setStatus] = useState("paid");
  const [taxRate, setTaxRate] = useState("Ninguno");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [productSearch, setProductSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  const [distributorModalOpen, setDistributorModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<PurchaseInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [productModalLineIdx, setProductModalLineIdx] = useState<number | null>(null);
  const searchInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [loadingLastPurchase, setLoadingLastPurchase] = useState(false);
  const [filterDistributorId, setFilterDistributorId] = useState("");

  useEffect(() => {
    fetchInvoices();
    fetchDistributors();
    fetchInventory();
  }, [fetchInvoices, fetchDistributors, fetchInventory]);

  const openModal = () => {
    setEditingInvoice(null);
    setDistributorId("");
    setIssueDate(today());
    setSupplierInvoiceNumber("");
    setStatus("paid");
    setTaxRate("Ninguno");
    setDiscountAmount("0");
    setLines([emptyLine()]);
    setProductSearch("");
    setModalOpen(true);
  };

  const openEdit = async (invoice: PurchaseInvoice) => {
    setEditingInvoice(invoice);
    setDistributorId(invoice.distributor_id ?? "");
    setIssueDate(invoice.issue_date);
    setSupplierInvoiceNumber(invoice.supplier_invoice_number ?? "");
    setStatus(invoice.status);
    setTaxRate(invoice.tax_rate > 0 ? "19%" : "Ninguno");
    setDiscountAmount(String(invoice.discount_amount));
    try {
      const items = await purchasesService.fetchPurchaseInvoiceItems(invoice.id);
      setLines(
        items.map((item) => ({
          product_id: item.product_id ?? "",
          product_name: item.products?.name ?? item.description,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        }))
      );
    } catch {
      setLines([emptyLine()]);
    }
    setProductSearch("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingInvoice(null);
    setDistributorId("");
  };

  const handleAddLine = () => setLines((prev) => [...prev, emptyLine()]);

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof LineForm, value: string | number) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)));
  };

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku.toLowerCase().includes(productSearch.toLowerCase())
      ),
    [products, productSearch]
  );

  const selectProduct = useCallback((idx: number, product: (typeof products)[number]) => {
    setLines((prev) =>
      prev.map((line, i) =>
        i === idx
          ? {
              ...line,
              product_id: product.id,
              product_name: product.name,
              description: `Compra: ${product.name}`,
              unit_price: product.purchase_price ?? product.price,
            }
          : line
      )
    );
    setShowDropdown(null);
    setProductSearch("");
  }, []);

  const taxMultiplier = taxRate === "Ninguno" ? 0 : 0.19;
  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0),
    [lines]
  );
  const taxAmount = useMemo(
    () => Math.round(subtotal * taxMultiplier * 100) / 100,
    [subtotal, taxMultiplier]
  );
  const discount = parseFloat(discountAmount || "0");
  const total = subtotal + taxAmount - discount;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.product_id && l.quantity > 0);
    if (!distributorId || validLines.length === 0) return;

    const payload = {
      distributor_id: distributorId,
      issue_date: issueDate,
      supplier_invoice_number: supplierInvoiceNumber,
      status,
      items: validLines,
      tax_rate: taxRate === "Ninguno" ? 0 : 0.19,
      discount_amount: discount,
    };

    const ok = editingInvoice
      ? await updateInvoice(editingInvoice.id, payload)
      : await createInvoice(payload);

    if (ok) closeModal();
  };

  // El callback recibe (id, name), pero acá solo interesa recargar la lista.
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

  const handleLoadLastPurchase = async () => {
    if (!distributorId) return;
    setLoadingLastPurchase(true);
    try {
      const last = await purchasesService.fetchLastPurchaseFromDistributor(distributorId);
      if (last && last.items.length > 0) {
        setLines(
          last.items.map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            description: `Compra: ${i.product_name}`,
            quantity: i.quantity,
            unit_price: i.unit_price,
          }))
        );
      }
    } catch {
      // ignore
    }
    setLoadingLastPurchase(false);
  };

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
            <select
              value={filterDistributorId}
              onChange={(e) => setFilterDistributorId(e.target.value)}
              className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            >
              <option value="">Todos los proveedores</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>{d.business_name}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                  <th className="p-4 pl-6">#</th>
                  <th className="p-4">Proveedor</th>
                  <th className="p-4">Factura Proveedor</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Recibido</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-center w-16">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-sm">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="p-4 pl-6 font-mono text-xs text-on-surface-variant">
                      #{inv.invoice_number}
                    </td>
                    <td className="p-4 font-medium text-on-surface">
                      {inv.distributors?.business_name ?? "—"}
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono text-xs">
                      {inv.supplier_invoice_number || "—"}
                    </td>
                    <td className="p-4 text-on-surface-variant">
                      {new Date(inv.issue_date).toLocaleDateString("es-ES")}
                    </td>
                    <td className="p-4 text-xs text-on-surface-variant">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString("es-ES") : "—"}
                    </td>
                    <td className="p-4 text-right font-semibold text-on-surface font-mono">
                      {money(Number(inv.total))}
                    </td>
                    <td className="p-4 text-center">
                      <select
                        value={inv.status}
                        onChange={(e) => updateStatus(inv.id, e.target.value)}
                        className={`text-[11px] font-bold border rounded-md px-2.5 py-1 appearance-none cursor-pointer focus:outline-none ${
                          inv.status === "paid"
                            ? "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20"
                            : inv.status === "pending"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-surface-variant text-on-surface-variant border-transparent"
                        }`}
                      >
                        <option value="paid">Pagada</option>
                        <option value="pending">Pendiente</option>
                        <option value="cancelled">Anulada</option>
                      </select>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(inv)}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Editar factura"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailInvoice(inv)}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Ver detalles"
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
                            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                            title="Anular y devolver stock"
                          >
                            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                              <polyline points="1 4 1 10 7 10" />
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">{editingInvoice ? "Editar Compra" : "Nueva Compra"}</h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto">
              {error && (
                <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Proveedor</label>
                  <div className="flex gap-2">
                    <select
                      required
                      value={distributorId}
                      onChange={(e) => setDistributorId(e.target.value)}
                      className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                    >
                      <option value="">Seleccionar proveedor…</option>
                      {distributors
                        .filter((d) => d.status === "active")
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.business_name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setDistributorModalOpen(true)}
                      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                      title="Crear nuevo proveedor"
                    >
                      <IconPlus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadLastPurchase}
                      disabled={!distributorId || loadingLastPurchase}
                      className="shrink-0 px-3 h-10 flex items-center gap-1.5 rounded-xl text-xs font-semibold bg-surface-container-low border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Cargar productos de la última compra de este proveedor"
                    >
                      <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      {loadingLastPurchase ? "Cargando…" : "Última compra"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Fecha</label>
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Factura Proveedor</label>
                  <input
                    type="text"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="N° factura del proveedor"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Estado</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                  >
                    <option value="paid">Pagada</option>
                    <option value="pending">Pendiente</option>
                    <option value="cancelled">Anulada</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">IVA</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                  >
                    <option value="Ninguno">Ninguno</option>
                    <option value="19%">19%</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Descuento ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-semibold text-on-surface">Productos</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCategoryModalOpen(true)}
                      className="text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors"
                    >
                      + Categoría
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="text-xs font-semibold text-primary hover:text-primary-dim transition-colors flex items-center gap-1"
                    >
                      <IconPlus className="w-3.5 h-3.5" />
                      Añadir producto
                    </button>
                  </div>
                </div>

                {lines.map((line, idx) => (
                  <div key={idx} className="relative flex items-start gap-2 bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-3">
                    <div className="flex-1 space-y-1.5 relative">
                      <div className="flex gap-1.5">
                        <input
                          ref={(el) => { searchInputRefs.current[idx] = el; }}
                          type="text"
                          placeholder="Buscar producto…"
                          value={showDropdown === idx ? productSearch : line.product_name || ""}
                          onFocus={() => {
                            setShowDropdown(idx);
                            setProductSearch("");
                          }}
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            if (showDropdown !== idx) setShowDropdown(idx);
                          }}
                          onBlur={() => setTimeout(() => setShowDropdown(null), 200)}
                          className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-lg py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40"
                        />
                        <button
                          type="button"
                          onClick={() => setProductModalLineIdx(idx)}
                          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                          title="Crear nuevo producto"
                        >
                          <IconPlus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {showDropdown === idx && productSearch && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface-container-low border border-outline-variant/20 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {filteredProducts.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-on-surface-variant">Sin resultados</div>
                          ) : (
                            filteredProducts.slice(0, 10).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={() => selectProduct(idx, p)}
                                className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-xs text-on-surface-variant font-mono">{p.sku}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-on-surface-variant">
                                  <span>Stock: <strong className={p.stock_level <= (p.minimum_stock ?? 0) ? "text-error" : "text-on-surface"}>{p.stock_level}</strong></span>
                                  <span>Compra: <strong className="text-on-surface">${Number(p.purchase_price ?? 0).toLocaleString("en-US")}</strong></span>
                                  <span>Venta: <strong className="text-on-surface">${Number(p.price).toLocaleString("en-US")}</strong></span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    {line.product_id && (() => {
                      const p = products.find((pr) => pr.id === line.product_id);
                      return p && (p.units_per_package ?? 1) > 1 ? (
                        <p className="text-[10px] text-on-surface-variant mt-1">
                          1 paquete = {p.units_per_package} {p.unit}(es) | Precio x paquete: <strong>${(line.unit_price * (p.units_per_package ?? 1)).toLocaleString("en-US")}</strong>
                        </p>
                      ) : null;
                    })()}
                    <div className="w-20 shrink-0 space-y-1.5">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        required
                        placeholder="Cant."
                        value={line.quantity || ""}
                        onChange={(e) => handleLineChange(idx, "quantity", Math.max(1, Number(e.target.value)))}
                        className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-2 px-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center"
                      />
                    </div>
                    <div className="w-28 shrink-0 space-y-1.5">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        required
                        placeholder="Precio"
                        value={line.unit_price || ""}
                        onChange={(e) => handleLineChange(idx, "unit_price", Number(e.target.value))}
                        className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-2 px-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-right font-mono"
                      />
                    </div>
                    <div className="w-20 shrink-0 flex items-center justify-end text-sm font-semibold text-on-surface font-mono pt-1.5">
                      {money(line.quantity * line.unit_price)}
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors mt-1"
                        aria-label="Eliminar"
                      >
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col items-end gap-1 pt-2 border-t border-outline-variant/10">
                <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                  <span>Subtotal:</span>
                  <span className="font-mono w-28 text-right">{money(subtotal)}</span>
                </div>
                {taxMultiplier > 0 && (
                  <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                    <span>IVA (19%):</span>
                    <span className="font-mono w-28 text-right">{money(taxAmount)}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex items-center gap-4 text-sm text-error">
                    <span>Descuento:</span>
                    <span className="font-mono w-28 text-right">-{money(discount)}</span>
                  </div>
                )}
                <div className="flex items-center gap-4 pt-1 border-t border-outline-variant/10">
                  <span className="text-sm font-semibold text-on-surface">Total:</span>
                  <span className="text-xl font-bold text-on-surface font-mono w-28 text-right">{money(total)}</span>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !distributorId || lines.every((l) => !l.product_id)}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Guardando…" : editingInvoice ? "Guardar Cambios" : "Confirmar Compra"}
                </button>
              </div>
            </form>
          </div>
        </div>
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

      {productModalLineIdx !== null && (
        <ProductModal
          onClose={() => setProductModalLineIdx(null)}
          onCreated={(productId, productName) => {
            setLines((prev) =>
              prev.map((line, i) =>
                i === productModalLineIdx
                  ? {
                      ...line,
                      product_id: productId,
                      product_name: productName,
                      description: `Compra: ${productName}`,
                    }
                  : line
              )
            );
            fetchInventory();
            setProductModalLineIdx(null);
          }}
        />
      )}

      {cancelConfirmId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-on-surface mb-2">Anular compra</h3>
            <p className="text-sm text-on-surface-variant mb-6">
              Se devolverá el stock de todos los productos al inventario. ¿Estás seguro?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCancelConfirmId(null)}
                className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const inv = invoices.find((i) => i.id === cancelConfirmId);
                  if (inv) handleCancelInvoice(inv);
                }}
                disabled={submitting}
                className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-error text-white hover:bg-error/90 transition-colors disabled:opacity-50"
              >
                {submitting ? "Anulando…" : "Sí, anular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
