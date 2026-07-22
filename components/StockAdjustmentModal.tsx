"use client";

import { useState, useMemo } from "react";
import { useMovementsStore } from "@/stores/inventory-movements.store";
import { useInventoryStore } from "@/stores/inventory.store";

interface StockAdjustmentModalProps {
  preselectedProductId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const MOVEMENT_TYPES = [
  { value: "in" as const, label: "Entrada" },
  { value: "out" as const, label: "Salida" },
  { value: "adjust" as const, label: "Ajustar a" },
];

export function StockAdjustmentModal({ preselectedProductId, onClose, onSuccess }: StockAdjustmentModalProps) {
  const addMovement = useMovementsStore((s) => s.addMovement);
  const submitting = useMovementsStore((s) => s.submitting);
  const error = useMovementsStore((s) => s.error);
  const products = useInventoryStore((s) => s.products);

  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState(preselectedProductId ?? "");
  const [type, setType] = useState<"in" | "out" | "adjust">("in");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const selectedProduct = products.find((p) => p.id === productId);

  // "Ajustar a" fija el stock absoluto (el servicio hace
  // `update products set stock_level = quantity`), así que 0 es un valor
  // legítimo: es como se registra un producto agotado. Entrada y salida son
  // deltas y sí necesitan ser mayores a cero.
  const minQuantity = type === "adjust" ? 0 : 1;
  const parsedQuantity = parseInt(quantity);
  const quantityInRange = Number.isInteger(parsedQuantity) && parsedQuantity >= minQuantity;

  // `increment_stock` aplica el movimiento en unidades sueltas: multiplica la
  // cantidad por `units_per_package`. Comparar la cantidad cruda contra el
  // stock daba un aviso mal calibrado para productos que vienen por paquete.
  const unitsPerPackage = selectedProduct?.units_per_package ?? 1;
  const unitsMoved = quantityInRange ? parsedQuantity * unitsPerPackage : 0;
  const exceedsStock =
    type === "out" && !!selectedProduct && unitsMoved > selectedProduct.stock_level;

  // El servidor rechaza dejar el stock en negativo (STOCK_INSUFICIENTE), así
  // que la salida en exceso se bloquea acá en vez de dejar enviar y fallar.
  const quantityValid = quantityInRange && !exceedsStock;

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku.toLowerCase().includes(productSearch.toLowerCase())
      ),
    [products, productSearch]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !quantityValid) return;

    const ok = await addMovement({
      product_id: productId,
      type,
      quantity: parsedQuantity,
      notes: notes || undefined,
    });

    if (ok) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-surface-container-lowest rounded-[24px] w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-on-surface">Ajustar Stock</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-5">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          {!preselectedProductId && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface block">Producto</label>
              <div className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setProductId("");
                  }}
                  placeholder="Buscar producto…"
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
                {productSearch && !productId && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface-container-low border border-outline-variant/20 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-on-surface-variant">Sin resultados</div>
                    ) : (
                      filteredProducts.slice(0, 10).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => {
                            setProductId(p.id);
                            setProductSearch(p.name);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors flex items-center justify-between gap-2"
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-on-surface-variant font-mono">Stock: {p.stock_level}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {productId && selectedProduct && (
                <p className="text-xs text-on-surface-variant mt-1">
                  Stock actual: <strong className="text-on-surface">{selectedProduct.stock_level}</strong>
                </p>
              )}
            </div>
          )}

          {preselectedProductId && selectedProduct && (
            <p className="text-sm text-on-surface-variant">
              Producto: <strong className="text-on-surface">{selectedProduct.name}</strong> — Stock actual: <strong>{selectedProduct.stock_level}</strong>
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface block">Tipo de movimiento</label>
            <div className="flex gap-2">
              {MOVEMENT_TYPES.map((mt) => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setType(mt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    type === mt.value
                      ? "border-primary text-primary bg-primary/5"
                      : "border-outline-variant/30 text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface block">
              {type === "adjust" ? "Nuevo stock" : "Cantidad"}
            </label>
            <input
              type="number"
              min={minQuantity}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {type === "adjust" && (
              <p className="text-xs text-on-surface-variant">
                El stock queda exactamente en este número. Usa 0 para marcar el producto como agotado.
              </p>
            )}
            {type !== "adjust" && unitsPerPackage > 1 && quantityInRange && (
              <p className="text-xs text-on-surface-variant">
                {parsedQuantity} × {unitsPerPackage} unidades por paquete = {unitsMoved} unidades.
              </p>
            )}
          </div>

          {exceedsStock && selectedProduct && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              La salida de {unitsMoved} unidades supera el stock actual ({selectedProduct.stock_level}).
              El stock no puede quedar en negativo: corrige la cantidad, o usa
              «Ajustar a» si lo que buscas es fijar el conteo real.
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-on-surface block">Notas <span className="text-on-surface-variant font-normal">(opcional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              placeholder="Motivo del ajuste…"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !productId || !quantityValid}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
