"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { IconPlus } from "@/app/assets/icons/DashboardIcons";
import { Select } from "@/components/ui/Select";
import { ProductModal } from "@/components/ProductModal";
import { useInventoryStore } from "@/stores/inventory.store";
import type { Distributor } from "@/services/distributors.service";
import type { Product } from "@/services/inventory.service";
import type { PurchaseInvoice } from "@/services/purchases.service";
import { fetchLastPurchaseFromDistributor } from "@/services/purchases.service";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface LineForm {
  product_id: string;
  product_name: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface PurchaseFormPayload {
  distributor_id: string;
  issue_date: string;
  supplier_invoice_number: string;
  status: string;
  items: LineForm[];
  tax_rate: number;
  discount_amount: number;
}

interface PurchaseFormModalProps {
  editingInvoice: PurchaseInvoice | null;
  initialLines: LineForm[];
  distributors: Distributor[];
  products: Product[];
  submitting: boolean;
  error: string | null;
  canSeeCosts: boolean;
  percentLabel: string;
  businessTaxRate: number;
  onClose: () => void;
  onSubmit: (payload: PurchaseFormPayload) => Promise<boolean>;
  onOpenDistributorModal: () => void;
  onOpenCategoryModal: () => void;
}

export function PurchaseFormModal({
  editingInvoice,
  initialLines,
  distributors,
  products,
  submitting,
  error,
  canSeeCosts,
  percentLabel,
  businessTaxRate,
  onClose,
  onSubmit,
  onOpenDistributorModal,
  onOpenCategoryModal,
}: PurchaseFormModalProps) {
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [distributorId, setDistributorId] = useState(editingInvoice?.distributor_id ?? "");
  const [issueDate, setIssueDate] = useState(editingInvoice?.issue_date ?? "");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(editingInvoice?.supplier_invoice_number ?? "");
  const [status, setStatus] = useState(editingInvoice?.status ?? "paid");
  const [taxRate, setTaxRate] = useState(
    editingInvoice && editingInvoice.tax_rate > 0 ? "IVA" : "Ninguno"
  );
  const [discountAmount, setDiscountAmount] = useState(
    editingInvoice ? String(editingInvoice.discount_amount) : "0"
  );
  const [lines, setLines] = useState<LineForm[]>(
    initialLines.length > 0 ? initialLines : [{ product_id: "", product_name: "", description: "", quantity: 1, unit_price: 0 }]
  );
  const [productSearch, setProductSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  const searchInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [loadingLastPurchase, setLoadingLastPurchase] = useState(false);
  const [productModalLineIdx, setProductModalLineIdx] = useState<number | null>(null);
  const productModalLineIdxRef = useRef<number | null>(null);

  const handleAddLine = () =>
    setLines((prev) => [...prev, { product_id: "", product_name: "", description: "", quantity: 1, unit_price: 0 }]);

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

  const selectProduct = useCallback((idx: number, product: Product) => {
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

  const taxMultiplier = taxRate === "Ninguno" ? 0 : businessTaxRate;
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

  const handleLoadLastPurchase = async () => {
    if (!distributorId) return;
    setLoadingLastPurchase(true);
    try {
      const last = await fetchLastPurchaseFromDistributor(distributorId);
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
      /* ignore */
    }
    setLoadingLastPurchase(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.product_id && l.quantity > 0);
    if (!distributorId || validLines.length === 0) return;

    const payload: PurchaseFormPayload = {
      distributor_id: distributorId,
      issue_date: issueDate,
      supplier_invoice_number: supplierInvoiceNumber,
      status,
      items: validLines,
      tax_rate: taxRate === "Ninguno" ? 0 : businessTaxRate,
      discount_amount: discount,
    };

    const ok = await onSubmit(payload);
    if (ok) onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
          <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
            <h2 className="text-lg sm:text-xl font-bold text-on-surface">{editingInvoice ? "Editar Compra" : "Nueva Compra"}</h2>
            <button
              onClick={onClose}
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
                <label htmlFor="purchase-distributor" className="text-[13px] font-semibold text-on-surface block">Proveedor</label>
                <div className="flex gap-2 items-center">
                  <Select
                    id="purchase-distributor"
                    containerClassName="flex-1 min-w-0"
                    value={distributorId}
                    onChange={(e) => setDistributorId(e.target.value)}
                  >
                    <option value="">Seleccionar proveedor…</option>
                    {distributors
                      .filter((d) => d.status === "active")
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.business_name}
                        </option>
                      ))}
                  </Select>
                  <button
                    type="button"
                    onClick={onOpenDistributorModal}
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
              <Select
                label="Estado"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="paid">Pagada</option>
                <option value="pending">Pendiente</option>
                <option value="cancelled">Anulada</option>
              </Select>
              <Select
                label="IVA"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              >
                <option value="Ninguno">Ninguno</option>
                <option value="IVA">{percentLabel}</option>
              </Select>
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
                    onClick={onOpenCategoryModal}
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
                        onClick={() => {
                          productModalLineIdxRef.current = idx;
                          setProductModalLineIdx(idx);
                        }}
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
                                {canSeeCosts && (
                                  <span>Compra: <strong className="text-on-surface">${Number(p.purchase_price ?? 0).toLocaleString("en-US")}</strong></span>
                                )}
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
                  <span>IVA ({percentLabel}):</span>
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
                onClick={onClose}
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

      {productModalLineIdx !== null && (
        <ProductModal
          onClose={() => {
            setProductModalLineIdx(null);
            productModalLineIdxRef.current = null;
          }}
          onCreated={(productId, productName) => {
            const idx = productModalLineIdxRef.current;
            if (idx !== null) {
              setLines((prev) =>
                prev.map((line, i) =>
                  i === idx
                    ? {
                        ...line,
                        product_id: productId,
                        product_name: productName,
                        description: `Compra: ${productName}`,
                      }
                    : line
                )
              );
            }
            fetchInventory();
            productModalLineIdxRef.current = null;
            setProductModalLineIdx(null);
          }}
        />
      )}
    </>
  );
}
