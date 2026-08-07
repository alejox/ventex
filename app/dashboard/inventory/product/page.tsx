"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInventoryStore } from "@/stores/inventory.store";
import type { NewProductInput, Product } from "@/services/inventory.service";
import { calculateMargin, handlePresentationModeChange } from "@/services/inventory.service";
import { DistributorQuickModal } from "@/components/DistributorQuickModal";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { BarcodeField } from "@/components/BarcodeField";
import { Select } from "@/components/ui/Select";
import { usePricePair } from "@/lib/usePricePair";
import { useBusinessTax } from "@/lib/useBusinessTax";
import { useBarcodeLookup } from "@/lib/useBarcodeLookup";
import type { OpenFactsProduct } from "@/services/openfacts.service";
import { StockAdjustmentModal } from "@/components/StockAdjustmentModal";
import { ProductImageUpload } from "./components/ProductImageUpload";
import { ParentProductSearch } from "./components/ParentProductSearch";
import { ProductPricingSection } from "./components/ProductPricingSection";
import { ProductPresentationSection } from "./components/ProductPresentationSection";

const UNIT_MAP: Record<string, string> = {
  ml: "ml", cl: "ml", l: "L", dl: "L",
  g: "g", kg: "kg", lb: "lb", oz: "g",
  m: "m", cm: "cm",
  unidad: "Unidad", un: "Unidad", docena: "Docena",
  pack: "Pack", caja: "Caja",
};

