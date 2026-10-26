"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInventoryStore } from "@/stores/inventory.store";
import { useMovementsStore } from "@/stores/inventory-movements.store";
import { useServicesStore } from "@/stores/services.store";
import type { NewProductInput } from "@/services/inventory.service";
import { calculateMargin, handlePresentationModeChange, parseProductSalePrice, showOnSiteOf } from "@/services/inventory.service";
import type { NewServiceInput } from "@/services/services.service";
import { DistributorQuickModal } from "@/components/DistributorQuickModal";
import { CategoryQuickModal } from "@/components/CategoryQuickModal";
import { BarcodeField } from "@/components/BarcodeField";
import { Select } from "@/components/ui/Select";
import { usePricePair } from "@/lib/usePricePair";
import { stockUnitsOf } from "@/lib/stock";
import { useProfile } from "@/components/ProfileProvider";
import { can } from "@/lib/permissions";
import { useBusinessTax } from "@/lib/useBusinessTax";
import { createCatalogSave, recipeKindToRemove } from "@/lib/product-form-save";
import { createSubmitGuard } from "@/lib/submit-guard";
import { priceMultipliers, productPriceMultipliers, effectiveProductTaxRate } from "@/lib/product-tax";
import { useBarcodeLookup } from "@/lib/useBarcodeLookup";
import { barcodeAutofill, suggestedName, type AutofillMemory } from "@/lib/autofill";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/duration";
import type { OpenFactsProduct } from "@/services/openfacts.service";
import { ProductImageUpload } from "./components/ProductImageUpload";
import { uploadProductImage } from "@/services/inventory.service";
import { toMessage } from "@/lib/errors";
import { ProductPricingSection } from "./components/ProductPricingSection";
import { ProductPresentationSection } from "./components/ProductPresentationSection";
import { useFormatMoney } from "@/lib/useMoney";
import { isSafeNext } from "@/lib/safe-next";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { Switch } from "@/components/ui/Switch";
import { effectiveModules } from "@/config/business";
import { useRecipesStore } from "@/stores/recipes.store";
import { RecipeSection, buildIngredientsMap, newEditorLine, type RecipeDraft } from "./components/RecipeSection";
import { editorLineIssues, editorToLines, parseQty, unitLabel } from "@/lib/recipe-editor";
import { productionUnitCost, recipeCost } from "@/lib/recipes";
import type { RecipeCostInfo } from "./components/ProductPricingSection";
import { MEASURE_UNITS, PRODUCT_UNITS, compatibleUnits, isMeasureUnit } from "@/lib/units";
import type { Recipe } from "@/services/recipes.service";

/** Receta en blanco: apagada, de venta. */
const EMPTY_RECIPE: RecipeDraft = { enabled: false, kind: "sale", lines: [], yieldQty: "", yieldUnit: "" };

/** Lo que muestra el editor a partir de una receta guardada. */
function draftFromRecipe(recipe: Recipe | null): RecipeDraft {
  if (!recipe || recipe.items.length === 0) return EMPTY_RECIPE;
  return {
    enabled: true,
    kind: recipe.kind,
    lines: recipe.items.map((i) =>
      newEditorLine({ ingredientId: i.ingredient_id, qty: String(i.quantity).replace(".", ","), unit: i.unit }),
    ),
    yieldQty: recipe.yield_qty !== null ? String(recipe.yield_qty).replace(".", ",") : "",
    yieldUnit: recipe.yield_unit ?? "",
  };
}

interface FieldErrors {
  name?: string;
  price?: string;
  commission?: string;
  /** "Cada unidad trae": cantidad escrita pero ilegible. */
  content?: string;
}

/** Contenido por defecto del formulario: sin cantidad, en ml (lo más común: bolsas y botellas). */
const EMPTY_CONTENT = { content_qty: "", content_unit: "ml" } as const;

/** "unidad" / "caja" / "par": la unidad del producto como palabra, para "Cada caja trae". */
function unitNoun(unit: string): string {
  return unit === "Unidad" ? "unidad" : unitLabel(unit, 1);
}

/**
 * Valida el valor de la comisión. Antes el `noValidate` del formulario dejaba
 * pasar un 150 % y se guardaba: el empleado se llevaba más de lo que se cobró.
 */
function commissionError(hasCommission: boolean, type: string, raw: string): string | undefined {
  if (!hasCommission) return undefined;
  const value = raw.trim() === "" ? NaN : Number(raw);
  if (raw.trim() === "") return "Indica el valor de la comisión o desactívala.";
  if (!Number.isFinite(value) || value < 0) return "La comisión no puede ser negativa.";
  if (type !== "fixed" && value > 100) return "Un porcentaje de comisión no puede pasar de 100 %.";
  return undefined;
}

/**
 * Un único formulario para las dos mitades del catálogo.
 *
 * Qué se está editando lo dice el parámetro de la URL, no una adivinanza sobre
 * el uuid: `?id=` es un producto (tabla `products`), `?serviceId=` es un
 * servicio (tabla `services`). Sin `?type=servicio` el alta arranca en
 * Producto, que es el caso mayoritario.
 *
 * Lo que este formulario ya NO hace: escribir el servicio en las dos tablas.
 * Ese gemelo se emparejaba por nombre, se sincronizaba con `catch {}` vacíos y
 * en producción no había un solo par completo.
 */
