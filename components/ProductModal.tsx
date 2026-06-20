"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInventoryStore } from "@/stores/inventory.store";

interface ProductModalProps {
  onClose: () => void;
}

function IconInfo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function IconExternalLink(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function ProductModal({ onClose }: ProductModalProps) {
  const router = useRouter();
  const categories = useInventoryStore((s) => s.categories);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addProduct = useInventoryStore((s) => s.addProduct);

  useEffect(() => {
    if (categories.length === 0) fetchInventory();
  }, [categories.length, fetchInventory]);

  const [type, setType] = useState("Producto");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("Unidad");
  const [bodega, setBodega] = useState("Principal");
  const [quantity, setQuantity] = useState("0");
  const [cost, setCost] = useState("0");
  const [basePrice, setBasePrice] = useState("0");
  const [tax, setTax] = useState("Ninguno");

  const taxMultiplier = tax === "Ninguno" ? 1 : 1.19; // Ejemplo simplificado
  const finalPrice = (parseFloat(basePrice || "0") * taxMultiplier).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "Combo") return;

    const isService = type === "Servicio";

    const ok = await addProduct({
      name,
      category_id: categoryId,
      distributor_id: "",
      sku: `PRD-${Math.floor(Math.random() * 100000)}`,
      unit,
      purchase_price: isService ? "0" : cost,
      price: finalPrice, // Guardar precio final como precio de venta
      stock_level: isService ? "0" : quantity,
      image_url: "",
    });
    if (ok) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-surface-container-lowest rounded-[24px] w-full max-w-2xl border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-on-surface">Crear nuevo producto</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-6 flex-1 overflow-y-auto">
          {/* Tipo de producto */}
          <div className="space-y-3">
            <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
              Tipo de producto <span className="text-primary">*</span>
              <IconInfo className="w-4 h-4 text-primary" />
            </label>
            <div className="flex gap-4">
              {["Producto", "Servicio", "Combo"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    type === t
                      ? "border-primary text-primary bg-primary/5"
                      : "border-outline-variant/30 text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-xs text-on-surface-variant">
              Ten en cuenta que, una vez creado, no podrás cambiar el tipo de producto ni su condición variable.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Nombre */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Nombre <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Categoría */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Categoría <IconInfo className="w-4 h-4 text-primary" />
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
              >
                <option value="">Seleccionar</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Unidad de medida */}
            <div className={`space-y-1.5 ${type !== "Producto" ? "sm:col-span-2" : ""}`}>
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Unidad de medida <span className="text-primary">*</span>
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
              >
                <option value="Unidad">Unidad</option>
                <option value="Kg">Kg</option>
                <option value="Litro">Litro</option>
              </select>
            </div>

            {type === "Producto" && (
              <>
                {/* Bodega */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Bodega <span className="text-primary">*</span>
                    <IconInfo className="w-4 h-4 text-primary" />
                  </label>
                  <select
                    value={bodega}
                    onChange={(e) => setBodega(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
                  >
                    <option value="Principal">Principal</option>
                  </select>
                </div>

                {/* Cantidad */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Cantidad <span className="text-primary">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Costo inicial */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Costo inicial por unidad <span className="text-primary">*</span>
                    <IconInfo className="w-4 h-4 text-primary" />
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    required
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </>
            )}
          </div>

          {/* Precios */}
          <div className="flex flex-col sm:flex-row items-end gap-3 pt-2">
            <div className="space-y-1.5 flex-1 w-full">
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Precio base <span className="text-primary">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                required
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>

            <div className="space-y-1.5 flex-1 w-full">
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Impuestos
              </label>
              <select
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
              >
                <option value="Ninguno">Ninguno</option>
                <option value="19%">IVA 19%</option>
              </select>
            </div>

            <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>

            <div className="space-y-1.5 flex-1 w-full">
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Precio final <span className="text-primary">*</span>
              </label>
              <input
                type="number"
                value={finalPrice}
                readOnly
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary opacity-80 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Botones */}
          <div className="pt-6 flex flex-col sm:flex-row justify-between gap-4 border-t border-outline-variant/10">
            {type === "Combo" ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/dashboard/inventory/product?type=combo");
                }}
                className="w-full px-8 py-3 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors flex justify-center items-center gap-2"
              >
                <IconExternalLink className="w-4 h-4" />
                Completar combo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/dashboard/inventory/product?type=${type.toLowerCase()}`);
                  }}
                  className="px-6 py-3 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors flex justify-center items-center gap-2"
                >
                  <IconExternalLink className="w-4 h-4" />
                  Ir al formulario avanzado
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors flex justify-center items-center"
                >
                  {type === "Servicio" ? "Crear servicio" : "Crear producto"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
