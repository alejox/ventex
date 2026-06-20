"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  IconSearch,
  IconBox,
} from "@/app/assets/icons/DashboardIcons";
import { useInventoryStore } from "@/stores/inventory.store";
import type { NewCategoryInput } from "@/services/inventory.service";
import { ProductModal } from "@/components/ProductModal";

function IconAlertTriangle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="24" height="24" {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconImagePlaceholder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="24" height="24" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function IconLayers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="24" height="24" {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 12 12 17 22 12" />
      <polyline points="2 17 12 22 22 17" />
    </svg>
  );
}

function IconFilter(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function IconMoreHorizontal(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

const EMPTY_CATEGORY: NewCategoryInput = { name: "", description: "" };

export default function InventoryPage() {
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  const [newCategory, setNewCategory] = useState<NewCategoryInput>(EMPTY_CATEGORY);

  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addCategory = useInventoryStore((s) => s.addCategory);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");

  const filteredProducts = products.filter((p) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    }
    if (categoryFilter && p.categories?.name !== categoryFilter) return false;
    if (stockFilter === "Agotado" && p.stock_level !== 0) return false;
    if (stockFilter === "Stock Bajo" && (p.stock_level <= 0 || p.stock_level > 5)) return false;
    if (stockFilter === "Óptimo" && p.stock_level <= 5) return false;
    return true;
  });

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addCategory(newCategory);
    if (ok) {
      setIsCategoryModalOpen(false);
      setNewCategory(EMPTY_CATEGORY);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-on-surface tracking-tight">Gesti&oacute;n de Inventario</h1>
          <p className="text-on-surface-variant text-sm mt-1.5">
            {products.length} producto{products.length !== 1 ? "s" : ""} registrado{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="h-11 bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva Categor&iacute;a
          </button>
          <button
            onClick={() => setIsProductModalOpen(true)}
            className="h-11 bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold px-5 rounded-xl shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_25px_rgba(96,99,238,0.35)]"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Total Productos</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{products.length}</h3>
          </div>
          <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconBox className="w-7 h-7" />
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Valor del Inventario</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">
              ${products.reduce((sum, p) => sum + (p.purchase_price ?? 0) * p.stock_level, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-14 h-14 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconLayers className="w-7 h-7" />
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Stock Bajo</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{products.filter(p => p.stock_level > 0 && p.stock_level <= 5).length}</h3>
          </div>
          <div className="w-14 h-14 rounded-xl bg-error/10 text-error flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconAlertTriangle className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="px-7 py-5 border-b border-outline-variant/10 flex flex-col md:flex-row gap-4 items-center justify-between bg-surface-container-lowest">
          <div className="relative w-full md:w-96">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar productos o SKU..."
              className="w-full bg-surface-container border border-outline-variant/20 rounded-xl py-2.5 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
            />
          </div>
          <div className="flex w-full md:w-auto gap-3">
            <div className="relative flex-1 md:w-44">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none"
              >
                <option value="">Todas las Categor&iacute;as</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
              <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className="relative flex-1 md:w-40">
              <select
                value={stockFilter}
                onChange={e => setStockFilter(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none"
              >
                <option value="">Estado de Stock</option>
                <option value="Óptimo">&Oacute;ptimo</option>
                <option value="Stock Bajo">Stock Bajo</option>
                <option value="Agotado">Agotado</option>
              </select>
              <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <button className="w-11 h-11 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0">
              <IconFilter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
                <th className="px-7 py-4 font-bold">Producto</th>
                <th className="px-4 py-4 font-bold">Categor&iacute;a</th>
                <th className="px-4 py-4 font-bold">SKU</th>
                <th className="px-4 py-4 font-bold">Costo</th>
                <th className="px-4 py-4 font-bold">Precio</th>
                <th className="px-4 py-4 font-bold">Stock</th>
                <th className="px-7 py-4 text-center font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-16 text-center text-on-surface-variant text-sm">
                    {products.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <IconBox className="w-10 h-10 text-on-surface-variant/30" />
                        <p className="font-medium">No hay productos todav&iacute;a.</p>
                        <Link
                          href="/dashboard/inventory/product"
                          className="text-primary hover:text-primary-dim font-semibold underline underline-offset-2"
                        >
                          Crear tu primer producto
                        </Link>
                      </div>
                    ) : (
                      <p>Ning&uacute;n producto coincide con los filtros.</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((item) => {
                  const stockStatus = item.stock_level === 0 ? 'out' : item.stock_level <= 5 ? 'low' : 'optimal';
                  const stockLabel = item.stock_level === 0 ? 'Agotado' : item.stock_level <= 5 ? `Stock Bajo (${item.stock_level})` : `\u00D3ptimo (${item.stock_level})`;
                  return (
                    <tr key={item.id} className="hover:bg-surface-container-lowest transition-colors group">
                      <td className="px-7 py-4">
                        <div className="flex items-center gap-4">
                          <div className="relative w-11 h-11 rounded-xl bg-surface-container border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30 overflow-hidden shrink-0">
                            {item.image_url ? (
                              <Image
                                src={item.image_url}
                                alt={item.name}
                                fill
                                sizes="44px"
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              <IconImagePlaceholder className="w-5 h-5" />
                            )}
                          </div>
                          <span className="font-medium text-on-surface">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-on-surface-variant">{item.categories?.name ?? "\u2014"}</td>
                      <td className="px-4 py-4">
                        <span className="inline-block bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-2.5 py-1 font-mono text-xs text-on-surface-variant">
                          {item.sku}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-on-surface-variant font-mono text-sm">${(item.purchase_price ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-4 text-on-surface font-semibold text-sm">${item.price.toFixed(2)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold ${
                          stockStatus === 'optimal' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' :
                          stockStatus === 'low' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20' :
                          'bg-error-container/20 text-error-dim border border-error-container/30'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            stockStatus === 'optimal' ? 'bg-[#10b981]' :
                            stockStatus === 'low' ? 'bg-[#f59e0b]' :
                            'bg-error'
                          }`} />
                          {stockLabel}
                        </span>
                      </td>
                      <td className="px-7 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/dashboard/inventory/product?id=${item.id}`}
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Editar producto"
                          >
                            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </Link>
                          <button className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">
                            <IconMoreHorizontal className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        {filteredProducts.length > 0 && (
        <div className="px-7 py-4 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest">
          <p className="text-xs text-on-surface-variant font-medium">
            Mostrando {filteredProducts.length} de {products.length} registro{products.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-1.5 items-center">
            <button className="px-3.5 py-2 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border border-transparent hover:border-outline-variant/10">
              Anterior
            </button>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-on-primary text-xs font-bold shadow-md shadow-primary/20">
              1
            </button>
            <button className="px-3.5 py-2 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border border-transparent hover:border-outline-variant/10">
              Siguiente
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Modal Nueva Categoría */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <h2 className="text-xl font-bold text-on-surface">Nueva Categor&iacute;a</h2>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Nombre de Categor&iacute;a</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. Accesorios, Muebles..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Descripci&oacute;n (Opcional)</label>
                <textarea
                  value={newCategory.description}
                  onChange={e => setNewCategory({...newCategory, description: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none h-24"
                  placeholder="Breve descripci&oacute;n de los productos..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center gap-2"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nuevo Producto */}
      {isProductModalOpen && <ProductModal onClose={() => setIsProductModalOpen(false)} />}
    </div>
  );
}