function parseQuantityUnit(raw: string): string | undefined {
  const lower = raw.toLowerCase().trim();
  const parts = lower.split(/\s+/);
  for (const p of parts) {
    const match = UNIT_MAP[p];
    if (match) return match;
  }
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const PARENT_SEPARATORS = [" - ", " – ", " — ", " -", "- ", "–", "—", "-"];

/**
 * Detecta si el texto tipeado coincide con un producto padre existente (nombre
 * exacto, o nombre + separador + etiqueta), para preseleccionarlo en vez de
 * crear un padre nuevo.
 *
 * Gana el nombre más largo: "MEMORIA USB LITE" se detecta antes que
 * "MEMORIA USB" para un texto "MEMORIA USB LITE - ROJO".
 */
function detectExistingParent(
  text: string,
  parents: Array<Pick<Product, "id" | "name">>
): { parent: Pick<Product, "id" | "name">; label: string } | null {
  const upper = text.trim().toUpperCase();
  if (!upper) return null;
  const sorted = [...parents].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const pName = p.name.trim().toUpperCase();
    if (upper === pName) return { parent: p, label: "" }; // coincidencia exacta
    for (const sep of PARENT_SEPARATORS) {
      if (upper.startsWith(pName + sep)) {
        return { parent: p, label: upper.slice((pName + sep).length).trim() };
      }
    }
  }
  return null;
}

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
  const resetParentStock = useInventoryStore((s) => s.resetParentStock);

  const [parentStockModal, setParentStockModal] = useState<{
    parentProduct: Product;
    pendingPayload: NewProductInput;
  } | null>(null);

  const [form, setForm] = useState<NewProductInput>({
    name: "",
    variant_label: "",
    category_id: "",
    distributor_id: "",
    // Seeded from query param when coming from the "+ Variant" button.
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
  // When a parent_id comes from the URL the product is already a variant.
  const [isVariant, setIsVariant] = useState(!!(!editId && parentId));
  const [variantLabel, setVariantLabel] = useState("");
  // "Crear padre nuevo" es una decisión explícita del usuario, nunca el default.
  const [createNewParent, setCreateNewParent] = useState(false);
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
  const [itemType, setItemType] = useState<"Producto" | "Servicio">("Producto");
  const [serviceFinalPrice, setServiceFinalPrice] = useState("");
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  /**
   * Cómo se maneja el producto. Arranca en "unidad" porque es lo que aplica a
   * la mayoría; la caja es una decisión que se toma, no un default que se sufre.
   * En edición se siembra según lo que ya tenga guardado.
   */
  const [presentation, setPresentation] = useState<"unit" | "package">("unit");
  const [initialUnits, setInitialUnits] = useState("");
  const [initialPackages, setInitialPackages] = useState("");
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
  const serviceMultiplier = sellingPriceTax === "Ninguno" ? 1 : 1 + taxRate;
  const serviceFinalValue = parseFloat(serviceFinalPrice || "0");
  const serviceBaseValue = serviceFinalValue > 0 ? serviceFinalValue / serviceMultiplier : 0;
  const serviceTaxValue = Math.max(serviceFinalValue - serviceBaseValue, 0);

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
  const margin = calculateMargin(
    purchase.total,
    selling.total,
    presentation,
    form.units_per_package
  );

  const handlePresentationChange = (newMode: "unit" | "package") => {
    setPresentation(newMode);
    const patch = handlePresentationModeChange(newMode, form.units_per_package);
    setForm((prev) => ({
      ...prev,
      ...patch,
    }));
    if (newMode === "unit") {
      setInitialPackages("");
    }
  };

  /** Candidatos a producto padre: sin variantes, sin servicios y sin el propio producto en edición. */
  const parentCandidates = products.filter(
    (p) => !p.parent_product_id && p.id !== editId && p.unit !== "Servicio"
  );

  const handleParentProductChange = (parentId: string) => {
    const parent = products.find((p) => p.id === parentId);
    let label = variantLabel.trim();
    if (parent) {
      // Derivar la etiqueta restando el nombre del padre elegido al texto
      // tipeado; si el texto no empieza con ese nombre, conservar la actual.
      const typedUpper = form.name.trim().toUpperCase();
      const parentUpper = parent.name.trim().toUpperCase();
      let derived = "";
      for (const sep of PARENT_SEPARATORS) {
        if (typedUpper.startsWith(parentUpper + sep)) {
          derived = typedUpper.slice((parentUpper + sep).length).trim();
          break;
        }
      }
      // Sin separador, el resto del texto también puede ser la etiqueta:
      // "MEMORIA USB 128GB - NEGRO" con padre "MEMORIA USB" → "128GB - NEGRO".
      if (!derived && typedUpper.startsWith(parentUpper + " ")) {
        derived = typedUpper.slice(parentUpper.length + 1).trim();
      }
      if (derived) label = derived;
    }
    const labelUpper = label.toUpperCase();
    setVariantLabel(labelUpper);
    setForm((prev) => ({
      ...prev,
      parent_product_id: parentId,
      variant_label: labelUpper,
      name: parent ? (labelUpper ? `${parent.name} - ${labelUpper}` : parent.name) : prev.name,
    }));
    setCreateNewParent(false);
  };

  const handleVariantLabelChange = (label: string) => {
    const upperLabel = label.toUpperCase();
    setVariantLabel(upperLabel);
    setForm((prev) => {
      let newName = prev.name;
      if (prev.parent_product_id) {
        const parent = products.find((p) => p.id === prev.parent_product_id);
        if (parent) {
          newName = upperLabel.trim() ? `${parent.name} - ${upperLabel.trim()}` : parent.name;
        }
      }
      return {
        ...prev,
        name: newName,
        variant_label: upperLabel,
      };
    });
  };

  const handleVariantToggle = () => {
    const next = !isVariant;
    setIsVariant(next);
    setCreateNewParent(false);
    if (!next) {
      setVariantLabel("");
      setForm((prev) => ({ ...prev, parent_product_id: "", variant_label: "" }));
      return;
    }
    // Al activar, detectar si el nombre ya coincide con un padre existente: el
    // "crear padre nuevo" NUNCA queda preseleccionado por defecto.
    if (form.name.trim()) {
      const match = detectExistingParent(form.name, parentCandidates);
      if (
        match &&
        (match.label.trim() ||
          form.name.trim().toUpperCase() === match.parent.name.trim().toUpperCase())
      ) {
        setForm((prev) => ({
          ...prev,
          parent_product_id: match.parent.id,
          variant_label: match.label.toUpperCase(),
        }));
        setVariantLabel(match.label.toUpperCase());
      }
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  /** Stock inicial en unidades sueltas: una caja son N. */
  const initialStock =
    presentation === "package"
      ? (parseInt(initialPackages || "0") || 0) * Math.max(parseInt(form.units_per_package || "1") || 1, 1)
      : parseInt(initialUnits || "0") || 0;

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
    if (editingProduct.unit === "Servicio") setItemType("Servicio");
    const hasParent = !!editingProduct.parent_product_id;
    if (hasParent) setIsVariant(true);
    if (editingProduct.variant_label) setVariantLabel(editingProduct.variant_label);
    setCreateNewParent(false);
    setForm({
      name: editingProduct.name,
      variant_label: editingProduct.variant_label ?? "",
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
    setPresentation((editingProduct.units_per_package ?? 1) > 1 ? "package" : "unit");
    setPurchase.fromTotal(String(editingProduct.purchase_price ?? "0"));
    setSelling.fromTotal(String(editingProduct.price ?? "0"));
    setServiceFinalPrice(String(editingProduct.price ?? ""));
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
    // Guardia contra duplicación: el nombre coincide con un padre existente
    // pero el formulario crearía un padre nuevo y separado. Vale para el caso
    // explícito (createNewParent) y para el accidental (sin padre elegido).
    if (isVariant && !form.parent_product_id) {
      const duplicateMatch = detectExistingParent(form.name, parentCandidates);
      if (duplicateMatch) {
        const ok = window.confirm(
          `El nombre ingresado coincide con el producto existente "${duplicateMatch.parent.name}". Si guardas así, se creará un producto padre nuevo y separado. ¿Continuar?`
        );
        if (!ok) return; // no continuar, no setSaving
      }
    }
    setSaving(true);
    const isService = itemType === "Servicio";

    const parentProduct = isVariant && form.parent_product_id
      ? products.find((p) => p.id === form.parent_product_id)
      : null;

    let composedName = form.name.trim().toUpperCase();
    const labelUpper = variantLabel.trim().toUpperCase();

    if (isVariant && labelUpper) {
      if (parentProduct) {
        composedName = `${parentProduct.name} - ${labelUpper}`;
      } else if (composedName && !composedName.endsWith(` - ${labelUpper}`)) {
        composedName = `${composedName} - ${labelUpper}`;
      }
    }

    const payload = {
      ...form,
      name: composedName,
      variant_label: isVariant && variantLabel.trim() ? variantLabel.trim().toUpperCase() : "",
      parent_product_id: isVariant ? form.parent_product_id : "",
      purchase_price: isService ? "0" : purchasePriceTotal,
      price: isService ? serviceFinalPrice : sellingPriceTotal,
      stock_level: isService
        ? "0"
        : editId
          ? String(form.stock_level || "0")
          : String(initialStock),
      units_per_package: isService ? "1" : (presentation === "package" ? (form.units_per_package || "1") : "1"),
      package_price: isService ? "" : (presentation === "package" ? form.package_price : ""),
      barcode: isService ? "" : form.barcode,
      sku: isService ? "" : form.sku,
      unit: isService ? "Servicio" : form.unit,
    };
    // Transición de producto normal a agrupador: si el padre tiene stock previo y es su primera variante
    if (!editId && parentProduct && parentProduct.stock_level > 0 && (!parentProduct.variants || parentProduct.variants.length === 0)) {
      setSaving(false);
      setParentStockModal({ parentProduct, pendingPayload: payload });
      return;
    }

    const ok = editId
      ? await updateProduct(editId, payload, isService ? null : imageFile)
      : await addProduct(payload, isService ? null : imageFile);
    const success = typeof ok === "string" || ok === true;
    setSaving(false);
    if (success) router.push(backTo);
  };

  const handleBarcodeFound = useCallback(
    (product: OpenFactsProduct) => {
      if (editingProduct) return;
      setForm((prev) => {
        const next = { ...prev };
        if (!prev.name.trim() && product.name) next.name = product.name;
        if (prev.unit === "Unidad" && product.quantity) {
          const u = parseQuantityUnit(product.quantity);
          if (u) next.unit = u;
        }
        if (product.imageUrl && !prev.image_url) next.image_url = product.imageUrl;
        return next;
      });
      if (product.imageUrl && !imagePreview) {
        setImagePreview(product.imageUrl);
      }
    },
    [editingProduct, imagePreview],
  );

  const { searching, product: lookedUp } = useBarcodeLookup(
    form.barcode ?? "",
    handleBarcodeFound,
  );
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
            {editId ? "Editar" : "Nuevo"} {itemType === "Servicio" ? "Servicio" : "Producto"}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {editId
              ? "Actualiza los datos"
              : "Registra un nuevo producto o servicio en tu catálogo"}
          </p>
        </div>
      </div>

      {!editId && (
        <div className="flex gap-3 mb-6">
          {(["Producto", "Servicio"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setItemType(t);
                if (t === "Servicio" && !serviceFinalPrice) {
                  setServiceFinalPrice(selling.total);
                }
              }}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                itemType === t
                  ? "border-primary text-primary bg-primary/5"
                  : "border-outline-variant/30 text-on-surface hover:bg-surface-container-low"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {itemType === "Producto" && (
          <ProductImageUpload
            imagePreview={imagePreview}
            dragOver={dragOver}
            onImageChange={handleImageChange}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onReset={resetImage}
          />
        )}

        <div className="bg-surface-container rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm p-4 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-on-surface mb-1">Informaci&oacute;n General</h2>
            <p className="text-sm text-on-surface-variant">Datos b&aacute;sicos del producto o servicio</p>
          </div>

          {/* Name field & Category — 2 Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">
                  Nombre del {itemType === "Servicio" ? "servicio" : "producto"}
                </label>
                {isVariant ? (
                  <div className="w-full bg-surface-container border border-outline-variant/20 rounded-xl py-3 px-4 text-sm text-on-surface-variant font-mono tracking-wide">
                    {form.parent_product_id && variantLabel.trim()
                      ? `${products.find((p) => p.id === form.parent_product_id)?.name ?? ""} - ${variantLabel.trim().toUpperCase()}`
                      : <span className="italic text-on-surface-variant/50">Se genera al completar los campos de abajo</span>}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface uppercase focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                    placeholder={itemType === "Servicio" ? "Ej. Baño para mascotas" : "Ej. Queso Fresco"}
                    required={!isVariant}
                  />
                )}
              </div>

              {/* Variant toggle — only for products */}
              {itemType === "Producto" && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !isVariant;
                    setIsVariant(next);
                    if (!next) {
                      setVariantLabel("");
                      setForm((prev) => ({ ...prev, parent_product_id: "", variant_label: "" }));
                    }
                  }}
                  className="flex items-center gap-2.5 group"
                  aria-expanded={isVariant}
                >
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      isVariant ? "bg-primary" : "bg-outline-variant/30"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        isVariant ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                  <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">
                    Es una variante de otro producto
                  </span>
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-category" className="text-[13px] font-semibold text-on-surface block">Categoría</label>
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
          </div>

          {/* Variant sub-form — full width, below name & category row */}
          {itemType === "Producto" && isVariant && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl border border-primary/20 bg-primary/5">
              {/* Parent selector */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Producto padre</label>
                <Select
                  value={form.parent_product_id}
                  onChange={(e) => setForm({ ...form, parent_product_id: e.target.value })}
                  containerClassName="w-full"
                >
                  <option value="" disabled>Selecciona...</option>
                  {products
                    .filter((p) => !p.parent_product_id && p.id !== editId && p.unit !== "Servicio")
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </Select>
              </div>
              {/* Variant label */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Etiqueta de variante</label>
                <input
                  type="text"
                  value={variantLabel}
                  onChange={(e) => setVariantLabel(e.target.value.toUpperCase())}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface uppercase focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej: ROJO / L"
                  required={isVariant}
                />
                <p className="text-[11px] text-on-surface-variant">
                  Lo que diferencia esta variante (talla, color, volumen…)
                </p>
              </div>
            </div>
          )}

          {/* Distributor & Unit of Measure — 2 column grid for products */}
          {itemType === "Producto" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
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
            </div>
          )}



          {itemType === "Producto" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
              <div className="space-y-1.5">
                <label htmlFor="product-sku" className="text-[13px] font-semibold text-on-surface block">
                  SKU <span className="text-on-surface-variant font-normal">(opcional)</span>
                </label>
                <input
                  id="product-sku"
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono placeholder:text-on-surface-variant/50"
                  placeholder="Se genera solo si lo dejas vacío"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="advanced-product-barcode" className="text-[13px] font-semibold text-on-surface block">
                  Código de barras <span className="text-on-surface-variant font-normal">(opcional)</span>
                </label>
                <BarcodeField
                  id="advanced-product-barcode"
                  value={form.barcode ?? ""}
                  onChange={(code) => setForm({ ...form, barcode: code })}
                />
                {searching && (
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5 pt-1">
                    <span className="inline-block w-3 h-3 border-2 border-on-surface-variant/30 border-t-on-surface-variant rounded-full animate-spin" />
                    Buscando en Open Food Facts…
                  </p>
                )}
                {!searching && lookedUp && (
                  <p className="text-xs text-success flex items-center gap-1 pt-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Info encontrada: {lookedUp.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {itemType === "Producto" ? (
            <>
              <ProductPricingSection
                purchase={{ base: purchase.base, total: purchase.total, fromBase: setPurchase.fromBase, fromTotal: setPurchase.fromTotal }}
                selling={{ base: selling.base, total: selling.total, fromBase: setSelling.fromBase, fromTotal: setSelling.fromTotal }}
                purchasePriceTax={purchasePriceTax}
                setPurchasePriceTax={setPurchasePriceTax}
                sellingPriceTax={sellingPriceTax}
                setSellingPriceTax={setSellingPriceTax}
                rawPercentLabel={rawPercentLabel}
                percentLabel={percentLabel}
                includeTax={includeTax}
                margin={margin}
                presentation={presentation}
                unitsPerPackage={form.units_per_package ?? "1"}
              />

              {editingProduct && (editingProduct.variants?.length ?? 0) > 0 ? (
                <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-on-surface">Este producto agrupa variantes</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        El stock y su presentación se gestionan desde cada variante individual.
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/inventory?search=${encodeURIComponent(form.name)}`}
                    className="px-4 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-dim text-xs font-bold transition-colors shrink-0"
                  >
                    Ver variantes en inventario →
                  </Link>
                </div>
              ) : (
                <ProductPresentationSection
                  presentation={presentation}
                  setPresentation={handlePresentationChange}
                  editId={editId}
                  unitsPerPackage={form.units_per_package ?? "1"}
                  onUnitsPerPackageChange={(v) => setForm({ ...form, units_per_package: v })}
                  initialUnits={initialUnits}
                  setInitialUnits={setInitialUnits}
                  initialPackages={initialPackages}
                  setInitialPackages={setInitialPackages}
                  initialStock={initialStock}
                  packagePrice={form.package_price ?? ""}
                  onPackagePriceChange={(v) => setForm({ ...form, package_price: v })}
                  packageHint={packageHint}
                  stockLevel={form.stock_level ?? ""}
                  onAdjustStock={editId ? () => setAdjustModalOpen(true) : undefined}
                />
              )}
            </>
          ) : (
            <div className="pt-2">
              <h3 className="text-sm font-bold text-on-surface mb-2">Precio del servicio</h3>
              <p className="text-xs text-on-surface-variant mb-3">
                Ingresa el precio que pagará el cliente. El IVA se discrimina sin cambiar ese total.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)] gap-6 items-start">
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5 flex-1 max-w-[280px]">
                    <label className="text-[13px] font-semibold text-on-surface block">Precio final</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={serviceFinalPrice}
                        onChange={(e) => setServiceFinalPrice(e.target.value)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 pl-7 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>
                  {taxRate > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-semibold text-on-surface block">IVA</label>
                      <Select
                        value={sellingPriceTax}
                        onChange={(e) => setSellingPriceTax(e.target.value)}
                      >
                        <option value="IVA">{percentLabel}</option>
                        <option value="Ninguno">Ninguno</option>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-lowest px-5 py-4 text-sm">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Desglose del precio</p>
                    <div className="flex items-center justify-between gap-4 text-on-surface-variant">
                      <span>Precio antes de IVA</span>
                      <span>${formatAmount(serviceBaseValue)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-4 text-on-surface-variant">
                      <span>IVA{taxRate > 0 && sellingPriceTax !== "Ninguno" ? ` (${percentLabel})` : ""}</span>
                      <span>${formatAmount(serviceTaxValue)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-4 border-t border-outline-variant/15 pt-3 font-bold text-on-surface">
                      <span>Total a cobrar</span>
                      <span>${formatAmount(serviceFinalValue)}</span>
                    </div>
                </div>
              </div>
            </div>
          )}


          {itemType === "Producto" && editId && (() => {
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
            ) : editId
              ? "Guardar Cambios"
              : itemType === "Servicio"
                ? "Guardar Servicio"
                : "Guardar Producto"}
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

      {adjustModalOpen && editId && (
        <StockAdjustmentModal
          preselectedProductId={editId}
          onClose={() => setAdjustModalOpen(false)}
          onSuccess={() => {
            setAdjustModalOpen(false);
            fetchInventory();
          }}
        />
      )}

      {parentStockModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-primary">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-on-surface">Stock previo en el producto padre</h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              El producto <strong className="text-on-surface">&ldquo;{parentStockModal.parentProduct.name}&rdquo;</strong> tiene actualmente{" "}
              <strong className="text-on-surface font-semibold tabular-nums">{parentStockModal.parentProduct.stock_level}</strong> unidades en stock.
              <br className="mb-2" />
              Al crear su primera variante, este producto pasa a ser un agrupador sin stock propio. ¿Qué deseas hacer con ese stock?
            </p>
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={async () => {
                  setSaving(true);
                  const isService = itemType === "Servicio";
                  const parentId = parentStockModal.parentProduct.id;
                  const parentStock = parentStockModal.parentProduct.stock_level;
                  await resetParentStock(parentId);
                  const updatedPayload = {
                    ...parentStockModal.pendingPayload,
                    stock_level: String(
                      (parseInt(parentStockModal.pendingPayload.stock_level || "0") || 0) + parentStock
                    ),
                  };
                  const ok = await addProduct(updatedPayload, isService ? null : imageFile);
                  setSaving(false);
                  setParentStockModal(null);
                  if (ok) router.push(backTo);
                }}
                className="w-full py-3 px-4 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary-dim shadow-md transition-colors text-left flex items-center justify-between"
              >
                <span>Transferir las {parentStockModal.parentProduct.stock_level} unidades a esta variante</span>
                <span>→</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  setSaving(true);
                  const isService = itemType === "Servicio";
                  const parentId = parentStockModal.parentProduct.id;
                  await resetParentStock(parentId);
                  const ok = await addProduct(parentStockModal.pendingPayload, isService ? null : imageFile);
                  setSaving(false);
                  setParentStockModal(null);
                  if (ok) router.push(backTo);
                }}
                className="w-full py-3 px-4 rounded-xl bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-surface-container-highest transition-colors text-left flex items-center justify-between border border-outline-variant/20"
              >
                <span>Anular / descartar el stock del padre (dejarlo en 0)</span>
                <span>✕</span>
              </button>
              <button
                type="button"
                onClick={() => setParentStockModal(null)}
                className="w-full py-2 text-center text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors mt-1"
              >
                Cancelar y seguir editando
              </button>
            </div>
          </div>
        </div>
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
