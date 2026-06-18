"use client";

import { useState, useEffect } from "react";
import {
  IconSearch,
  IconBox,
} from "@/app/assets/icons/DashboardIcons";
import { useInventoryStore } from "@/stores/inventory.store";
import type { NewProductInput, NewCategoryInput } from "@/services/inventory.service";

function IconAlertTriangle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
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
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
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

const EMPTY_PRODUCT: NewProductInput = {
  name: "",
  category_id: "",
  sku: "",
  price: "",
  stock_level: "",
  image_url: "",
};

const EMPTY_CATEGORY: NewCategoryInput = { name: "", description: "" };

export default function InventoryPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const [newCategory, setNewCategory] = useState<NewCategoryInput>(EMPTY_CATEGORY);
  const [newProduct, setNewProduct] = useState<NewProductInput>(EMPTY_PRODUCT);

  // Estado de datos vive en el store; el componente solo lo consume (component → store → services).
  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addProduct = useInventoryStore((s) => s.addProduct);
  const addCategory = useInventoryStore((s) => s.addCategory);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addProduct(newProduct);
    if (ok) {
      setIsModalOpen(false);
      setNewProduct(EMPTY_PRODUCT);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addCategory(newCategory);
    if (ok) {
      setIsCategoryModalOpen(false);
      setNewCategory(EMPTY_CATEGORY);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-on-surface">Gestión de Inventario</h1>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Nueva Categoría
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold py-2.5 px-4 rounded-xl shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-colors flex items-center justify-center gap-2"
          >
            <span>+</span> Nuevo Producto
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex justify-between items-center group">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">Productos</p>
            <h3 className="text-3xl font-bold text-on-surface">{products.length}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconBox className="w-6 h-6" />
          </div>
        </div>
        
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex justify-between items-center group">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">Valor del Inventario</p>
            <h3 className="text-3xl font-bold text-on-surface">
              ${products.reduce((sum, p) => sum + p.price * p.stock_level, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconLayers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-error-container/10 rounded-2xl p-5 border border-error-container/30 shadow-sm flex justify-between items-center group">
          <div>
            <p className="text-error-dim text-sm font-medium mb-1">Stock Bajo</p>
            <h3 className="text-3xl font-bold text-error">{products.filter(p => p.stock_level > 0 && p.stock_level <= 5).length}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-error/10 text-error flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconAlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="p-5 border-b border-outline-variant/10 flex flex-col md:flex-row gap-4 items-center justify-between bg-surface-container-lowest">
          <div className="relative w-full md:w-96">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input 
              type="text" 
              placeholder="Buscar productos, SKUs..." 
              className="w-full bg-surface-container border border-outline-variant/20 rounded-xl py-2 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
            />
          </div>
          <div className="flex w-full md:w-auto gap-3">
            <select className="bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary flex-1 md:w-40 appearance-none">
              <option value="">Todas las Categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <select className="bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary flex-1 md:w-36 appearance-none">
              <option>Estado de Stock</option>
              <option>Óptimo</option>
              <option>Stock Bajo</option>
              <option>Agotado</option>
            </select>
            <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0">
              <IconFilter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                <th className="p-4 pl-6 font-bold">Imagen</th>
                <th className="p-4 font-bold">Nombre del Producto</th>
                <th className="p-4 font-bold">Categoría</th>
                <th className="p-4 font-bold">SKU</th>
                <th className="p-4 font-bold">Precio</th>
                <th className="p-4 font-bold">Nivel de Stock</th>
                <th className="p-4 pr-6 text-center font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface-variant text-sm">
                    No hay productos todavía. Crea tu primer producto.
                  </td>
                </tr>
              ) : (
                products.map((item) => {
                  const stockStatus = item.stock_level === 0 ? 'out' : item.stock_level <= 5 ? 'low' : 'optimal';
                  const stockLabel = item.stock_level === 0 ? 'Agotado' : item.stock_level <= 5 ? `Stock Bajo (${item.stock_level})` : `Óptimo (${item.stock_level})`;
                  return (
                    <tr key={item.id} className="hover:bg-surface-container-lowest transition-colors group">
                      <td className="p-4 pl-6">
                        <div className="w-10 h-10 rounded-lg bg-surface-container border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <IconImagePlaceholder className="w-5 h-5" />
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-medium text-on-surface">{item.name}</td>
                      <td className="p-4 text-on-surface-variant">{item.categories?.name ?? "—"}</td>
                      <td className="p-4 text-on-surface-variant font-mono text-xs">{item.sku}</td>
                      <td className="p-4 text-on-surface font-semibold">${item.price.toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                          stockStatus === 'optimal' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' :
                          stockStatus === 'low' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20' :
                          'bg-error-container/20 text-error-dim border border-error-container/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            stockStatus === 'optimal' ? 'bg-[#10b981]' :
                            stockStatus === 'low' ? 'bg-[#f59e0b]' :
                            'bg-error'
                          }`}></span>
                          {stockLabel}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-center">
                        <button className="text-on-surface-variant hover:text-primary transition-colors p-1">
                          <IconMoreHorizontal className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        {products.length > 0 && (
        <div className="p-5 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest">
          <p className="text-xs text-on-surface-variant font-medium">Mostrando {products.length} de {products.length} registros</p>
          <div className="flex gap-1 items-center">
            <button className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border border-transparent hover:border-outline-variant/10">Anterior</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-on-primary text-xs font-bold shadow-md shadow-primary/20">1</button>
            <button className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors border border-transparent hover:border-outline-variant/10">Siguiente</button>
          </div>
        </div>
        )}
      </div>

      {/* Modal Nuevo Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-3xl w-full max-w-lg border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <h2 className="text-xl font-bold text-on-surface">Nuevo Producto</h2>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Nombre del Producto</label>
                <input 
                  type="text" 
                  value={newProduct.name}
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50" 
                  placeholder="Ej. Nimbus Smart Watch V2"
                  required 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Categoría</label>
                <div className="relative">
                  <select 
                    value={newProduct.category_id}
                    onChange={e => setNewProduct({...newProduct, category_id: e.target.value})}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none" 
                    required
                  >
                    <option value="" disabled>Selecciona una categoría...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">SKU</label>
                  <input 
                    type="text" 
                    value={newProduct.sku}
                    onChange={e => setNewProduct({...newProduct, sku: e.target.value})}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono placeholder:text-on-surface-variant/50" 
                    placeholder="Ej. NTM-SW-002"
                    required 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Precio ($)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={newProduct.price}
                    onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50" 
                    placeholder="0.00"
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Nivel de Stock</label>
                  <input 
                    type="number" 
                    value={newProduct.stock_level}
                    onChange={e => setNewProduct({...newProduct, stock_level: e.target.value})}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50" 
                    placeholder="Ej. 120"
                    required 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Imagen (URL opcional)</label>
                  <input 
                    type="url" 
                    value={newProduct.image_url}
                    onChange={e => setNewProduct({...newProduct, image_url: e.target.value})}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50" 
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-outline-variant/10">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center gap-2"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nueva Categoría */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <h2 className="text-xl font-bold text-on-surface">Nueva Categoría</h2>
              <button 
                onClick={() => setIsCategoryModalOpen(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveCategory} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Nombre de Categoría</label>
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
                <label className="text-[13px] font-semibold text-on-surface block">Descripción (Opcional)</label>
                <textarea 
                  value={newCategory.description}
                  onChange={e => setNewCategory({...newCategory, description: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none h-24" 
                  placeholder="Breve descripción de los productos..."
                ></textarea>
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
    </div>
  );
}
