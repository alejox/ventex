"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInventoryStore } from "@/stores/inventory.store";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { BarcodeField } from "@/components/BarcodeField";
import { useBusinessTax } from "@/lib/useBusinessTax";
import { usePricePair } from "@/lib/usePricePair";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { notifySuccess } from "@/lib/notifications";

interface ProductModalProps {
  onClose: () => void;
  onCreated?: (productId: string, productName: string) => void;
  /** Código ya escaneado: el modal abre con el campo lleno. */
  initialBarcode?: string;
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

export function ProductModal({ onClose, onCreated, initialBarcode }: ProductModalProps) {
  const router = useRouter();
  const categories = useInventoryStore((s) => s.categories);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addProduct = useInventoryStore((s) => s.addProduct);

  useEffect(() => {
    if (categories.length === 0) fetchInventory();
  }, [categories.length, fetchInventory]);

  // La tasa sale de los ajustes del negocio, no de un 19% escrito a mano.
  //
  // COMPRA y VENTA usan tasas distintas a propósito: un negocio no responsable
  // de IVA igual se lo paga al proveedor (`rawRate`), pero no lo cobra en sus
  // propios precios (`rate`, que en ese caso vale 0).
  const { rate: taxRate, rawRate, includeTax, percentLabel, rawPercentLabel } = useBusinessTax();

  const [type, setType] = useState("Producto");
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [unit, setUnit] = useState("Unidad");
  const [bodega, setBodega] = useState("Principal");
  const [quantity, setQuantity] = useState("0");
  const [unitsPerPackage, setUnitsPerPackage] = useState("24");
  /** Unidad o caja: define cómo se cuenta el stock y si se ofrece precio de caja. */
  const [presentation, setPresentation] = useState<"unit" | "package">("unit");
  const [tax, setTax] = useState("IVA");
  const [packageSellingPrice, setPackageSellingPrice] = useState("");

  /** El stock siempre se guarda en unidades sueltas: una caja son N. */
  const initialStock =
    presentation === "package"
      ? (parseInt(quantity || "0") || 0) * Math.max(parseInt(unitsPerPackage || "1") || 1, 1)
      : parseInt(quantity || "0") || 0;

  // Base y total, editables por los dos lados: escribir uno recalcula el otro.
  const purchaseMultiplier = tax === "Ninguno" ? 1 : 1 + rawRate;
  const taxMultiplier = tax === "Ninguno" ? 1 : 1 + taxRate;
  const [packagePrice, setPackagePrice] = usePricePair(purchaseMultiplier);
  const [unitPrice, setUnitPrice] = usePricePair(taxMultiplier);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "Combo") return;

    const isService = type === "Servicio";

    // Lo que se guarda es SIEMPRE el precio final de vitrina (IVA incluido).
    const sellingPrice = type === "Producto" ? unitPrice.total : finalPriceValue;

