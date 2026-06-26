"use client";

import { Suspense, useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useInventoryStore } from "@/stores/inventory.store";
import type { NewProductInput } from "@/services/inventory.service";

function ProductForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

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
    sku: "",
    unit: "Unidad",
    purchase_price: "",
    price: "",
    stock_level: "",
    image_url: "",
    has_commission: false,
    commission_type: "percentage",
    commission_value: "",
    units_per_package: "1",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(!!editId);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (!editId || products.length === 0) return;
    const product = products.find((p) => p.id === editId);
    if (!product) {
      router.push("/dashboard/inventory");
      return;
    }
    setForm({
      name: product.name,
      category_id: product.category_id ?? "",
      distributor_id: product.distributor_id ?? "",
      sku: product.sku,
      unit: product.unit,
      purchase_price: String(product.purchase_price ?? ""),
      price: String(product.price),
      stock_level: String(product.stock_level),
      image_url: product.image_url ?? "",
      has_commission: product.has_commission ?? false,
      commission_type: product.commission_type ?? "percentage",
      commission_value: product.commission_value ? String(product.commission_value) : "",
      units_per_package: product.units_per_package ? String(product.units_per_package) : "1",
    });
    if (product.image_url) setImagePreview(product.image_url);
    setLoadingProduct(false);
  }, [editId, products, router]);

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
    const ok = editId
      ? await updateProduct(editId, form, imageFile)
      : await addProduct(form, imageFile);
    setSaving(false);
    if (ok) router.push("/dashboard/inventory");
  };

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-on-surface-variant">Cargando producto…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/dashboard/inventory"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-on-surface tracking-tight">{editId ? "Editar Producto" : "Nuevo Producto"}</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {editId ? "Actualiza los datos del producto" : "Registra un nuevo producto en tu inventario"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm p-8 space-y-6">
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

          <div className="grid grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">Categor&iacute;a</label>
              <div className="relative">
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                  required
                >
                  <option value="" disabled>Selecciona...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">Proveedor</label>
              <div className="relative">
                <select
                  value={form.distributor_id}
                  onChange={(e) => setForm({ ...form, distributor_id: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                >
                  <option value="">Sin proveedor</option>
                  {distributors.map((d) => (
                    <option key={d.id} value={d.id}>{d.business_name}</option>
                  ))}
                </select>
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">Unidad de Medida</label>
              <div className="relative">
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                  required
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
                </select>
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-5">
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
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">Precio de Compra ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">Precio de Venta ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Nivel de Stock</label>
            <input
              type="number"
              value={form.stock_level}
              onChange={(e) => setForm({ ...form, stock_level: e.target.value })}
              className="w-full max-w-xs bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. 120"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Unidades por Paquete <span className="text-on-surface-variant font-normal">(opcional)</span></label>
            <input
              type="number"
              min="1"
              value={form.units_per_package}
              onChange={(e) => setForm({ ...form, units_per_package: e.target.value })}
              className="w-full max-w-xs bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. 24"
            />
          </div>

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
              <div className="grid grid-cols-2 gap-5 pl-14">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Tipo de comisión</label>
                  <div className="relative">
                    <select
                      value={form.commission_type}
                      onChange={(e) => setForm({ ...form, commission_type: e.target.value })}
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                    >
                      <option value="percentage">Porcentaje (%)</option>
                      <option value="fixed">Valor fijo ($)</option>
                    </select>
                    <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
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

        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm p-8 space-y-5">
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
              <div className="text-center">
                <p className="text-sm font-medium">Arrastra una imagen o haz clic para subir</p>
                <p className="text-xs text-on-surface-variant/60 mt-1">PNG, JPG, WEBP o GIF</p>
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageChange} className="hidden" />
            </label>
          )}
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
