"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInventoryStore } from "@/stores/inventory.store";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { notifySuccess } from "@/lib/notifications";

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
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [unit, setUnit] = useState("Unidad");
  const [bodega, setBodega] = useState("Principal");
  const [quantity, setQuantity] = useState("0");
  const [unitsPerPackage, setUnitsPerPackage] = useState("24");
  const [packageBasePrice, setPackageBasePrice] = useState("0");
  const [tax, setTax] = useState("19%");
  const [unitSellingPrice, setUnitSellingPrice] = useState("0");

  const taxMultiplier = tax === "Ninguno" ? 1 : 1.19;
  const packageTotal = (parseFloat(packageBasePrice || "0") * taxMultiplier).toFixed(0);

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
      purchase_price: isService ? "0" : packageTotal,
      price: isService ? finalPriceValue : unitSellingPrice,
      stock_level: isService ? "0" : String(parseInt(quantity || "0") * parseInt(unitsPerPackage || "1")),
      image_url: "",
      has_commission: false,
      commission_type: "percentage",
      commission_value: "",
      units_per_package: isService ? "1" : (unitsPerPackage || "1"),
    });
    if (ok) {
      notifySuccess(
        type === "Servicio" ? "¡Servicio creado con éxito! 🎉" : "¡Producto creado con éxito! 🎉",
        type === "Servicio" 
          ? "El servicio ya está disponible en tu inventario."
          : "El producto ya está disponible en tu inventario."
      );
      onClose();
    }
  };

  // For services, keep the old price logic
  const [basePrice, setBasePrice] = useState("0");
  const [serviceTax, setServiceTax] = useState("Ninguno");
  const serviceTaxMultiplier = serviceTax === "Ninguno" ? 1 : 1.19;
  const finalPriceValue = (parseFloat(basePrice || "0") * serviceTaxMultiplier).toFixed(2);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
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

        <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} className="p-6 pt-0 space-y-6 flex-1 overflow-y-auto">
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
              <div className="flex gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
                >
                  <option value="">Seleccionar</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                  title="Crear nueva categoría"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Unidad de medida */}
            <div className="space-y-1.5">
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

                {/* Cantidad de paquetes */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Paquetes en stock <span className="text-primary">*</span>
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

            {/* Unidades por paquete (opcional) */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Unidades por paquete
                    <span className="text-xs text-on-surface-variant font-normal">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={unitsPerPackage}
                    onChange={(e) => setUnitsPerPackage(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Ej. 24"
                  />
                </div>
              </>
            )}
          </div>

          {/* Sección de precios */}
          {type === "Producto" ? (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-on-surface">Precio del paquete</h3>
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="space-y-1.5 flex-1 w-full">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Precio base <span className="text-primary">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={packageBasePrice}
                    onChange={(e) => setPackageBasePrice(e.target.value)}
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
                    Total del paquete <span className="text-primary">*</span>
                  </label>
                  <input
                    type="number"
                    value={packageTotal}
                    readOnly
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary opacity-80 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-outline-variant/10">
                <div className="space-y-1.5 max-w-xs">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Precio de venta por unidad <span className="text-primary">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={unitSellingPrice}
                    onChange={(e) => setUnitSellingPrice(e.target.value)}
                    required
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-xs text-on-surface-variant">
                    Precio al que se venderá cada unidad individual.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Servicios: precio base + impuesto = precio final */
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
                  value={serviceTax}
                  onChange={(e) => setServiceTax(e.target.value)}
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
                  value={finalPriceValue}
                  readOnly
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary opacity-80 cursor-not-allowed"
                />
              </div>
            </div>
          )}

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

      {categoryModalOpen && (
        <CategoryQuickModal onClose={() => setCategoryModalOpen(false)} />
      )}
    </div>
  );
}