    const result = await addProduct(
      {
        name,
        category_id: categoryId,
        distributor_id: "",
        // Vacío: el servicio genera el código interno. El alta rápida no pide
        // SKU a propósito — es el camino de los 20 segundos.
        sku: "",
        // Un servicio no tiene empaque, así que no lleva código de barras.
        barcode: isService ? "" : barcode,
        // Vacío = este producto no se vende por caja.
        package_price: isService || presentation !== "package" ? "" : packageSellingPrice,
        unit,
        purchase_price: isService ? "0" : packagePrice.total,
        price: sellingPrice,
        stock_level: isService ? "0" : String(initialStock),
        image_url: "",
        has_commission: false,
        commission_type: "percentage",
        commission_value: "",
        units_per_package: isService || presentation !== "package" ? "1" : (unitsPerPackage || "1"),
      },
      // El store sube la foto y guarda su URL; el servicio la convierte a WebP.
      isService ? null : imageFile,
    );
    if (result) {
      notifySuccess(
        type === "Servicio" ? "¡Servicio creado con éxito!" : "¡Producto creado con éxito!",
        type === "Servicio"
          ? "El servicio ya está disponible."
          : "El producto ya está disponible."
      );
      onCreated?.(typeof result === "string" ? result : "", name);
      onClose();
    }
  };

  // For services, keep the old price logic
  const [serviceTax, setServiceTax] = useState("Ninguno");
  const serviceTaxMultiplier = serviceTax === "Ninguno" ? 1 : 1 + taxRate;
  const [servicePrice, setServicePrice] = usePricePair(serviceTaxMultiplier);
  const finalPriceValue = servicePrice.total;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="bg-surface-container-lowest rounded-t-[24px] sm:rounded-[24px] w-full max-w-2xl max-h-[92dvh] sm:max-h-[88dvh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col"
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
          {/* Foto. `capture="environment"` hace que el celular abra la cámara
              trasera directo; en escritorio el mismo input abre el explorador. */}
          {type !== "Servicio" && (
            <label className="flex items-center gap-4 p-3 rounded-2xl border border-dashed border-outline-variant/40 cursor-pointer hover:bg-surface-container-low transition-colors">
              <div className="w-16 h-16 shrink-0 rounded-xl bg-surface-container-high overflow-hidden flex items-center justify-center text-on-surface-variant">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob local, no pasa por el optimizador
                  <img src={imagePreview} alt="Vista previa del producto" className="w-full h-full object-cover" />
                ) : (
                  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="w-7 h-7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface">
                  {imageFile ? "Cambiar foto" : "Tomar foto del producto"}
                </p>
                <p className="text-xs text-on-surface-variant truncate">
                  {imageFile ? imageFile.name : "Opcional. Se optimiza a WebP antes de subirla."}
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImageFile(file);
                  setImagePreview(file ? URL.createObjectURL(file) : "");
                }}
              />
            </label>
          )}

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

            {/* Código de barras: se escanea con la cámara del celular o se
                escribe (los lectores láser de mostrador teclean en el campo). */}
            {type === "Producto" && (
              <div className="space-y-1.5">
                <label htmlFor="product-barcode" className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                  Código de barras
                  <span className="text-xs text-on-surface-variant font-normal">(opcional)</span>
                </label>
                <BarcodeField id="product-barcode" value={barcode} onChange={setBarcode} />
              </div>
            )}

            {/* Categoría */}
            <div className="space-y-1.5">
              <label htmlFor="quick-product-category" className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Categoría <IconInfo className="w-4 h-4 text-primary" />
              </label>
              <div className="flex gap-2 items-center">
                <Select
                  id="quick-product-category"
                  containerClassName="flex-1 min-w-0"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                  title="Crear nueva categoría"
                  aria-label="Crear nueva categoría"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Unidad de medida */}
            <Select
              label="Unidad de medida"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="Unidad">Unidad</option>
              <option value="Kg">Kg</option>
              <option value="Litro">Litro</option>
            </Select>

            {type === "Producto" && (
              <>
                {/* Bodega */}
                <Select
                  label="Bodega"
                  value={bodega}
                  onChange={(e) => setBodega(e.target.value)}
                >
                  <option value="Principal">Principal</option>
                </Select>

              </>
            )}
          </div>

          {/* Presentación y stock. Mismo lenguaje que el formulario avanzado:
              el stock se cuenta en unidades sueltas y la caja solo dice cuántas
              trae cada una. */}
          {type === "Producto" && (
            <div className="space-y-3">
              <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                Presentación y stock inicial <span className="text-primary">*</span>
              </label>

              <div className="flex gap-3">
                {(["unit", "package"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPresentation(mode)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      presentation === mode
                        ? "border-primary text-primary bg-primary/5"
                        : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    {mode === "unit" ? "Unidad" : "Caja"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="quick-quantity" className="text-[13px] font-semibold text-on-surface block">
                    {presentation === "package" ? "Cajas que estás cargando" : "Unidades en stock"}
                  </label>
                  <input
                    id="quick-quantity"
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                {presentation === "package" && (
                  <div className="space-y-1.5">
                    <label htmlFor="quick-units-per-package" className="text-[13px] font-semibold text-on-surface block">
                      Unidades por caja
                    </label>
                    <input
                      id="quick-units-per-package"
                      type="number"
                      min="1"
                      value={unitsPerPackage}
                      onChange={(e) => setUnitsPerPackage(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="Ej. 60"
                    />
                  </div>
                )}
              </div>

              {presentation === "package" && (
                <p className="text-sm text-on-surface">
                  Stock inicial: <strong className="font-mono text-primary">{initialStock}</strong> unidades
                  <span className="text-xs text-on-surface-variant font-normal">
                    {" "}({quantity || "0"} × {unitsPerPackage || "1"})
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Sección de precios */}
          {type === "Producto" ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-on-surface">Precio del paquete (compra)</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Escribe en cualquiera de los dos: el otro se calcula solo.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="space-y-1.5 flex-1 w-full">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Precio base <span className="text-primary">*</span>
                  </label>
                  <MoneyInput
                    aria-label="Precio base del paquete"
                    value={packagePrice.base}
                    onChange={setPackagePrice.fromBase}
                    required
                  />
                </div>
                <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>
                <Select
                  label="Impuestos"
                  containerClassName="flex-1 w-full"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                >
                  <option value="Ninguno">Ninguno</option>
                  <option value="IVA">IVA {rawPercentLabel}</option>
                </Select>
                <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>
                <div className="space-y-1.5 flex-1 w-full">
                  <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                    Total del paquete <span className="text-primary">*</span>
                  </label>
                  <MoneyInput
                    aria-label="Total del paquete con impuestos"
                    value={packagePrice.total}
                    onChange={setPackagePrice.fromTotal}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-outline-variant/10 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Precio de venta (unidad)</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {includeTax
                      ? "El Total es el precio de vitrina: el IVA se desglosa hacia atrás."
                      : "Tu negocio no factura IVA: el precio de venta no lo suma, aunque sí lo pagues al proveedor."}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="space-y-1 flex-1 w-full">
                    <label className="flex items-center gap-1 text-xs font-semibold text-on-surface">
                      Precio base
                    </label>
                    <MoneyInput
                      aria-label="Precio base de venta por unidad"
                      value={unitPrice.base}
                      onChange={setUnitPrice.fromBase}
                    />
                  </div>
                  <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>
                  <div className="space-y-1 flex-1 w-full">
                    <label className="flex items-center gap-1 text-xs font-semibold text-on-surface">IVA</label>
                    <div className="pt-3 text-xs text-on-surface-variant">
                      {tax === "Ninguno"
                        ? "Sin IVA"
                        : `${percentLabel} → $${(
                            parseFloat(unitPrice.total || "0") - parseFloat(unitPrice.base || "0")
                          ).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    </div>
                  </div>
                  <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>
                  <div className="space-y-1 flex-1 w-full">
                    <label className="flex items-center gap-1 text-xs font-semibold text-on-surface">
                      Total <span className="text-primary">*</span>
                    </label>
                    <MoneyInput
                      aria-label="Precio final de venta por unidad"
                      value={unitPrice.total}
                      onChange={setUnitPrice.fromTotal}
                      required
                    />
                  </div>
                </div>

                {/* Vender también por caja. Solo tiene sentido si el producto
                    se maneja por caja; si no, el campo sobra. */}
                {presentation === "package" && (
                  <div className="space-y-1 pt-3 border-t border-outline-variant/10">
                    <label htmlFor="package-price" className="flex items-center gap-1 text-xs font-semibold text-on-surface">
                      Precio de venta por caja de {unitsPerPackage || "1"}
                      <span className="text-on-surface-variant font-normal">(opcional)</span>
                    </label>
                    <MoneyInput
                      id="package-price"
                      aria-label="Precio de venta por caja"
                      value={packageSellingPrice}
                      onChange={setPackageSellingPrice}
                      placeholder="Vacío = no se vende por caja"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Servicios: precio base + impuesto = precio final */
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-2">
              <div className="space-y-1.5 flex-1 w-full">
                <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                  Precio base <span className="text-primary">*</span>
                </label>
                <MoneyInput
                  aria-label="Precio base del servicio"
                  value={servicePrice.base}
                  onChange={setServicePrice.fromBase}
                  required
                />
              </div>
              <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>
              <Select
                label="Impuestos"
                containerClassName="flex-1 w-full"
                value={serviceTax}
                onChange={(e) => setServiceTax(e.target.value)}
              >
                <option value="Ninguno">Ninguno</option>
                {includeTax && <option value="IVA">IVA {percentLabel}</option>}
              </Select>
              <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>
              <div className="space-y-1.5 flex-1 w-full">
                <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                  Precio final <span className="text-primary">*</span>
                </label>
                <MoneyInput
                  aria-label="Precio final del servicio"
                  value={servicePrice.total}
                  onChange={setServicePrice.fromTotal}
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
        <CategoryQuickModal
          onClose={() => setCategoryModalOpen(false)}
          onCreated={(id) => setCategoryId(id)}
        />
      )}
    </div>
  );
}