function ProductForm() {
  const fmtMoney = useFormatMoney();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const editServiceId = searchParams.get("serviceId");

  /**
   * Vista desde la que se abrió el formulario: al volver (o al guardar) se
   * regresa ahí, no siempre a inventario. Se acotan las rutas internas del
   * dashboard para que un `from` manipulado no redirija fuera de la app.
   */
  const from = searchParams.get("from");
  /**
   * `back` lo arma el catálogo con su URL completa (búsqueda, filtros, página):
   * volver ahí deja la lista donde estaba (D8). Se valida con `isSafeNext` y
   * además tiene que quedar dentro del panel.
   */
  const back = searchParams.get("back");
  const backTo =
    back && isSafeNext(back) && back.startsWith("/dashboard/")
      ? back
      : from && /^\/dashboard\/[a-z0-9/-]*$/i.test(from) ? from : "/dashboard/inventory";

  const profile = useProfile();
  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const distributors = useInventoryStore((s) => s.distributors);
  const error = useInventoryStore((s) => s.error);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addProduct = useInventoryStore((s) => s.addProduct);
  const updateProduct = useInventoryStore((s) => s.updateProduct);
  const addMovement = useMovementsStore((s) => s.addMovement);
  const movementError = useMovementsStore((s) => s.error);
  const services = useServicesStore((s) => s.services);
  const serviceError = useServicesStore((s) => s.error);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const addService = useServicesStore((s) => s.addService);
  const updateService = useServicesStore((s) => s.updateService);

  /**
   * Recetas (módulo opt-in "Recetas y producción"). Con el módulo apagado nada
   * de esto se muestra ni se guarda: el formulario queda como siempre.
   */
  const productionOn =
    effectiveModules(profile?.businessType ?? null, profile?.modules ?? null).production === true;
  /** ICUI: impuesto saludable, solo para el rubro tienda (alimentos). */
  const isTienda = profile?.businessType === "tienda";
  const recipes = useRecipesStore((s) => s.recipes);
  const recipesLoaded = useRecipesStore((s) => s.loaded);
  const recipesLoadError = useRecipesStore((s) => s.error);
  const fetchRecipes = useRecipesStore((s) => s.fetchRecipes);
  const saveRecipe = useRecipesStore((s) => s.saveRecipe);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(EMPTY_RECIPE);
  const [recipeSeededFor, setRecipeSeededFor] = useState<string | null>(null);
  const [attemptedRecipeKind, setAttemptedRecipeKind] = useState<"sale" | "production" | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const { confirm: confirmRecipe, dialog: recipeDialog } = useConfirm();

  const [form, setForm] = useState<NewProductInput>({
    name: "",
    category_id: "",
    distributor_id: "",
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
    tracks_stock: true,
    open_price: false,
    is_ingredient: false,
    icui_applies: false,
    // null = usa la tasa de IVA del negocio.
    tax_rate: null,
    show_on_site: true,
    // Van desde el arranque (y no `undefined`) para que el snapshot de
    // "cambios sin guardar" sea estable: una clave que aparece después cuenta
    // como cambio.
    ...EMPTY_CONTENT,
  });
  const handleDistributorCreated = () => {
    fetchInventory();
  };
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);
  const submitGuard = useRef(createSubmitGuard());
  const productSave = useRef(createCatalogSave<NewProductInput>());
  const serviceSave = useRef(createCatalogSave<NewServiceInput>());
  /** Estado del formulario al terminar de cargar: base para saber si hay cambios. */
  const [baseline, setBaseline] = useState<string | null>(null);
  const { confirm: confirmLeave, dialog: leaveDialog } = useConfirm();
  // Fallo de la subida de la foto. Va junto a la foto, no al pie: es lo que hay
  // que cambiar (otra imagen, o ninguna) para poder guardar.
  const [imageError, setImageError] = useState<string | null>(null);
  /** Errores por campo, en reemplazo del globo de validación del navegador. */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const commissionRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLInputElement>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  const [distributorModalOpen, setDistributorModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [itemType, setItemType] = useState<"Producto" | "Servicio">(
    editServiceId || searchParams.get("type")?.toLowerCase() === "servicio"
      ? "Servicio"
      : "Producto",
  );
  const [serviceFinalPrice, setServiceFinalPrice] = useState("");
  const [serviceDuration, setServiceDuration] = useState("30");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceStatus, setServiceStatus] = useState<"active" | "inactive">("active");
  /**
   * Cómo se maneja el producto. Arranca en "unidad" porque es lo que aplica a
   * la mayoría; la caja es una decisión que se toma, no un default que se sufre.
   * En edición se siembra según lo que ya tenga guardado.
   */
  const [presentation, setPresentation] = useState<"unit" | "package">("unit");
  /** Stock del alta: cajas y unidades sueltas, que se suman. */
  const [initialPackages, setInitialPackages] = useState("");
  const [initialLoose, setInitialLoose] = useState("");
  /**
   * Entrada de stock desde la ficha, en edición.
   *
   * No es un campo del producto: se manda como movimiento `in` al RPC, que es
   * lo que deja rastro en el libro. Escribir `stock_level` desde el formulario
   * sería pisar el conteo con el número que la pantalla leyó al abrirse.
   */
  const [entryPackages, setEntryPackages] = useState("");
  const [entryLoose, setEntryLoose] = useState("");
  /**
   * Solo para SERVICIOS: el desglose de su precio. Los productos ya no tienen
   * selector propio en la calculadora: usan la tasa del campo "IVA"
   * (`form.tax_rate`), que es la que se guarda y la que cobra `create_sale`.
   */
  const [sellingPriceTax, setSellingPriceTax] = useState("IVA");

  // La tasa sale de los ajustes del negocio, no de un 19% escrito a mano.
  //
  // COMPRA y VENTA usan tasas distintas a propósito: un negocio no responsable
  // de IVA igual se lo paga al proveedor (`rawRate`), pero no lo cobra en sus
  // propios precios (`rate`, que en ese caso vale 0).
  const { rate: taxRate, rawRate, includeTax, percentLabel } = useBusinessTax();
  // Sin IVA en el negocio no hay IVA en la ficha: lo que se escribe es el precio.
  // Producto: la calculadora usa la tasa EFECTIVA del campo "IVA" persistido
  // (la suya, o la del negocio si es null; exento = sin IVA).
  const productTaxRate = effectiveProductTaxRate(form.tax_rate, rawRate);
  const { purchase: purchaseMultiplier, selling: sellingMultiplier } = productPriceMultipliers({
    includeTax,
    businessRate: rawRate,
    productRate: form.tax_rate,
  });
  const { selling: serviceMultiplier } = priceMultipliers({
    includeTax,
    rate: taxRate,
    rawRate,
    purchaseTax: "IVA",
    sellingTax: sellingPriceTax,
  });
  const serviceFinalValue = parseFloat(serviceFinalPrice || "0");
  const serviceBaseValue = serviceFinalValue > 0 ? serviceFinalValue / serviceMultiplier : 0;
  const serviceTaxValue = Math.max(serviceFinalValue - serviceBaseValue, 0);

  /**
   * Base y total son los DOS editables, y cada uno recalcula el otro. Por eso
   * se guardan ambos strings en vez de derivar uno del otro: si el total se
   * recalculara desde la base en cada tecla, escribir "50000" en el total lo
   * reescribiría a mitad de camino y no se podría teclear.
   */
  // La tasa del producto va en la clave: cambiar su IVA conserva el TOTAL (el
  // precio de vitrina que se guarda) y rehace la base, en vez de subir el precio.
  const [purchase, setPurchase] = usePricePair(purchaseMultiplier, `${includeTax}:${rawRate}:${productTaxRate}`);
  const [selling, setSelling] = usePricePair(sellingMultiplier, `${includeTax}:${rawRate}:${productTaxRate}`);
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
    // Sin caja no hay cajas que cargar: lo que se hubiera escrito ahí no puede
    // quedar sumando en silencio al volver a la presentación suelta.
    if (newMode === "unit") {
      setInitialPackages("");
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchServices();
  }, [fetchInventory, fetchServices]);

  useEffect(() => {
    if (productionOn) void fetchRecipes();
  }, [productionOn, fetchRecipes]);

  /**
   * Stock inicial en unidades sueltas: cajas enteras MÁS unidades sueltas.
   *
   * La caja incompleta es la regla, no la excepción: llega una caja de 24 con
   * 23, o queda un resto del mes pasado. Sin el campo suelto la única salida era
   * cargar la caja entera y arrancar el inventario con una unidad que no existe.
   */
  // Con receta de VENTA el producto no lleva stock propio: se descuenta de sus
  // insumos (la base lo exige: `products_guard_recipe`). Por lotes, el
  // preparado SÍ lleva stock: es lo que suma cada lote.
  const saleRecipeActive =
    productionOn && itemType === "Producto" && recipeDraft.enabled && recipeDraft.kind === "sale" && !form.is_ingredient;
  const productionRecipeActive =
    productionOn && itemType === "Producto" && recipeDraft.enabled && (recipeDraft.kind === "production" || form.is_ingredient === true);
  const noStock = saleRecipeActive || (!productionRecipeActive && form.tracks_stock === false);
  /** "Solo insumo": no se vende. La ficha esconde precio de venta, margen, precio abierto y comisión. */
  const ingredientMode = productionOn && itemType === "Producto" && form.is_ingredient === true;
  const canSeeCosts = can(profile, "inventory_costs");
  /**
   * El producto como destino de conversión (unidad + "cada unidad trae"): lo
   * usa el editor de receta para ofrecer unidades de rendimiento y la ficha
   * para mandar un rendimiento que la base pueda convertir.
   */
  const productHolder = {
    unit: form.unit,
    content_qty: parseQty(form.content_qty ?? "") ?? null,
    content_unit: form.content_unit || null,
  };
  const ingredientsMap = useMemo(() => buildIngredientsMap(products), [products]);
  /**
   * "Cada unidad trae" solo hace ruido en un producto que nunca va a una
   * receta (una cera, una gaseosa). Se muestra abierto cuando sirve —insumo,
   * ya tiene contenido, o ya se usa en alguna receta— y, si no, queda un
   * enlace para abrirlo.
   */
  const [contentOpened, setContentOpened] = useState(false);
  const usedInRecipes = !!editId && recipes.some((r) => r.items.some((i) => i.ingredient_id === editId));
  const contentApplies = productionOn && itemType === "Producto" && !isMeasureUnit(form.unit);
  const showContent =
    contentApplies && (ingredientMode || contentOpened || usedInRecipes || (form.content_qty ?? "").trim() !== "");
  /**
   * Con receta de venta el producto no se compra: su costo es el de sus
   * insumos, por unidad vendida. Se calcula acá (con el mismo mapa que usa el
   * editor) para que la tarjeta de precio no muestre un "Precio de compra" en
   * 0. Solo si quien edita puede ver costos; si no, la tarjeta no se muestra.
   */
  const recipeCostInfo = ((): RecipeCostInfo | null => {
    if (!canSeeCosts || (!saleRecipeActive && !productionRecipeActive)) return null;
    const lines = editorToLines(recipeDraft.lines);
    const basis = saleRecipeActive ? "sale" : "production";
    if (lines.length === 0) {
      return { total: 0, incomplete: false, basis, pending: "Agrega los insumos de la receta para ver cuánto te cuesta." };
    }
    const c = recipeCost(lines, ingredientsMap);
    if (basis === "sale") return { total: c.total, incomplete: c.incomplete, basis };
    // Por lotes: costo del lote ÷ lo que rinde, en la unidad del producto.
    const yieldQty = parseQty(recipeDraft.yieldQty);
    const perUnit = yieldQty
      ? productionUnitCost(c.total, yieldQty, recipeDraft.yieldUnit || form.unit, productHolder)
      : null;
    if (perUnit === null) {
      return { total: 0, incomplete: false, basis, pending: "Indica cuánto rinde un lote para ver el costo por unidad." };
    }
    return { total: perUnit, incomplete: c.incomplete, basis };
  })();
  const initialStock = noStock ? 0 : stockUnitsOf(
    presentation === "package" ? initialPackages : "",
    initialLoose,
    form.units_per_package ?? "1",
  );

  const packageHint = (() => {
    const boxPrice = parseFloat(form.package_price ?? "");
    const units = parseInt(form.units_per_package || "1");
    const unitPrice = parseFloat(sellingPriceTotal || "0");
    if (!Number.isFinite(boxPrice) || boxPrice <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return "";
    }
    if (units <= 1) return "Define primero cuántas unidades trae la caja.";
    const perUnit = boxPrice / units;
    const label = `Sale a ${fmtMoney(perUnit)} por unidad`;
    return perUnit > unitPrice
      ? `${label}: MÁS CARA que vender suelto (${fmtMoney(unitPrice)}).`
      : `${label}, contra ${fmtMoney(unitPrice)} suelto.`;
  })();

  const editingProduct = editId ? products.find((p) => p.id === editId) : undefined;
  const editingService = editServiceId ? services.find((s) => s.id === editServiceId) : undefined;

  // Mover stock tiene su propio permiso: un empleado que puede corregir un
  // precio no necesariamente puede cargar mercadería. El RPC lo revalida, pero
  // mostrar un campo que va a rebotar no es avisar, es hacer perder el tiempo.
  const canMoveStock = can(profile, "inventory_stock");
  const currentStock = (editingProduct ?? products.find((product) => product.id === createdProductId))?.stock_level ?? 0;
  const entryUnits = noStock ? 0 : stockUnitsOf(
    presentation === "package" ? entryPackages : "",
    entryLoose,
    form.units_per_package ?? "1",
  );

  // Siembra del formulario en edición. Se hace DURANTE el render (patrón oficial
  // de React para ajustar estado cuando cambia una entrada) y no en un efecto:
  // copiar el producto al estado desde un efecto dispara renders en cascada.
  // `seededId` garantiza que solo corra una vez por ítem, así lo que el
  // usuario escribe no se pisa cuando el store se refresca.
  if (editingService && seededId !== editingService.id) {
    setSeededId(editingService.id);
    setItemType("Servicio");
    setForm((prev) => ({
      ...prev,
      name: editingService.name,
      category_id: editingService.category_id ?? "",
      price: String(editingService.price),
      has_commission: editingService.has_commission ?? false,
      commission_type: editingService.commission_type ?? "percentage",
      commission_value: editingService.commission_value ? String(editingService.commission_value) : "",
      image_url: editingService.image_url ?? "",
      show_on_site: showOnSiteOf(editingService),
    }));
    setServiceFinalPrice(String(editingService.price));
    setServiceDuration(String(editingService.duration_minutes));
    setServiceDescription(editingService.description ?? "");
    setServiceStatus(editingService.status === "inactive" ? "inactive" : "active");
    if (editingService.image_url) setImagePreview(editingService.image_url);
  }

  if (editingProduct && seededId !== editingProduct.id) {
    setSeededId(editingProduct.id);
    setForm({
      name: editingProduct.name,
      category_id: editingProduct.category_id ?? "",
      distributor_id: editingProduct.distributor_id ?? "",
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
      tracks_stock: editingProduct.tracks_stock !== false,
      open_price: editingProduct.open_price === true,
      is_ingredient: editingProduct.is_ingredient === true,
      icui_applies: editingProduct.icui_applies === true,
      tax_rate: editingProduct.tax_rate ?? null,
      show_on_site: showOnSiteOf(editingProduct),
      // Presentación ("cada unidad trae 900 ml"), con coma decimal como el
      // resto de cantidades de la receta.
      content_qty:
        editingProduct.content_qty != null && editingProduct.content_qty > 0
          ? String(editingProduct.content_qty).replace(".", ",")
          : EMPTY_CONTENT.content_qty,
      content_unit: editingProduct.content_unit || EMPTY_CONTENT.content_unit,
    });
    setPresentation((editingProduct.units_per_package ?? 1) > 1 ? "package" : "unit");
    setPurchase.fromTotal(String(editingProduct.purchase_price ?? "0"));
    setSelling.fromTotal(String(editingProduct.price ?? "0"));
    if (editingProduct.image_url) setImagePreview(editingProduct.image_url);
  }

  // El id no existe en el catálogo del negocio: navegar es un efecto, no estado.
  useEffect(() => {
    if (editId && products.length > 0 && !editingProduct) {
      router.push("/dashboard/inventory");
    }
  }, [editId, products.length, editingProduct, router]);

  useEffect(() => {
    if (editServiceId && services.length > 0 && !editingService) {
      router.push("/dashboard/inventory");
    }
  }, [editServiceId, services.length, editingService, router]);

  const editingId = editId ?? editServiceId;
  const loadingProduct = !!editingId && seededId !== editingId;

  /** La receta guardada del ítem que se edita (si el módulo está encendido). */
  const existingRecipe: Recipe | null = !productionOn
    ? null
    : editId
      ? recipes.find((r) => r.product_id === editId) ?? null
      : editServiceId
        ? recipes.find((r) => r.service_id === editServiceId) ?? null
        : null;
  // La receta se siembra una vez, cuando ya llegaron las recetas (mismo patrón
  // que la siembra del producto: durante el render, no en un efecto).
  const recipeKey = editingId ?? "new";
  const recipesReady = recipesLoaded || recipesLoadError !== null;
  if (productionOn && (recipesReady || !editingId) && !loadingProduct && recipeSeededFor !== recipeKey) {
    setRecipeSeededFor(recipeKey);
    // `?receta=lotes|venta` (desde Producción) abre un alta con la receta ya
    // encendida: un paso menos para quien viene a crear un preparado o un
    // producto con receta, sin cambiar nada al editar. La línea lleva clave
    // fija: esto corre también en el servidor, y una clave con Date.now() no
    // coincidiría al hidratar.
    const preset = !editingId ? searchParams.get("receta") : null;
    setRecipeDraft(
      preset === "lotes" || preset === "venta"
        ? { ...EMPTY_RECIPE, enabled: true, kind: preset === "lotes" ? "production" : "sale", lines: [newEditorLine({ key: "preset" })] }
        : draftFromRecipe(existingRecipe),
    );
  }
  const loadingRecipe = productionOn && !!editingId && recipeSeededFor !== recipeKey;
  /** Si las recetas no cargaron, NO se toca la receta al guardar: podría borrarse una que existe. */
  const recipeUnknown = productionOn && !!editingId && !recipesLoaded;
  const saleRecipeProductIds = new Set(
    recipes.filter((r) => r.kind === "sale" && r.product_id).map((r) => r.product_id as string),
  );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
    setImageError(null);
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
      setImageError(null);
    }
  };

  const resetImage = () => {
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    setImageFile(null);
    setImageError(null);
    setForm((prev) => ({ ...prev, image_url: "" }));
  };

  /**
   * Guarda la receta DESPUÉS del producto o servicio (necesita su id). Si el
   * producto tiene stock y pasa a receta de venta, la base pide confirmación
   * (RECETA_CON_STOCK): se pregunta y se reintenta. `false` = no seguir (la
   * pantalla se queda para que se vea el error o se decida de nuevo).
   */
  const persistRecipe = async (
    target: { productId?: string; serviceId?: string },
    lines: ReturnType<typeof editorToLines>,
  ): Promise<boolean> => {
    if (!productionOn || recipeUnknown) return true;
    const isService = !!target.serviceId;
    const wantRecipe = recipeDraft.enabled && lines.length > 0;
    if (!wantRecipe) {
      // Apagar la receta de un servicio (la de un producto ya se borró antes).
      if (isService && recipeKindToRemove(existingRecipe?.kind ?? null, attemptedRecipeKind, null)) {
        const removed = await saveRecipe({ ...target, kind: "sale", items: [] });
        if (!removed.ok) setRecipeError(removed.error);
        else setAttemptedRecipeKind(null);
        return removed.ok;
      }
      return true;
    }
    const kind = isService ? "sale" : form.is_ingredient ? "production" : recipeDraft.kind;
    const input = {
      ...target,
      kind,
      items: lines,
      yieldQty: kind === "production" ? parseQty(recipeDraft.yieldQty) : null,
      // La misma regla que muestra el editor: una unidad de rendimiento que ya
      // no se convierte (cambió la unidad o el contenido del producto) cae a
      // la del producto, en vez de rebotar en la base.
      yieldUnit:
        kind === "production"
          ? compatibleUnits(productHolder).includes(recipeDraft.yieldUnit) ? recipeDraft.yieldUnit : form.unit
          : null,
    };
    setAttemptedRecipeKind(kind);
    let result = await saveRecipe(input);
    if (!result.ok && result.needsStockClear) {
      const go = await confirmRecipe({
        title: "¿Pasar este producto a receta?",
        description: `${result.error} Desde ahora cada venta descuenta los insumos de la receta y el stock del producto queda en 0 (queda registrado en el kardex).`,
        confirmLabel: "Sí, usar la receta",
        cancelLabel: "Revisar",
      });
      if (!go) {
        setRecipeError("La receta no se guardó: el producto sigue con su stock propio.");
        return false;
      }
      result = await saveRecipe({ ...input, clearStock: true });
    }
    if (!result.ok) {
      setRecipeError(result.error);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isService = itemType === "Servicio";

    // Validación propia en vez de la del navegador.
    //
    // El globo nativo ("Completa este campo") se ancla debajo del campo y acá
    // caía justo encima de la etiqueta "Proveedor", tapándola. Además se
    // muestra en el idioma del navegador, no en el de la app, y desaparece solo
    // a los pocos segundos. Un mensaje bajo el campo se queda hasta que se
    // corrige y lo lee un lector de pantalla.
    const errores: FieldErrors = {};
    if (!form.name.trim()) {
      errores.name = `Escribe el nombre del ${isService ? "servicio" : "producto"}.`;
    }
    if (isService && !(parseFloat(serviceFinalPrice) > 0)) {
      errores.price = "Indica el precio del servicio.";
    }
    if (!isService) {
      try {
        parseProductSalePrice(sellingPriceTotal, form.open_price, form.is_ingredient === true);
      } catch (error) {
        errores.price = error instanceof Error ? error.message : "Indica un precio de venta válido.";
      }
    }
    // Un insumo no se vende, así que no comisiona: el bloque está escondido y
    // no puede frenar el guardado un campo que no se ve.
    const commission = ingredientMode
      ? undefined
      : commissionError(form.has_commission, form.commission_type, form.commission_value);
    if (commission) errores.commission = commission;
    // "Cada unidad trae": vacío vale (sin presentación; `contentPatch` guarda
    // null), pero si se escribió algo tiene que ser una cantidad legible.
    if (
      !isService &&
      productionOn &&
      !isMeasureUnit(form.unit) &&
      (form.content_qty ?? "").trim() !== "" &&
      parseQty(form.content_qty ?? "") === null
    ) {
      errores.content = "Escribe cuánto trae cada unidad (un número mayor que 0), o deja el campo vacío.";
    }

    // La receta se valida ANTES de guardar nada: guardar el producto y que la
    // receta rebote dejaría la mitad del cambio hecho.
    const recipeLines = editorToLines(recipeDraft.lines);
    if (productionOn && recipeDraft.enabled && !recipeUnknown && Object.keys(errores).length === 0) {
      const issues = editorLineIssues(recipeDraft.lines);
      const realIssues = issues.filter((issue, i) => {
        const l = recipeDraft.lines[i];
        // Una línea totalmente vacía no es un error: se ignora.
        return issue !== null && !(issue === "missing-ingredient" && !l.qty.trim());
      });
      let message: string | null = null;
      if (realIssues.length > 0) {
        message = realIssues.includes("duplicate")
          ? "Un insumo está dos veces en la receta: deja una sola línea con la cantidad total."
          : "Completa la cantidad de cada insumo de la receta, o quita la línea.";
      } else if (recipeLines.length === 0) {
        message = "Agrega al menos un insumo a la receta, o apágala.";
      } else if (
        !isService &&
        (recipeDraft.kind === "production" || form.is_ingredient) &&
        parseQty(recipeDraft.yieldQty) === null
      ) {
        message = "Indica cuánto rinde cada lote.";
      }
      if (message) {
        setRecipeError(message);
        document.getElementById("recipe-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    setRecipeError(null);
    if (Object.keys(errores).length > 0) {
      setFieldErrors(errores);
      // Al primer campo con problema, que puede estar fuera de la pantalla.
      // En el orden en que aparecen en la pantalla.
      (errores.name ? nameRef : errores.content ? contentRef : errores.price ? priceRef : commissionRef).current?.focus();
      return;
    }

    setFieldErrors({});
    setImageError(null);
    if (!submitGuard.current.acquire()) return;
    setSaving(true);
    try {
      // Un servicio va a `services` y NADA MÁS. Antes esta misma función escribía
      // también una fila en `products` con unidad "Servicio" para que apareciera
      // en el inventario; hoy el catálogo lee las dos tablas y las muestra juntas,
      // así que la copia dejó de tener para qué existir.
      if (isService) {
        // Duración: si no es un entero positivo, cae al default de 30.
        const durationRaw = serviceDuration.trim();
        const durationMinutes =
          /^\d+$/.test(durationRaw) && parseInt(durationRaw, 10) > 0 ? durationRaw : "30";

        /*
         * La foto se sube ANTES de guardar el servicio, y al mismo bucket que los
         * productos: las dos son imágenes de catálogo. Si falla la subida se corta
         * acá y el servicio no se guarda a medias — con la foto vieja puesta y el
         * dueño creyendo que la cambió.
         *
         * Sin archivo nuevo vale lo que ya estaba en el formulario, que es "" si
         * el dueño quitó la foto.
         */
        let imagenServicio: string | null = form.image_url || null;
        if (imageFile) {
          try {
            imagenServicio = await uploadProductImage(imageFile);
          } catch (e) {
            // Sin esto la excepción se escapaba de `handleSubmit`: el botón se
            // quedaba en "Guardando…" para siempre y nadie decía por qué.
            setImageError(
              `No se pudo subir la foto (${toMessage(e).replace(/\.$/, "")}). Prueba de nuevo, elige otra imagen o quítala para guardar sin foto.`,
            );
            return;
          }
        }

        const serviceInput: NewServiceInput = {
          // Tal como lo escribieron (D20).
          name: form.name.trim(),
          description: serviceDescription,
          price: serviceFinalPrice,
          duration_minutes: durationMinutes,
          status: serviceStatus,
          has_commission: form.has_commission,
          commission_type: form.commission_type,
          commission_value: form.commission_value || "",
          category_id: form.category_id,
          image_url: imagenServicio,
          show_on_site: form.show_on_site !== false,
        };

        const savedService = await serviceSave.current.run(editServiceId, serviceInput, addService, updateService);
        if (!savedService) return;
        if (!editServiceId) setCreatedServiceId(savedService);
        const serviceId = editServiceId ?? (typeof savedService === "string" ? savedService : null);
        if (serviceId && !(await persistRecipe({ serviceId }, recipeLines))) return;
        router.push(backTo);
        return;
      }

      // Pasar de receta de venta a otra cosa (sin receta, por lotes o "Solo
      // insumo") exige borrar la receta ANTES de tocar el stock propio: con la
      // receta de venta viva, la base no deja volver a encender el inventario.
      const productTargetId = editId ?? productSave.current.createdId;
      const nextRecipeKind = !recipeDraft.enabled
        ? null
        : form.is_ingredient ? "production" : recipeDraft.kind;
      const removeKind = recipeKindToRemove(existingRecipe?.kind ?? null, attemptedRecipeKind, nextRecipeKind);
      if (productTargetId && productionOn && !recipeUnknown && removeKind) {
        const removed = await saveRecipe({ productId: productTargetId, kind: removeKind, items: [] });
        if (!removed.ok) {
          setRecipeError(removed.error);
          return;
        }
        setAttemptedRecipeKind(null);
      }

      const payload = {
        ...form,
        // Receta de venta: sin stock propio. Por lotes: el preparado SÍ lleva
        // stock. Un producto existente que recién pasa a receta de venta
        // conserva su valor: `save_recipe` lo apaga y, si tiene stock, se
        // pregunta antes.
        tracks_stock: saleRecipeActive && (!editId || existingRecipe?.kind === "sale")
          ? false
          : productionRecipeActive
            ? true
            : form.tracks_stock,
        is_ingredient: productionOn ? form.is_ingredient === true : undefined,
        // Lo que un insumo no tiene (no se vende) no se guarda aunque haya
        // quedado encendido de antes de marcarlo "Solo insumo".
        has_commission: ingredientMode ? false : form.has_commission,
        open_price: ingredientMode ? false : form.open_price,
        name: form.name.trim(),
        purchase_price: purchasePriceTotal,
        price: sellingPriceTotal,
        // El stock solo se define en el alta: `updateProduct` ya no escribe la
        // columna, y en edición la entrada va por el RPC de movimientos.
        stock_level: String(initialStock),
        units_per_package: presentation === "package" ? (form.units_per_package || "1") : "1",
        package_price: presentation === "package" && !ingredientMode ? form.package_price : "",
      };

      const ok = await productSave.current.run(
        editId, payload,
        (input) => addProduct(input, imageFile),
        (id, input) => updateProduct(id, input, imageFile),
      );
      const saved = typeof ok === "string";
      if (saved && !editId) {
        setCreatedProductId(ok);
        const created = useInventoryStore.getState().products.find((product) => product.id === ok);
        if (created) setForm((current) => ({ ...current, sku: current.sku || created.sku }));
      }
      const productId = typeof ok === "string" ? ok : null;
      if (saved && productId && !(await persistRecipe({ productId }, recipeLines))) return;

      // La entrada de stock va DESPUÉS de guardar el producto y por su propio RPC.
      //
      // Ese orden importa: si el movimiento fuera primero y el guardado fallara,
      // la mercadería ya habría entrado y el comerciante reintentaría el guardado
      // sumándola de nuevo. Al revés, lo peor que pasa es que el producto quede
      // guardado y la entrada no: se ve el error y se vuelve a intentar solo eso.
      if (saved && productId && (editId || createdProductId) && entryUnits > 0) {
        // Cajas y sueltas viajan sumadas, en unidades: partirlo en dos llamadas
        // dejaría dos filas en el libro para un mismo ingreso, y la segunda podría
        // fallar con la primera ya aplicada.
        const moved = await addMovement({
          product_id: productId,
          type: "in",
          quantity: entryUnits,
          unit_mode: "unit",
          notes: "Entrada desde la ficha del producto",
        });
        if (!moved) return;
        setEntryPackages("");
        setEntryLoose("");
        router.push(backTo);
        return;
      }

      if (saved) router.push(backTo);
    } finally {
      // Un solo lugar, para TODAS las salidas: cada `return` temprano y
      // cualquier excepción que no atrape un store. Repartirlo por rama es lo
      // que dejó el botón trabado en "Guardando…".
      submitGuard.current.release();
      setSaving(false);
    }
  };

  /**
   * Lo último que autocompletamos, para saber qué es NUESTRO y se puede pisar.
   * Sin esta memoria, un campo lleno por un escaneo previo es indistinguible de
   * uno tipeado, y escanear un segundo código no cambiaba nada.
   */
  const autoFilledRef = useRef<AutofillMemory>({});

  const handleBarcodeFound = useCallback(
    (product: OpenFactsProduct) => {
      // Foto FIJA de la memoria: el updater de abajo puede correr dos veces
      // (modo estricto) y tiene que dar lo mismo las dos. Ver `barcodeAutofill`.
      const memory = { ...autoFilledRef.current };
      const editing = Boolean(editingProduct);

      setForm((prev) => {
        const { patch, auto } = barcodeAutofill(prev, product, memory, { editing });
        autoFilledRef.current = auto;
        const next = { ...prev, ...patch };
        // Una unidad que mide no tiene contenido ("cada unidad trae").
        if (patch.unit && isMeasureUnit(patch.unit)) {
          next.content_qty = EMPTY_CONTENT.content_qty;
          next.content_unit = EMPTY_CONTENT.content_unit;
        }
        return next;
      });

      // La vista previa sigue a la imagen: si la de este producto entró, la que
      // se muestra tiene que ser esa y no la del código anterior.
      const { patch } = barcodeAutofill(form, product, memory, { editing });
      if (patch.image_url) setImagePreview(patch.image_url);
    },
    [editingProduct, form],
  );

  const { searching, product: lookedUp } = useBarcodeLookup(
    form.barcode ?? "",
    handleBarcodeFound,
  );
  /**
   * Cambios sin guardar (D18). El estado al terminar de cargar es la línea
   * base; cualquier diferencia con ella pide confirmación al salir.
   */
  const snapshot = JSON.stringify({
    form,
    itemType,
    serviceFinalPrice,
    serviceDuration,
    serviceDescription,
    serviceStatus,
    presentation,
    purchasePriceTotal,
    sellingPriceTotal,
    initialPackages,
    initialLoose,
    entryPackages,
    entryLoose,
    image: imageFile?.name ?? null,
    recipe: productionOn
      ? { ...recipeDraft, lines: recipeDraft.lines.map(({ ingredientId, qty, unit }) => ({ ingredientId, qty, unit })) }
      : null,
  });
  if (!loadingProduct && !loadingRecipe && baseline === null) setBaseline(snapshot);
  const dirty = baseline !== null && baseline !== snapshot && !saving;
  useUnsavedChangesGuard(dirty);

  /** Volver/Cancelar con cambios: pregunta antes de descartarlos. */
  const guardLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!dirty) return;
    e.preventDefault();
    void confirmLeave({
      title: "¿Salir sin guardar?",
      description: "Tienes cambios sin guardar en este formulario. Si sales, se pierden.",
      confirmLabel: "Salir sin guardar",
      cancelLabel: "Seguir editando",
      tone: "danger",
    }).then((leave) => {
      if (leave) router.push(backTo);
    });
  };

  // Recargar o cerrar la pestaña con cambios: aviso nativo del navegador (es
  // el único que puede frenar esa salida).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (loadingProduct || loadingRecipe) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-on-surface-variant">Cargando producto…</p>
      </div>
    );
  }

  /**
   * La receta va DENTRO de la tarjeta, pegada al precio (producto) o al bloque
   * del servicio y antes de la presentación: es lo que explica el costo, así
   * que se lee junto a él. Se arma una vez y cada rama la coloca donde le toca.
   */
  const recipeSection = productionOn ? (
    <RecipeSection
      target={itemType === "Servicio" ? "service" : "product"}
      selfId={editId}
      product={productHolder}
      price={itemType === "Servicio" ? serviceFinalValue : parseFloat(sellingPriceTotal || "0") || 0}
      draft={form.is_ingredient && itemType === "Producto" ? { ...recipeDraft, kind: "production" } : recipeDraft}
      onChange={(next) => { setRecipeDraft(next); setRecipeError(null); }}
      products={products}
      saleRecipeProductIds={saleRecipeProductIds}
      canSeeCosts={canSeeCosts}
      ownStockToClear={
        editingProduct && existingRecipe?.kind !== "sale" && editingProduct.tracks_stock !== false
          ? editingProduct.stock_level
          : null
      }
      error={recipeError}
      onlyProduction={itemType === "Producto" && form.is_ingredient === true}
    />
  ) : null;

  return (
    /* El layout del dashboard ya aporta el padding de página: aquí solo el ancho. */
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link
          href={backTo}
          onClick={guardLeave}
          aria-label="Volver"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
            {editingId ? "Editar" : "Nuevo"} {itemType === "Servicio" ? "Servicio" : "Producto"}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {editingId
              ? "Actualiza los datos"
              : "Registra un nuevo producto o servicio en tu catálogo"}
          </p>
        </div>
      </div>

      {/* El tipo se elige al crear, no al editar: un producto no se convierte en
          servicio: son tablas distintas y el cambio sería una mudanza, no una
          edición. */}
      {!editingId && (
        <div className="flex gap-3 mb-6">
          {(["Producto", "Servicio"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={saving || !!createdProductId || !!createdServiceId}
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

      {/* `noValidate`: la validación la hace `handleSubmit` y se muestra bajo
          cada campo. La nativa se dibujaba encima de la etiqueta "Proveedor". */}
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* La foto ya no es solo del producto. Para una barbería el servicio ES
            el producto: "Corte y barba" vende mucho más con una foto que con
            una tijera dibujada. */}
        {(
          <ProductImageUpload
            imagePreview={imagePreview}
            dragOver={dragOver}
            onImageChange={handleImageChange}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onReset={resetImage}
            itemLabel={itemType === "Servicio" ? "servicio" : "producto"}
          />
        )}
        {imageError && (
          <p
            role="alert"
            className="-mt-3 text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20"
          >
            {imageError}
          </p>
        )}

        <div className="bg-surface-container rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm p-4 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-on-surface mb-1">Informaci&oacute;n General</h2>
            <p className="text-sm text-on-surface-variant">Datos b&aacute;sicos del producto o servicio</p>
          </div>

          {/* Name field & Category — 2 Column Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="product-name" className="text-[13px] font-semibold text-on-surface block">
                  Nombre del {itemType === "Servicio" ? "servicio" : "producto"}
                </label>
                <input
                  id="product-name"
                  ref={nameRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors((p) => ({ ...p, name: undefined })); }}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? "product-name-error" : undefined}
                  className={`w-full bg-surface-container-lowest border rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:ring-2 transition-all placeholder:text-on-surface-variant/50 ${
                    fieldErrors.name
                      ? "border-error focus:border-error focus:ring-error/20"
                      : "border-outline-variant/30 focus:border-primary focus:ring-primary/20"
                  }`}
                  placeholder={itemType === "Servicio" ? "Ej. Corte tradicional + barba" : "Ej. Cera mate fijadora"}
                  required
                />
                {fieldErrors.name && (
                  <p id="product-name-error" className="text-xs font-medium text-error">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
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
                  {/* Seleccionable (D21): sin esto, una categoría puesta por error
                      no se podía quitar nunca. */}
                  <option value="">Sin categoría</option>
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

          {/* "Solo insumo": lo que se compra para preparar (café, leche, vasos).
              Lleva stock y costo, pero no se ofrece en el punto de venta. */}
          {productionOn && itemType === "Producto" && (
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-outline-variant/15 bg-surface-container-low/50 p-4">
              <div>
                <p id="ingredient-label" className="text-sm font-semibold text-on-surface">Solo insumo</p>
                <p id="ingredient-help" className="text-xs text-on-surface-variant mt-0.5">
                  {saleRecipeActive
                    ? "Un producto que se prepara al venderlo no puede ser insumo: se vende en el punto de venta."
                    : "Se compra y lleva stock para tus recetas, pero no aparece en el punto de venta. Ej.: café en grano, leche, vasos."}
                </p>
              </div>
              <Switch
                aria-labelledby="ingredient-label"
                checked={form.is_ingredient === true}
                disabled={saleRecipeActive}
                onCheckedChange={(on) => setForm((prev) => ({ ...prev, is_ingredient: on }))}
              />
            </div>
          )}

          {/* "Aplica ICUI": impuesto saludable a los comestibles ultraprocesados
              (Ley 2277 de 2022, Colombia, 20 %). Es individual y por producto:
              lo marca el negocio y solo pesa en las compras de esos productos.
              Se muestra únicamente en tienda. */}
          {isTienda && itemType === "Producto" && (
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-outline-variant/15 bg-surface-container-low/50 p-4">
              <div>
                <p id="icui-label" className="text-sm font-semibold text-on-surface">Aplica ICUI</p>
                <p id="icui-help" className="text-xs text-on-surface-variant mt-0.5">
                  Marca los comestibles ultraprocesados (snacks, embutidos, dulces, galletas). El ICUI ya viene en tu costo de compra: aquí solo lo registras, no se cobra al cliente.
                </p>
              </div>
              <Switch
                aria-labelledby="icui-label"
                checked={form.icui_applies === true}
                onCheckedChange={(on) => setForm((prev) => ({ ...prev, icui_applies: on }))}
              />
            </div>
          )}

          {/* IVA del producto: el del negocio (null), exento o una tasa propia.
              Se usa al vender y al comprar; en compras es el que hereda cada
              línea de la factura. Todos los rubros. */}
          {itemType === "Producto" && (
            <Select
              id="product-tax-rate"
              label="IVA"
              hint="Se aplica al vender, al comprar y en la calculadora de precios de abajo."
              value={form.tax_rate == null ? "" : String(form.tax_rate)}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  tax_rate: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            >
              <option value="">Tasa del negocio ({+(rawRate * 100).toFixed(2)} %)</option>
              <option value="0">Exento (0 %)</option>
              <option value="0.05">5 %</option>
              <option value="0.19">19 %</option>
              {form.tax_rate != null && ![0, 0.05, 0.19].includes(Number(form.tax_rate)) && (
                <option value={String(form.tax_rate)}>{+(Number(form.tax_rate) * 100).toFixed(2)} %</option>
              )}
            </Select>
          )}

          {/* "Mostrar en el sitio web": solo filtra la página pública; el POS y
              el inventario no lo miran. Un insumo nunca sale en el sitio, así
              que ahí no se ofrece. */}
          {!(itemType === "Producto" && form.is_ingredient === true) && (
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-outline-variant/15 bg-surface-container-low/50 p-4">
              <div>
                <p id="show-on-site-label" className="text-sm font-semibold text-on-surface">Mostrar en el sitio web</p>
                <p id="show-on-site-help" className="text-xs text-on-surface-variant mt-0.5">
                  Si lo apagas, no aparece en tu página web. Puedes seguir vendiéndolo en el POS.
                </p>
              </div>
              <Switch
                aria-labelledby="show-on-site-label"
                checked={form.show_on_site !== false}
                onCheckedChange={(on) => setForm((prev) => ({ ...prev, show_on_site: on }))}
              />
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
                    {/* Un proveedor archivado no se ofrece, salvo que ya sea el de este producto. */}
                    {distributors.filter((d) => d.status !== "inactive" || d.id === form.distributor_id).map((d) => (
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
                onChange={(e) => {
                  const unit = e.target.value;
                  // Una unidad que ya mide (kg, L…) no tiene contenido: se limpia.
                  setForm((prev) => ({ ...prev, unit, ...(isMeasureUnit(unit) ? EMPTY_CONTENT : {}) }));
                  setFieldErrors((p) => ({ ...p, content: undefined }));
                }}
              >
                {PRODUCT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </Select>

              {/* Presentación: "cada bolsa trae 900 ml". Solo con el módulo de
                  recetas y solo si la unidad NO mide: algo que ya está en ml se
                  gasta en ml. Stock, compras y POS siguen contando bolsas; la
                  receta la gasta en ml. Va debajo del selector de unidad, que
                  es lo que completa. */}
              {contentApplies && !showContent && (
                <div className="sm:col-start-2 -mt-2">
                  <button
                    type="button"
                    onClick={() => setContentOpened(true)}
                    className="text-xs font-semibold text-primary-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                  >
                    ¿Lo usas en recetas medido en ml o g? Indica cuánto trae cada {unitNoun(form.unit)}
                  </button>
                </div>
              )}
              {showContent && (
                <div className="space-y-1.5 sm:col-start-2">
                  <label htmlFor="product-content-qty" className="text-[13px] font-semibold text-on-surface block">
                    Cada {unitNoun(form.unit)} trae <span className="text-on-surface-variant font-normal">(opcional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="product-content-qty"
                      ref={contentRef}
                      inputMode="decimal"
                      value={form.content_qty ?? ""}
                      onChange={(e) => {
                        setForm({ ...form, content_qty: e.target.value });
                        setFieldErrors((p) => ({ ...p, content: undefined }));
                      }}
                      aria-invalid={!!fieldErrors.content}
                      aria-describedby={fieldErrors.content ? "product-content-error" : "product-content-help"}
                      placeholder="Ej. 900"
                      className={`flex-1 min-w-0 bg-surface-container-lowest border rounded-xl h-11 px-4 text-base sm:text-sm text-on-surface tabular-nums focus:outline-none focus:ring-2 transition-all placeholder:text-on-surface-variant/50 ${
                        fieldErrors.content
                          ? "border-error focus:border-error focus:ring-error/20"
                          : "border-outline-variant/30 focus:border-primary focus:ring-primary/20"
                      }`}
                    />
                    <Select
                      aria-label="Unidad del contenido"
                      containerClassName="w-24 shrink-0"
                      value={form.content_unit || EMPTY_CONTENT.content_unit}
                      onChange={(e) => setForm({ ...form, content_unit: e.target.value })}
                    >
                      {MEASURE_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </Select>
                  </div>
                  {fieldErrors.content ? (
                    <p id="product-content-error" className="text-xs font-medium text-error">{fieldErrors.content}</p>
                  ) : (
                    <p id="product-content-help" className="text-xs text-on-surface-variant">
                      Ej.: una bolsa de leche trae 900 ml. Así sigues contando bolsas y la receta la gasta en ml.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}



          {itemType === "Producto" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
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

              <div className="space-y-1.5">
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
                {!searching && lookedUp && suggestedName(form.name, lookedUp.name) ? (
                  // El autocompletado no pisa un nombre guardado o escrito a mano;
                  // cambiarlo es una decisión explícita, a un clic.
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const name = suggestedName(form.name, lookedUp.name);
                      if (!name) return;
                      // Queda como "nuestro": el siguiente escaneo lo puede reemplazar.
                      autoFilledRef.current = { ...autoFilledRef.current, name };
                      setForm((prev) => ({ ...prev, name }));
                      setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                  >
                    Usar «{suggestedName(form.name, lookedUp.name)}» como nombre
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {itemType === "Producto" ? (
            <>
              <ProductPresentationSection
                pricing={(
                  <ProductPricingSection
                    purchase={{ base: purchase.base, total: purchase.total, fromBase: setPurchase.fromBase, fromTotal: setPurchase.fromTotal }}
                    selling={{ base: selling.base, total: selling.total, fromBase: (value) => {
                      setSelling.fromBase(value);
                      setFieldErrors((previous) => ({ ...previous, price: undefined }));
                    }, fromTotal: (value) => {
                      setSelling.fromTotal(value);
                      setFieldErrors((previous) => ({ ...previous, price: undefined }));
                    } }}
                    taxRate={productTaxRate}
                    includeTax={includeTax}
                    margin={margin}
                    presentation={presentation}
                    unitsPerPackage={form.units_per_package ?? "1"}
                    sellingPriceError={fieldErrors.price}
                    sellingPriceRef={priceRef}
                    ingredientMode={ingredientMode}
                    recipeCost={recipeCostInfo}
                  />

                )}
                recipe={recipeSection}
                presentation={presentation}
                setPresentation={handlePresentationChange}
                editId={editId ?? createdProductId}
                unitsPerPackage={form.units_per_package ?? "1"}
                onUnitsPerPackageChange={(v) => setForm({ ...form, units_per_package: v })}
                initialPackages={initialPackages}
                setInitialPackages={setInitialPackages}
                initialLoose={initialLoose}
                setInitialLoose={setInitialLoose}
                packagePrice={form.package_price ?? ""}
                onPackagePriceChange={(v) => setForm({ ...form, package_price: v })}
                packageHint={packageHint}
                tracksStock={!noStock}
                onTracksStockChange={(v) => setForm((prev) => ({ ...prev, tracks_stock: v }))}
                recipeManagedStock={saleRecipeActive}
                ingredientMode={ingredientMode}
                openPrice={form.open_price === true}
                onOpenPriceChange={(v) => setForm((prev) => ({ ...prev, open_price: v }))}
                currentStock={currentStock}
                canMoveStock={canMoveStock}
                allowsFractions={editingProduct?.allows_fractions ?? false}
                entryPackages={entryPackages}
                setEntryPackages={setEntryPackages}
                entryLoose={entryLoose}
                setEntryLoose={setEntryLoose}
                entryUnits={entryUnits}
              />
            </>
          ) : (
            <div className="pt-2">
              <h3 className="text-sm font-bold text-on-surface mb-2">Precio del servicio</h3>
              <p className="text-xs text-on-surface-variant mb-3">
                {includeTax
                  ? "Ingresa el precio que pagará el cliente. El IVA se discrimina sin cambiar ese total."
                  : "Ingresa el precio que pagará el cliente."}
              </p>
              <div className="grid grid-cols-1 gap-6 items-start">
                {/* Sin IVA: precio y duración lado a lado desde `sm`. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 items-start">
                  <div className="space-y-4">
                    <div className="flex items-end gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <label htmlFor="service-price" className="text-[13px] font-semibold text-on-surface block">{includeTax ? "Precio final" : "Precio"}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">$</span>
                          <input
                            id="service-price"
                            ref={priceRef}
                            type="number"
                            step="0.01"
                            min="0"
                            value={serviceFinalPrice}
                            onChange={(e) => { setServiceFinalPrice(e.target.value); setFieldErrors((p) => ({ ...p, price: undefined })); }}
                            aria-invalid={!!fieldErrors.price}
                            aria-describedby={fieldErrors.price ? "service-price-error" : undefined}
                            className={`w-full bg-surface-container-lowest border rounded-xl py-3 pl-7 pr-4 text-sm text-on-surface focus:outline-none focus:ring-2 transition-all ${
                              fieldErrors.price
                                ? "border-error focus:border-error focus:ring-error/20"
                                : "border-outline-variant/30 focus:border-primary focus:ring-primary/20"
                            }`}
                            placeholder="0.00"
                            required
                          />
                        </div>
                        {fieldErrors.price && (
                          <p id="service-price-error" className="text-xs font-medium text-error">
                            {fieldErrors.price}
                          </p>
                        )}
                      </div>
                      {includeTax && taxRate > 0 && (
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
                    {/* Sin IVA en el negocio no hay nada que desglosar: el precio es el total. */}
                    {includeTax && (
                      <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-lowest px-5 py-4 text-sm">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Desglose del precio</p>
                        <div className="flex items-center justify-between gap-4 text-on-surface-variant">
                          <span>Precio antes de IVA</span>
                          <span>{fmtMoney(serviceBaseValue)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-4 text-on-surface-variant">
                          <span>IVA{taxRate > 0 && sellingPriceTax !== "Ninguno" ? ` (${percentLabel})` : ""}</span>
                          <span>{fmtMoney(serviceTaxValue)}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4 border-t border-outline-variant/15 pt-3 font-bold text-on-surface">
                          <span>Total a cobrar</span>
                          <span>{fmtMoney(serviceFinalValue)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label htmlFor="service-duration" className="text-[13px] font-semibold text-on-surface block">Duración (minutos)</label>
                    {/* La conversión va PEGADA al número: se carga en minutos
                        porque es lo que suma la agenda, pero "90" no se lee
                        como "hora y media" de un vistazo. */}
                    <div className="relative">
                      <input
                        id="service-duration"
                        type="number"
                        min="1"
                        step="5"
                        value={serviceDuration}
                        onChange={(e) => setServiceDuration(e.target.value)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 pl-4 pr-36 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                        placeholder="30"
                        aria-describedby="service-duration-human"
                      />
                      {formatDuration(Number(serviceDuration)) && (
                        <span
                          id="service-duration-human"
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                        >
                          = {formatDuration(Number(serviceDuration))}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[15, 30, 45, 60, 90, 120].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setServiceDuration(String(m))}
                          aria-pressed={Number(serviceDuration) === m}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                            Number(serviceDuration) === m
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-on-surface"
                          }`}
                        >
                          {formatDuration(m)}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      Es lo que ocupa en la agenda al reservarlo.
                    </p>
                  </div>

                  {/* La descripción es lo que lee el cliente en el sitio público
                      antes de reservar. Un producto no la tiene: para eso está
                      la foto. */}
                  <div className="space-y-1.5">
                    <label htmlFor="service-description" className="text-[13px] font-semibold text-on-surface block">
                      Descripción <span className="text-on-surface-variant font-normal">(opcional)</span>
                    </label>
                    <textarea
                      id="service-description"
                      rows={3}
                      value={serviceDescription}
                      onChange={(e) => setServiceDescription(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50 resize-none"
                      placeholder="Qué incluye el servicio. Se muestra a tus clientes al reservar."
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between p-3 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <div>
                  <p id="service-active-label" className="text-sm font-bold text-on-surface">Servicio Activo</p>
                  <p id="service-active-help" className="text-xs text-on-surface-variant mt-1">Disponible para agendar y cobrar.</p>
                </div>
                <Switch
                  aria-labelledby="service-active-label"
                  checked={serviceStatus === "active"}
                  onCheckedChange={(on) => setServiceStatus(on ? "active" : "inactive")}
                  className="ml-4"
                />
              </div>
            </div>
          )}

          {itemType === "Servicio" && recipeSection}

          {/* Comisión. Un insumo no se vende, así que no comisiona. */}
          {!ingredientMode && (
          <div className="pt-4 border-t border-outline-variant/10">
            <div className="flex items-center gap-3 mb-4">
              <Switch
                aria-labelledby="commission-label"
                checked={form.has_commission}
                onCheckedChange={(on) => {
                  setForm({ ...form, has_commission: on, commission_type: "percentage", commission_value: "" });
                  setFieldErrors((p) => ({ ...p, commission: undefined }));
                }}
              />
              <div>
                <p id="commission-label" className="text-sm font-semibold text-on-surface">Genera comisión</p>
                <p id="commission-help" className="text-xs text-on-surface-variant">
                  Asigna una comisión al personal por este {itemType === "Servicio" ? "servicio" : "producto"}
                </p>
              </div>
            </div>

            {form.has_commission && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 pl-0 sm:pl-14">
                <Select
                  label="Tipo de comisión"
                  value={form.commission_type}
                  onChange={(e) => {
                    setForm({ ...form, commission_type: e.target.value });
                    if (form.commission_value.trim()) {
                      setFieldErrors((p) => ({
                        ...p,
                        commission: commissionError(true, e.target.value, form.commission_value),
                      }));
                    }
                  }}
                >
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="fixed">Valor fijo ($)</option>
                </Select>
                <div className="space-y-1.5">
                  <label htmlFor="commission-value" className="text-[13px] font-semibold text-on-surface block">
                    {form.commission_type === "fixed" ? "Valor por unidad ($)" : "Porcentaje (%)"}
                  </label>
                  <input
                    id="commission-value"
                    ref={commissionRef}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max={form.commission_type === "fixed" ? "999999" : "100"}
                    value={form.commission_value}
                    onChange={(e) => {
                      setForm({ ...form, commission_value: e.target.value });
                      // Validación EN VIVO: el 150 % se marca mientras se escribe,
                      // no recién al guardar.
                      const err = e.target.value.trim()
                        ? commissionError(true, form.commission_type, e.target.value)
                        : undefined;
                      setFieldErrors((p) => ({ ...p, commission: err }));
                    }}
                    aria-invalid={!!fieldErrors.commission}
                    aria-describedby={fieldErrors.commission ? "commission-value-error" : undefined}
                    className={`w-full bg-surface-container-lowest border rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:ring-2 transition-all placeholder:text-on-surface-variant/50 ${
                      fieldErrors.commission
                        ? "border-error focus:border-error focus:ring-error/20"
                        : "border-outline-variant/30 focus:border-primary focus:ring-primary/20"
                    }`}
                    placeholder={form.commission_type === "fixed" ? "0.00" : "0"}
                  />
                  {fieldErrors.commission && (
                    <p id="commission-value-error" className="text-xs font-medium text-error">
                      {fieldErrors.commission}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Cada mitad guarda en su tabla, así que el fallo llega por el store
            que corresponde. Antes el servicio se guardaba con `catch {}` vacíos
            y un error de la base no llegaba nunca a la pantalla. */}
        {(itemType === "Servicio" ? serviceError : error) && (
          <p className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
            {itemType === "Servicio" ? serviceError : error}
          </p>
        )}

        {/* El movimiento tiene store propio: si el producto se guardó y la
            entrada falló, decirlo con el error del inventario sería mentir sobre
            qué quedó guardado. */}
        {itemType === "Producto" && movementError && (
          <p className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
            El producto se guardó, pero la entrada de stock no: {movementError}
          </p>
        )}

        {/* Barra de acciones fija abajo en el teléfono (D18): en un formulario
            de esta longitud "Guardar" quedaba a varios scrolls de distancia.
            `-bottom-4 sm:-bottom-6` compensa el p-4/sm:p-6 del <main>: un
            sticky se pega al borde del padding, no al de la pantalla. */}
        <div className="sticky -bottom-4 sm:-bottom-6 z-20 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-0 bg-surface/95 backdrop-blur border-t border-outline-variant/20 lg:border-0 lg:bg-transparent lg:backdrop-blur-none lg:static flex justify-between items-center gap-3">
          <Link
            href={backTo}
            onClick={guardLeave}
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
            ) : editingId
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

      {leaveDialog}
      {recipeDialog}
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
