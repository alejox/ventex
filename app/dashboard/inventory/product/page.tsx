"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useInventoryStore } from "@/stores/inventory.store";
import type { NewProductInput } from "@/services/inventory.service";
import { DistributorQuickModal } from "@/components/DistributorQuickModal";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { BarcodeField } from "@/components/BarcodeField";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import { usePricePair } from "@/lib/usePricePair";
import { useBusinessTax } from "@/lib/useBusinessTax";

function ProductForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const parentId = searchParams.get("parent_id");

  /**
   * Vista desde la que se abrió el formulario: al volver (o al guardar) se
   * regresa ahí, no siempre a inventario. Se acotan las rutas internas del
   * dashboard para que un `from` manipulado no redirija fuera de la app.
   */
  const from = searchParams.get("from");
  const backTo =
    from && /^\/dashboard\/[a-z0-9/-]*$/i.test(from) ? from : "/dashboard/inventory";

  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const distributors = useInventoryStore((s) => s.distributors);
  const error = useInventoryStore((s) => s.error);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addProduct = useInventoryStore((s) => s.addProduct);
  const updateProduct = useInventoryStore((s) => s.updateProduct);

  const [form, setForm] = useState<NewProductInput>({
    name: "",
    category_id: "",
    distributor_id: "",
    // Viene del query param al crear una variante: se siembra acá y no en un
    // efecto, que solo servía para copiar el mismo valor al estado.
    parent_product_id: !editId && parentId ? parentId : "",
    sku: "",
    barcode: "",
    package_price: "",
    unit: "Unidad",
    purchase_price: "",
    price: "",
    image_url: "",
    has_commission: false,
    commission_type: "percentage",
    commission_value: "",
    units_per_package: "1",
  });
  const handleDistributorCreated = () => {
    fetchInventory();
  };
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seededId, setSeededId] = useState<string | null>(null);
  const [distributorModalOpen, setDistributorModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [purchasePriceTax, setPurchasePriceTax] = useState("IVA");
  const [sellingPriceTax, setSellingPriceTax] = useState("IVA");

  // La tasa sale de los ajustes del negocio, no de un 19% escrito a mano.
  //
  // COMPRA y VENTA usan tasas distintas a propósito: un negocio no responsable
  // de IVA igual se lo paga al proveedor (`rawRate`), pero no lo cobra en sus
  // propios precios (`rate`, que en ese caso vale 0).
  const { rate: taxRate, rawRate, includeTax, percentLabel, rawPercentLabel } = useBusinessTax();
  const purchaseMultiplier = purchasePriceTax === "Ninguno" ? 1 : 1 + rawRate;
  const sellingMultiplier = sellingPriceTax === "Ninguno" ? 1 : 1 + taxRate;

  /**
   * Base y total son los DOS editables, y cada uno recalcula el otro. Por eso
   * se guardan ambos strings en vez de derivar uno del otro: si el total se
   * recalculara desde la base en cada tecla, escribir "50000" en el total lo
   * reescribiría a mitad de camino y no se podría teclear.
   */
  const [purchase, setPurchase] = usePricePair(purchaseMultiplier);
  const [selling, setSelling] = usePricePair(sellingMultiplier);
  const purchasePriceTotal = purchase.total;
  const sellingPriceTotal = selling.total;

  /** Margen real que queda, para que el precio no se ponga a ciegas. */
  const margin = (() => {
    const cost = parseFloat(purchase.total || "0");
    const price = parseFloat(selling.total || "0");
    if (!(cost > 0) || !(price > 0)) return null;
    const units = Math.max(parseInt(form.units_per_package || "1") || 1, 1);
    const costPerUnit = cost / units;
    return { pct: ((price - costPerUnit) / costPerUnit) * 100, costPerUnit };
  })();

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const packageHint = (() => {
    const boxPrice = parseFloat(form.package_price ?? "");
    const units = parseInt(form.units_per_package || "1");
    const unitPrice = parseFloat(sellingPriceTotal || "0");
    if (!Number.isFinite(boxPrice) || boxPrice <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return "";
    }
    if (units <= 1) return "Define primero cuántas unidades trae la caja.";
    const perUnit = boxPrice / units;
    const label = `Sale a $${perUnit.toLocaleString("en-US", { maximumFractionDigits: 0 })} por unidad`;
    return perUnit > unitPrice
      ? `${label}: MÁS CARA que vender suelto ($${unitPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}).`
      : `${label}, contra $${unitPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })} suelto.`;
  })();

  const editingProduct = editId ? products.find((p) => p.id === editId) : undefined;

  // Siembra del formulario en edición. Se hace DURANTE el render (patrón oficial
  // de React para ajustar estado cuando cambia una entrada) y no en un efecto:
  // copiar el producto al estado desde un efecto dispara renders en cascada.
  // `seededId` garantiza que solo corra una vez por producto, así lo que el
  // usuario escribe no se pisa cuando el store se refresca.
  if (editingProduct && seededId !== editingProduct.id) {
    setSeededId(editingProduct.id);
    setForm({
      name: editingProduct.name,
      category_id: editingProduct.category_id ?? "",
      distributor_id: editingProduct.distributor_id ?? "",
      parent_product_id: editingProduct.parent_product_id ?? "",
      sku: editingProduct.sku,
      barcode: editingProduct.barcode ?? "",
      package_price: editingProduct.package_price != null ? String(editingProduct.package_price) : "",
      unit: editingProduct.unit,
      purchase_price: String(editingProduct.purchase_price ?? ""),
      price: String(editingProduct.price),
      stock_level: String(editingProduct.stock_level),
      image_url: editingProduct.image_url ?? "",
      has_commission: editingProduct.has_commission ?? false,
      commission_type: editingProduct.commission_type ?? "percentage",
      commission_value: editingProduct.commission_value ? String(editingProduct.commission_value) : "",
      units_per_package: editingProduct.units_per_package ? String(editingProduct.units_per_package) : "1",
    });
    setPurchase.fromTotal(String(editingProduct.purchase_price ?? "0"));
    setSelling.fromTotal(String(editingProduct.price ?? "0"));
    if (editingProduct.image_url) setImagePreview(editingProduct.image_url);
  }

  // El id no existe en el inventario del negocio: navegar es un efecto, no estado.
  useEffect(() => {
    if (editId && products.length > 0 && !editingProduct) {
      router.push("/dashboard/inventory");
    }
  }, [editId, products.length, editingProduct, router]);

  const loadingProduct = !!editId && seededId !== editId;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file && file.type.startsWith("image/")) {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const resetImage = () => {
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    setImageFile(null);
    setForm((prev) => ({ ...prev, image_url: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      purchase_price: purchasePriceTotal,
      price: sellingPriceTotal,
      stock_level: editId ? String(form.stock_level || "0") : "0",
    };
    const ok = editId
      ? await updateProduct(editId, payload, imageFile)
      : await addProduct(payload, imageFile);
    const success = typeof ok === "string" || ok === true;
    setSaving(false);
    if (success) router.push(backTo);
  };

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-on-surface-variant">Cargando producto…</p>
      </div>
    );
  }

  return (
    /* El layout del dashboard ya aporta el padding de página: aquí solo el ancho. */
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link
          href={backTo}
          aria-label="Volver"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
            {editId ? "Editar Producto" : "Nuevo Producto"}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {editId ? "Actualiza los datos del producto" : "Registra un nuevo producto en tu inventario"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-surface-container rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm p-4 sm:p-8 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-on-surface mb-1">Imagen del Producto</h2>
            <p className="text-sm text-on-surface-variant">Sube una foto para identificar el producto visualmente</p>
          </div>

          {imagePreview ? (
            <div className="flex items-center gap-6">
              <div className="relative w-28 h-28 rounded-2xl overflow-hidden border border-outline-variant/20 bg-surface-container-lowest shrink-0">
                <Image src={imagePreview} alt="Vista previa" fill sizes="112px" unoptimized className="object-cover" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-on-surface">Imagen cargada</p>
                <button type="button" onClick={resetImage} className="text-sm font-medium text-error hover:text-error-dim transition-colors">
                  Quitar imagen
                </button>
              </div>
            </div>
          ) : (
            <label
              className={`flex flex-col items-center justify-center gap-3 w-full py-10 rounded-2xl border-2 border-dashed bg-surface-container-lowest text-on-surface-variant cursor-pointer transition-all ${
                dragOver ? "border-primary bg-primary/5" : "border-outline-variant/30 hover:border-primary/50 hover:text-on-surface hover:bg-surface-container-lowest/80"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-8 h-8">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              {/* En un celular no se arrastra nada: ahí el texto tiene que
                  hablar de la cámara, que es lo que abre el input. */}
              <div className="text-center">
                <p className="text-sm font-medium sm:hidden">Toca para tomar la foto del producto</p>
                <p className="text-sm font-medium hidden sm:block">Arrastra una imagen o haz clic para subir</p>
                <p className="text-xs text-on-surface-variant/60 mt-1">Se optimiza a WebP antes de subirla</p>
              </div>
              <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
            </label>
          )}
        </div>

        <div className="bg-surface-container rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm p-4 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-on-surface mb-1">Informaci&oacute;n General</h2>
            <p className="text-sm text-on-surface-variant">Datos b&aacute;sicos del producto</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Nombre del Producto</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. Queso Fresco"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label htmlFor="product-category" className="text-[13px] font-semibold text-on-surface block">Categor&iacute;a</label>
              {/* Mismo par selector + "＋" que Proveedor: quien está dando de alta
                  un producto y descubre que le falta la categoría no debería
                  tener que abandonar el formulario y perder lo escrito. */}
              <div className="flex gap-2 items-center">
                <Select
                  id="product-category"
                  containerClassName="flex-1 min-w-0"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="" disabled>Selecciona...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(true)}
                  className="shrink-0 w-11 py-3 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                  title="Crear nueva categoría"
                  aria-label="Crear nueva categoría"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-distributor" className="text-[13px] font-semibold text-on-surface block">Proveedor</label>
              <div className="flex gap-2 items-center">
                <Select
                  id="product-distributor"
                  containerClassName="flex-1 min-w-0"
                  value={form.distributor_id}
                  onChange={(e) => setForm({ ...form, distributor_id: e.target.value })}
                >
                  <option value="">Sin proveedor</option>
                  {distributors.map((d) => (
                    <option key={d.id} value={d.id}>{d.business_name}</option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setDistributorModalOpen(true)}
                  className="shrink-0 w-11 py-3 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                  title="Crear nuevo proveedor"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
            <Select
              label="Unidad de Medida"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              <option value="Unidad">Unidad</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="lb">lb</option>
              <option value="L">L</option>
              <option value="ml">ml</option>
              <option value="m">m</option>
              <option value="cm">cm</option>
              <option value="Par">Par</option>
              <option value="Docena">Docena</option>
              <option value="Caja">Caja</option>
              <option value="Pack">Pack</option>
            </Select>
            <Select
              label="Producto padre (opcional)"
              value={form.parent_product_id}
              onChange={(e) => setForm({ ...form, parent_product_id: e.target.value })}
            >
              <option value="">Es producto principal</option>
              {products
                .filter((p) => !p.parent_product_id && p.id !== editId)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono placeholder:text-on-surface-variant/50"
                placeholder="Ej. QSO-001"
                required
              />
            </div>

            {/* Código de barras: el del empaque, distinto del SKU interno. Se
                escanea con la cámara o lo teclea un lector láser de mostrador. */}
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="advanced-product-barcode" className="text-[13px] font-semibold text-on-surface block">
                Código de barras <span className="text-on-surface-variant font-normal">(opcional)</span>
              </label>
              <BarcodeField
                id="advanced-product-barcode"
                value={form.barcode ?? ""}
                onChange={(code) => setForm({ ...form, barcode: code })}
              />
            </div>
          </div>

          <div className="border-t border-outline-variant/10 pt-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-on-surface">Precio de Compra (Paquete)</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Escribe en cualquiera de los dos: el otro se calcula solo.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="space-y-1.5 flex-1 w-full">
                <label className="text-[13px] font-semibold text-on-surface block">Precio base</label>
                <MoneyInput
                  aria-label="Precio base de compra"
                  value={purchase.base}
                  onChange={setPurchase.fromBase}
                />
              </div>
              <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>
              <Select
                label="IVA"
                containerClassName="flex-1 w-full"
                value={purchasePriceTax}
                onChange={(e) => setPurchasePriceTax(e.target.value)}
              >
                <option value="Ninguno">Ninguno</option>
                <option value="IVA">{rawPercentLabel}</option>
              </Select>
              <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>
              <div className="space-y-1.5 flex-1 w-full">
                <label className="text-[13px] font-semibold text-on-surface block">Total</label>
                <MoneyInput
                  aria-label="Total de compra con IVA"
                  value={purchase.total}
                  onChange={setPurchase.fromTotal}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-outline-variant/10 pt-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-on-surface">Precio de Venta (Unidad)</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Escribe el precio de vitrina en el Total y el IVA se desglosa hacia atrás.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="space-y-1.5 flex-1 w-full">
                <label className="text-[13px] font-semibold text-on-surface block">Precio base</label>
                <MoneyInput
                  aria-label="Precio base de venta"
                  value={selling.base}
                  onChange={setSelling.fromBase}
                />
              </div>
              <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>
              <Select
                label="IVA"
                containerClassName="flex-1 w-full"
                value={sellingPriceTax}
                onChange={(e) => setSellingPriceTax(e.target.value)}
              >
                <option value="Ninguno">Ninguno</option>
                {includeTax && <option value="IVA">{percentLabel}</option>}
              </Select>
              <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>
              <div className="space-y-1.5 flex-1 w-full">
                <label className="text-[13px] font-semibold text-on-surface block">
                  Total <span className="text-on-surface-variant font-normal">(vitrina)</span>
                </label>
                <MoneyInput
                  aria-label="Precio final de venta con IVA"
                  value={selling.total}
                  onChange={setSelling.fromTotal}
                  required
                />
              </div>
            </div>

            {/* El margen dejó de ser un MODO de carga para ser lo que siempre
                fue: el resultado. Se mira, no se elige. */}
            {margin && (
              <p className={`text-xs font-medium ${margin.pct < 0 ? "text-error" : "text-on-surface-variant"}`}>
                Margen: <strong className="font-mono">{margin.pct.toFixed(1)}%</strong> sobre un costo de{" "}
                <span className="font-mono">${margin.costPerUnit.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span> por unidad
                {margin.pct < 0 ? " — estás vendiendo a pérdida." : ""}
              </p>
            )}
          </div>

          {/* Venta por caja. El stock SIEMPRE se cuenta en unidades sueltas:
              vender una caja descuenta las que trae. Sin precio de caja el
              producto simplemente no se ofrece por caja en el POS. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Unidades por Caja <span className="text-on-surface-variant font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.units_per_package}
                onChange={(e) => setForm({ ...form, units_per_package: e.target.value })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                placeholder="Ej. 24"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Precio de venta por Caja <span className="text-on-surface-variant font-normal">(opcional)</span>
              </label>
              <MoneyInput
                aria-label="Precio de venta por caja"
                value={form.package_price ?? ""}
                onChange={(raw) => setForm({ ...form, package_price: raw })}
                placeholder="Vacío = no se vende por caja"
              />
              {packageHint && <p className="text-xs text-on-surface-variant">{packageHint}</p>}
            </div>
          </div>

          {editId && (
            <div className="flex items-center gap-4 px-1">
              <div className="text-sm text-on-surface-variant">
                Stock actual: <strong className="text-on-surface">{form.stock_level || "0"}</strong>
              </div>
              <a
                href={`/dashboard/inventory/movements?product_id=${editId}`}
                className="text-xs font-semibold text-primary hover:text-primary-dim transition-colors"
              >
                Ver movimientos →
              </a>
            </div>
          )}

          {editId && (() => {
            const currentProduct = products.find((p) => p.id === editId);
            const variantList = currentProduct?.variants ?? [];
            if (variantList.length === 0) return null;
            return (
              <div className="pt-4 border-t border-outline-variant/10">
                <h3 className="text-sm font-bold text-on-surface mb-3">Variantes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {variantList.map((v) => (
                    <a
                      key={v.id}
                      href={`/dashboard/inventory/product?id=${v.id}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/10 hover:border-primary/30 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-on-surface">{v.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {v.unit} — Stock: {v.stock_level}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-primary">Editar →</span>
                    </a>
                  ))}
                </div>
                <a
                  href={`/dashboard/inventory/product?parent_id=${editId}`}
                  className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary hover:text-primary-dim transition-colors"
                >
                  + Agregar variante
                </a>
              </div>
            );
          })()}

          {/* Comisión */}
          <div className="pt-4 border-t border-outline-variant/10">
            <div className="flex items-center gap-3 mb-4">
              <button
                type="button"
                onClick={() => setForm({ ...form, has_commission: !form.has_commission, commission_type: "percentage", commission_value: "" })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  form.has_commission ? "bg-[#6063ee]" : "bg-outline-variant/30"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.has_commission ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
              <div>
                <p className="text-sm font-semibold text-on-surface">Genera comisión</p>
                <p className="text-xs text-on-surface-variant">Asigna una comisión al personal por este producto</p>
              </div>
            </div>

            {form.has_commission && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 pl-0 sm:pl-14">
                <Select
                  label="Tipo de comisión"
                  value={form.commission_type}
                  onChange={(e) => setForm({ ...form, commission_type: e.target.value })}
                >
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="fixed">Valor fijo ($)</option>
                </Select>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">
                    {form.commission_type === "fixed" ? "Valor por unidad ($)" : "Porcentaje (%)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={form.commission_type === "fixed" ? "999999" : "100"}
                    value={form.commission_value}
                    onChange={(e) => setForm({ ...form, commission_value: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                    placeholder={form.commission_type === "fixed" ? "0.00" : "0"}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">{error}</p>}

        <div className="flex justify-between items-center pt-2">
          <Link
            href="/dashboard/inventory"
            className="px-5 py-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_30px_rgba(96,99,238,0.35)]"
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Guardando…
              </>
            ) : editId ? "Guardar Cambios" : "Guardar Producto"}
          </button>
        </div>
      </form>

      {distributorModalOpen && (
        <DistributorQuickModal
          onClose={() => setDistributorModalOpen(false)}
          onCreated={handleDistributorCreated}
        />
      )}

      {categoryModalOpen && (
        <CategoryQuickModal
          onClose={() => setCategoryModalOpen(false)}
          onCreated={(id) => setForm((prev) => ({ ...prev, category_id: id }))}
        />
      )}
    </div>
  );
}

export default function ProductFormPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-on-surface-variant">Cargando…</div>}>
      <ProductForm />
    </Suspense>
  );
}
