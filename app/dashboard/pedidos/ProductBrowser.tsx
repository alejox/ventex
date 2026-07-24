"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Select } from "@/components/ui/Select";

interface ProductItem {
  id: string;
  name: string;
  image_url: string | null;
  sku: string;
  stock_level: number;
  minimum_stock: number;
  unit: string;
  categories: { name: string } | null;
  distributors: { business_name: string } | null;
}

interface Props {
  products: ProductItem[];
  categories: { id: string; name: string }[];
  addedIds: Set<string>;
  onAdd: (productId: string) => void;
  onClose: () => void;
}

export function ProductBrowser({ products, categories, addedIds, onAdd, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      }
      if (categoryFilter && p.categories?.name !== categoryFilter) return false;
      if (stockFilter === "low" && (p.stock_level >= p.minimum_stock || p.stock_level === 0)) return false;
      if (stockFilter === "out" && p.stock_level !== 0) return false;
      if (stockFilter === "ok" && p.stock_level < p.minimum_stock) return false;
      return true;
    });
  }, [products, search, categoryFilter, stockFilter]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface-container rounded-3xl w-full max-w-3xl max-h-[85vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-outline-variant/10 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-on-surface">Agregar productos al pedido</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="p-6 pb-0 space-y-4 shrink-0">
          <div className="relative">
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <Select
              aria-label="Filtrar por categoría"
              containerClassName="flex-1 min-w-0"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Todas las categor&iacute;as</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por estado de stock"
              containerClassName="flex-1 min-w-0"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
            >
              <option value="">Todos los stocks</option>
              <option value="low">Stock bajo</option>
              <option value="out">Agotado</option>
              <option value="ok">Stock &oacute;ptimo</option>
            </Select>
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-on-surface-variant">
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-10 h-10 mb-3 opacity-30">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p className="font-medium">No se encontraron productos</p>
              <p className="text-sm mt-1">Intenta con otros t&eacute;rminos de b&uacute;squeda o filtros.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const added = addedIds.has(p.id);
                const isLow = p.stock_level < p.minimum_stock;
                const badgeClass = p.stock_level === 0
                  ? "bg-error-container/20 text-error-dim border border-error-container/30"
                  : isLow
                    ? "bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20"
                    : "bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20";
                const dotClass = p.stock_level === 0
                  ? "bg-error"
                  : isLow
                    ? "bg-[#f59e0b]"
                    : "bg-[#10b981]";
                const stockLabel = p.stock_level === 0
                  ? "Agotado"
                  : isLow
                    ? `${p.stock_level} ${p.unit}`
                    : `${p.stock_level} ${p.unit}`;

                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 p-3 rounded-2xl bg-surface-container-lowest border border-outline-variant/10 hover:border-outline-variant/20 transition-colors"
                  >
                    <div className="relative w-12 h-12 rounded-xl bg-surface-container border border-outline-variant/10 flex items-center justify-center overflow-hidden shrink-0">
                      {p.image_url ? (
                        <Image src={p.image_url} alt={p.name} fill sizes="48px" unoptimized className="object-cover" />
                      ) : (
                        <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5 text-on-surface-variant/30">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-on-surface truncate">{p.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-on-surface-variant font-mono">{p.sku}</span>
                        {p.categories?.name && (
                          <>
                            <span className="text-xs text-on-surface-variant/30">&middot;</span>
                            <span className="text-xs text-on-surface-variant">{p.categories.name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                      {stockLabel}
                    </span>

                    <button
                      type="button"
                      onClick={() => onAdd(p.id)}
                      disabled={added}
                      className={`shrink-0 h-9 px-4 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        added
                          ? "bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 cursor-default"
                          : "bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_12px_rgba(96,99,238,0.2)] hover:shadow-[0_0_15px_rgba(96,99,238,0.3)]"
                      }`}
                    >
                      {added ? (
                        <>
                          <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Agregado
                        </>
                      ) : (
                        <>
                          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Agregar
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between text-sm text-on-surface-variant shrink-0">
          <span>{filtered.length} de {products.length} productos</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
