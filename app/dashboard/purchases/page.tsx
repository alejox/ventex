"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { IconPlus, IconBox } from "@/app/assets/icons/DashboardIcons";
import { usePurchasesStore } from "@/stores/purchases.store";
import { useDistributorsStore } from "@/stores/distributors.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { ProductModal } from "@/components/ProductModal";
import { DistributorQuickModal } from "@/components/DistributorQuickModal";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";

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

  const distributors = useDistributorsStore((s) => s.distributors);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);

  const products = useInventoryStore((s) => s.products);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [modalOpen, setModalOpen] = useState(false);
  const [distributorId, setDistributorId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [productSearch, setProductSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [distributorModalOpen, setDistributorModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const searchInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetchInvoices();
    fetchDistributors();
    fetchInventory();
  }, [fetchInvoices, fetchDistributors, fetchInventory]);

  const openModal = () => {
    setDistributorId("");
    setIssueDate(today());
    setSupplierInvoiceNumber("");
    setLines([emptyLine()]);
    setProductSearch("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
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

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0),
    [lines]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.product_id && l.quantity > 0);
    if (!distributorId || validLines.length === 0) return;

    const ok = await createInvoice({
      distributor_id: distributorId,
      issue_date: issueDate,
      supplier_invoice_number: supplierInvoiceNumber,
      items: validLines,
    });

    if (ok) closeModal();
  };

  const handleDistributorCreated = (_id: string, _name: string) => {
    fetchDistributors();
  };

  const handleProductCreated = () => {
    fetchInventory();
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                  <th className="p-4 pl-6">#</th>
                  <th className="p-4">Proveedor</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-sm">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="p-4 pl-6 font-mono text-xs text-on-surface-variant">
                      #{inv.invoice_number}
                    </td>
                    <td className="p-4 font-medium text-on-surface">
                      {inv.distributors?.business_name ?? "—"}
                    </td>
                    <td className="p-4 text-on-surface-variant">
                      {new Date(inv.issue_date).toLocaleDateString("es-ES")}
                    </td>
                    <td className="p-4 text-right font-semibold text-on-surface font-mono">
                      {money(Number(inv.total))}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                          inv.status === "paid"
                            ? "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20"
                            : "bg-surface-variant text-on-surface-variant border-transparent"
                        }`}
                      >
                        {inv.status === "paid" ? "Pagada" : inv.status}
                      </span>
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
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">Nueva Compra</h2>
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
                          onClick={() => setProductModalOpen(true)}
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
                                className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors flex items-center justify-between gap-2"
                              >
                                <span>{p.name}</span>
                                <span className="text-xs text-on-surface-variant font-mono">{p.sku}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
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

              <div className="flex justify-end items-center gap-2 pt-2 border-t border-outline-variant/10">
                <span className="text-sm text-on-surface-variant">Total compra:</span>
                <span className="text-xl font-bold text-on-surface font-mono">{money(total)}</span>
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
                  {submitting ? "Guardando…" : "Confirmar Compra"}
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

      {productModalOpen && (
        <ProductModal
          onClose={() => {
            setProductModalOpen(false);
            handleProductCreated();
          }}
        />
      )}
    </div>
  );
}
