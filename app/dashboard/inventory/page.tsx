"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  IconSearch,
  IconBox,
  IconAlertTriangle,
  IconImagePlaceholder,
  IconMoveHorizontal,
  IconScissors,
} from "@/app/assets/icons/DashboardIcons";
import { useInventoryStore } from "@/stores/inventory.store";
import { useServicesStore } from "@/stores/services.store";
import { getUnitCost, calculateInventoryValue } from "@/services/inventory.service";
import type { CatalogRow } from "@/lib/catalog";
import type { CatalogStatusFilter } from "@/lib/catalog";
import {
  catalogRowsOf,
  catalogEditHref,
  catalogMatchesQuery,
  catalogMatchesStatus,
  catalogKpis,
  isArchivedRow,
  isCatalogSortKey,
  sortCatalogRows,
  type CatalogSortKey,
} from "@/lib/catalog";
import { useUrlParams, useCurrentPathWithSearch, withBackParam } from "@/lib/useUrlState";
import { ImportWizard } from "@/lib/import/ImportWizard";
import { PRODUCT_IMPORT, existingProductKeys, annotateProductPreview, type ProductImportRecord } from "@/lib/import/products";
import type { PreviewRow } from "@/lib/import/core";
import { catalogExportRows, exportFileName } from "@/lib/import/export";
import { downloadCsv } from "@/lib/import/spreadsheet";
import { stockStatusOf, stockLabelOf, needsRestock, STOCK_CHIP, STOCK_DOT, SERVICE_CHIP, tracksStock, NO_STOCK_LABEL } from "@/lib/stock";
import { useProfile } from "@/components/ProfileProvider";
import { can } from "@/lib/permissions";
import { Select } from "@/components/ui/Select";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { StockAdjustmentModal } from "@/components/StockAdjustmentModal";
import { ProductModal } from "@/components/ProductModal";
import { notifyError } from "@/lib/notifications";
import { CollectionEmpty, CollectionError, CollectionFilteredEmpty, CollectionLoading } from "@/components/CollectionState";
import { Pagination } from "@/components/Pagination";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";
import { effectiveModules } from "@/config/business";
import { useRecipesStore } from "@/stores/recipes.store";
import { ingredientNeedsRestock } from "@/lib/recipe-editor";

/**
 * Vistas del catálogo que solo existen con "Recetas y producción". `?filtro=`
 * es el alias que usan los enlaces de afuera (avisos, Panel).
 */
const RECIPE_VIEWS = [
  { id: "", label: "Todo" },
  { id: "insumos", label: "Insumos" },
  { id: "insumos-bajos", label: "Insumos por reponer" },
  { id: "receta", label: "Con receta" },
] as const;
type RecipeView = (typeof RECIPE_VIEWS)[number]["id"];

/** Etiqueta chica junto al nombre: "Insumo", "Receta", "Por lotes". */
function KindChip({ label, tone }: { label: string; tone: "ingredient" | "recipe" }) {
  return (
    <span
      className={`ml-2 inline-flex items-center rounded-md px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide ${
        tone === "ingredient"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
          : "bg-primary/10 text-primary-ink border border-primary/20"
      }`}
    >
      {label}
    </span>
  );
}


function IconScanLine(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
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

/**
 * Encabezado ordenable: el `<button>` es lo que se alcanza con Tab y el
 * `aria-sort` del `<th>` le dice al lector de pantalla cómo está ordenado. El
 * ↕ marca las columnas que se pueden tocar aunque no sean las que mandan.
 */
function SortableTh({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: CatalogSortKey;
  current: CatalogSortKey | null;
  dir: "asc" | "desc";
  onSort: (key: CatalogSortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={`py-4 font-bold ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 uppercase tracking-wider font-bold rounded-md hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {label}
        <span aria-hidden="true" className={`inline-block text-[10px] leading-none ${active ? "text-primary" : "opacity-50"}`}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

/** Marca de "esto ya no se vende": acompaña a la fila atenuada. */
function ArchivedChip() {
  return (
    <span className="ml-2 inline-flex items-center rounded-md border border-outline-variant/30 bg-surface-container-highest px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
      Archivado
    </span>
  );
}

/**
 * El catálogo del negocio: productos y servicios en una sola pantalla.
 *
 * Eran dos ("Inventario" y "Servicios") y el dueño tenía que saber de antemano
 * en cuál de las dos estaba lo que buscaba. Peor: un servicio se guardaba en las
 * DOS tablas para poder aparecer en las dos pantallas, con una sincronización
 * por nombre que en producción no funcionaba en ningún caso.
 *
 * Ahora cada mitad se guarda donde corresponde —`products` y `services`— y se
 * juntan acá, al leer. Lo que la pantalla no puede hacer es tratarlas igual: un
 * servicio no tiene stock, ni costo, ni SKU, ni movimientos de inventario, y
 * cada columna que no le aplica dice "—" en vez de inventarle un cero.
 */
export default function CatalogPage() {
  // Espejo de la RLS: acá se esconde lo que la persona no puede usar, pero
  // quien corta de verdad es la base (policies, trigger y RPC).
  const fmtMoney = useFormatMoney();
  const profile = useProfile();
  const canSeeCosts = can(profile, "inventory_costs");
  const canEdit = can(profile, "inventory_edit");
  const canMoveStock = can(profile, "inventory_stock");
  // Escribir en `services` pide su propio permiso: la policy de esa tabla exige
  // `worker_can('services')`, no `inventory_edit`.
  const canEditServices = can(profile, "services");

  /**
   * El VALOR TOTAL del inventario es solo del dueño, ni siquiera con
   * `inventory_costs`.
   *
   * No es lo mismo saber cuánto costó un producto —que un encargado de compras
   * necesita para reponer— que ver cuánto capital tiene el negocio parado en
   * mercadería. Lo primero es operativo; lo segundo es una cifra financiera del
   * dueño y no hace falta para ninguna tarea de mostrador.
   */
  const canSeeInventoryValue = !profile?.isWorker;

  /** "Recetas y producción": vistas de insumos y etiquetas de receta. */
  const productionOn =
    effectiveModules(profile?.businessType ?? null, profile?.modules ?? null).production === true;
  const recipes = useRecipesStore((s) => s.recipes);
  const fetchRecipes = useRecipesStore((s) => s.fetchRecipes);
  useEffect(() => {
    if (productionOn) void fetchRecipes();
  }, [productionOn, fetchRecipes]);
  const recipeKindByProduct = useMemo(() => {
    const map = new Map<string, "sale" | "production">();
    if (!productionOn) return map;
    for (const r of recipes) if (r.product_id && r.items.length > 0) map.set(r.product_id, r.kind);
    return map;
  }, [productionOn, recipes]);
  const servicesWithRecipe = useMemo(
    () => new Set(productionOn ? recipes.filter((r) => r.service_id && r.items.length > 0).map((r) => r.service_id as string) : []),
    [productionOn, recipes],
  );

  const [confirmArchive, setConfirmArchive] = useState<CatalogRow | null>(null);


  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const distributors = useInventoryStore((s) => s.distributors);
  const importProducts = useInventoryStore((s) => s.importProducts);
  const loadingProducts = useInventoryStore((s) => s.loading);
  const error = useInventoryStore((s) => s.error);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const archiveProduct = useInventoryStore((s) => s.archiveProduct);
  const activateProduct = useInventoryStore((s) => s.activateProduct);

  const services = useServicesStore((s) => s.services);
  const loadingServices = useServicesStore((s) => s.loading);
  const serviceError = useServicesStore((s) => s.error);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const setServiceStatus = useServicesStore((s) => s.setServiceStatus);

  const loading = loadingProducts || loadingServices;

  /**
   * Búsqueda, filtros, orden y página viven en la URL (D8): volver de editar un
   * producto deja la lista donde estaba, y un refresco no la resetea. Lo que
   * llega pegado a mano y no es válido cae al default.
   */
  const [filters, setFilters] = useUrlParams({
    q: "",
    type: "",
    cat: "",
    stock: "",
    vista: "",
    filtro: "",
    // Activos por defecto: lo archivado no se vende, y mezclado con lo activo
    // se leía como si siguiera en el catálogo.
    status: "active",
    sort: "",
    dir: "asc",
    page: "1",
    size: "10",
  });
  const searchQuery = filters.q;
  const typeFilter: "" | "product" | "service" =
    filters.type === "product" || filters.type === "service" ? filters.type : "";
  const categoryFilter = filters.cat;
  const stockFilter = filters.stock;
  const statusFilter: CatalogStatusFilter =
    filters.status === "archived" || filters.status === "all" ? filters.status : "active";
  const sortKey: CatalogSortKey | null = isCatalogSortKey(filters.sort) ? filters.sort : null;
  const sortDir: "asc" | "desc" = filters.dir === "desc" ? "desc" : "asc";
  const currentPage = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(filters.size)) ? Number(filters.size) : 10;

  const setSearchQuery = (q: string) => setFilters({ q, page: null });
  const setTypeFilter = (type: string) => setFilters({ type, page: null });
  const setCategoryFilter = (cat: string) => setFilters({ cat, page: null });
  const setStockFilter = (stock: string) => setFilters({ stock, page: null });
  const recipeView: RecipeView = !productionOn
    ? ""
    : (RECIPE_VIEWS.find((v) => v.id === (filters.vista || filters.filtro))?.id ?? "");
  const setRecipeView = (vista: RecipeView) => setFilters({ vista: vista || null, filtro: null, page: null });
  const setStatusFilter = (status: CatalogStatusFilter) => setFilters({ status, page: null });
  const setCurrentPage = (page: number) => setFilters({ page });
  const setPageSize = (size: number) => setFilters({ size, page: null });
  const toggleSort = (key: CatalogSortKey) =>
    setFilters(
      sortKey === key
        ? { sort: key, dir: sortDir === "asc" ? "desc" : "asc", page: null }
        : { sort: key, dir: "asc", page: null },
    );

  /** Ruta actual con sus filtros: el formulario vuelve acá al guardar o cancelar. */
  const backTo = useCurrentPathWithSearch("/dashboard/inventory");
  const editHref = (row: CatalogRow) => withBackParam(catalogEditHref(row), backTo, "/dashboard/inventory");
  const movementsHref = (id: string) => `/dashboard/inventory/movements?product_id=${id}`;

  const [importOpen, setImportOpen] = useState(false);
  const existingKeys = useMemo(() => existingProductKeys(products), [products]);
  const annotateImport = useCallback(
    (rows: PreviewRow<ProductImportRecord>[]) =>
      annotateProductPreview(
        rows,
        categories.map((c) => c.name),
        distributors.map((d) => d.business_name),
      ),
    [categories, distributors],
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string | undefined>();
  /** Código escaneado que no existe en el catálogo: abre el alta con él puesto. */
  const [newProductBarcode, setNewProductBarcode] = useState<string | null>(null);

  const rows = catalogRowsOf(products, services);
  // Los KPIs cuentan solo lo activo (ver `catalogKpis`).
  const kpis = catalogKpis(rows);
  const productCount = kpis.products;
  const serviceCount = kpis.services;

  /**
   * Un escaneo desde el catálogo responde una de dos cosas: "acá está" o
   * "no lo tenés". Antes solo hacía lo primero y, si el código no existía, el
   * buscador quedaba vacío sin decir nada. Ahora la segunda respuesta abre el
   * alta rápida con el código ya cargado: escanear el empaque ES la forma de
   * dar de alta un producto desde el celular.
   */
  const handleScannedCode = (code: string) => {
    const value = code.trim();
    const q = value.toLowerCase();
    const match = products.find(
      (p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q,
    );

    if (match) {
      setSearchQuery(value);
      setCurrentPage(1);
      return;
    }

    if (!canEdit) {
      setSearchQuery(value);
      setCurrentPage(1);
      notifyError("Producto no encontrado", `Ningún producto tiene el código ${value}.`);
      return;
    }

    setNewProductBarcode(value);
  };


  /** Filtro por fila: búsqueda, tipo y categoría. */
  const matchesRow = (row: CatalogRow): boolean => {
    if (!catalogMatchesQuery(row, searchQuery)) return false;
    if (!catalogMatchesStatus(row, statusFilter)) return false;
    if (typeFilter && row.kind !== typeFilter) return false;
    if (categoryFilter && row.categoryName !== categoryFilter) return false;
    return true;
  };

  /** Vistas de "Recetas y producción" (insumos, por reponer, con receta). */
  const matchesRecipeView = (row: CatalogRow): boolean => {
    if (!recipeView) return true;
    if (recipeView === "receta") {
      return row.kind === "product" ? recipeKindByProduct.has(row.id) : servicesWithRecipe.has(row.id);
    }
    if (row.kind !== "product") return false;
    if (recipeView === "insumos") return row.product.is_ingredient === true;
    return ingredientNeedsRestock(row.product);
  };

  const matchesStock = (row: CatalogRow): boolean => {
    // Un servicio no tiene stock, así que no puede estar agotado, bajo ni
    // óptimo: en cuanto se filtra por estado de inventario, queda afuera.
    if (!stockFilter) return true;
    if (row.kind !== "product") return false;
    // El filtro devuelve EXACTAMENTE lo que cuenta el KPI de arriba. Que ese
    // número y esta lista se contradigan es el bug que reportó QA.
    if (stockFilter === "Agotado" && (!tracksStock(row.product) || row.product.stock_level !== 0)) return false;
    if (stockFilter === "Stock Bajo" && !needsRestock(row.product)) return false;
    if (stockFilter === "Óptimo" && needsRestock(row.product)) return false;
    return true;
  };

  /**
   * El ítem es la unidad que se dibuja y se pagina: cada fila es un producto o
   * un servicio, y el filtro se aplica sobre él directamente. Cada página es un
   * corte plano de la lista filtrada.
   */
  const filteredRows = sortCatalogRows(
    rows.filter((row) => matchesRow(row) && matchesStock(row) && matchesRecipeView(row)),
    sortKey,
    sortDir,
  );

  const totalFilteredCount = filteredRows.length;

  const pageAssignments: CatalogRow[][] = [];
  for (let i = 0; i < filteredRows.length; i += pageSize) {
    pageAssignments.push(filteredRows.slice(i, i + pageSize));
  }

  const totalPages = pageAssignments.length || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = pageAssignments[safeCurrentPage - 1] ?? [];

  const rowsBeforePage = pageAssignments
    .slice(0, safeCurrentPage - 1)
    .reduce((acc, page) => acc + page.length, 0);

  const pageStartItem = totalFilteredCount > 0 ? rowsBeforePage + 1 : 0;
  const pageEndItem = rowsBeforePage + paginatedRows.length;

  const clearFilters = () =>
    setFilters({ q: null, type: null, cat: null, stock: null, status: null, vista: null, filtro: null, page: null });

  /** Exporta lo que se está viendo: los filtros aplicados, en el orden elegido. */
  const exportCatalog = () =>
    downloadCsv(exportFileName("catalogo"), catalogExportRows(filteredRows, { includeCosts: canSeeCosts }));

  useEffect(() => {
    fetchInventory();
    fetchServices();
  }, [fetchInventory, fetchServices]);

  /** Archivar y activar viven en tablas distintas; la fila dice en cuál. */
  const setRowActive = async (row: CatalogRow, active: boolean) => {
    if (row.kind === "product") {
      await (active ? activateProduct(row.id) : archiveProduct(row.id));
      return;
    }
    await setServiceStatus(row.id, active ? "active" : "inactive");
  };

  const canArchive = (row: CatalogRow) => (row.kind === "product" ? canEdit : canEditServices);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-on-surface tracking-tight">Productos y Servicios</h1>
          <p className="text-on-surface-variant text-sm mt-1.5">
            {productCount} producto{productCount !== 1 ? "s" : ""} y {serviceCount} servicio
            {serviceCount !== 1 ? "s" : ""} activos en tu catálogo
            {kpis.archived > 0 && ` · ${kpis.archived} archivado${kpis.archived !== 1 ? "s" : ""}`}
          </p>
        </div>
        {/* Móvil: secundarios a dos columnas y el primario debajo, a ancho completo.
            Cada acción se muestra solo si la persona puede ejecutarla: un botón
            que siempre falla es peor que un botón ausente. */}
        <div className="grid grid-cols-2 gap-3 w-full lg:flex lg:flex-wrap lg:justify-end lg:w-auto">
          {/* Movimientos de inventario (D7): antes la pantalla existía pero
              ninguna parte de la UI llevaba a ella. */}
          <Link href="/dashboard/inventory/movements" className="h-11 whitespace-nowrap bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-3 lg:px-4 rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <IconMoveHorizontal className="w-4 h-4" />
            Movimientos
          </Link>
          <button type="button" onClick={exportCatalog} disabled={filteredRows.length === 0} className="h-11 whitespace-nowrap bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-3 lg:px-4 rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed">
            <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar CSV
          </button>
          {canEdit && (
          <button type="button" onClick={() => setImportOpen(true)} className="h-11 whitespace-nowrap bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-3 lg:px-4 rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Importar
          </button>
          )}
          {/* Categorías dejó de ser un ítem del menú principal: es una tabla
              auxiliar de baja frecuencia y ocupaba un lugar de primer nivel.
              Su puerta es esta, que está donde las categorías se usan. */}
          {canEdit && (
          <Link href="/dashboard/categories" className="h-11 whitespace-nowrap bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-3 lg:px-4 rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M20.6 13.4 12 4.8V2H9.2L2 9.2v2.8l8.6 8.6a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z" />
              <circle cx="6.5" cy="6.5" r="1.5" />
            </svg>
            Categor&iacute;as
          </Link>
          )}
          {(canEdit || canEditServices) && (
          <Link
            href={withBackParam("/dashboard/inventory/product", backTo, "/dashboard/inventory")}
            className="h-11 col-span-2 lg:col-span-1 whitespace-nowrap bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold px-5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Producto / Servicio
          </Link>
          )}
        </div>
      </div>

      {error && <CollectionError message={error} onRetry={fetchInventory} />}
      {serviceError && <CollectionError message={serviceError} onRetry={fetchServices} />}

      {/* Stats. La valorización del inventario es cifra financiera del negocio:
          solo el dueño, ni siquiera un empleado con `inventory_costs`. */}
      <div className={`grid grid-cols-1 gap-6 ${canSeeInventoryValue ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Total en Cat&aacute;logo</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{productCount + serviceCount}</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {productCount} producto{productCount !== 1 ? "s" : ""} &middot; {serviceCount} servicio{serviceCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="w-14 h-14 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconBox className="w-7 h-7" />
          </div>
        </div>

        {canSeeInventoryValue && (
        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center gap-4 group hover:border-outline-variant/20 transition-colors">
          <div className="min-w-0">
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Valor del Inventario</p>
            {/* Cifra larga: en móvil baja de tamaño en vez de comerse el ícono. */}
            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-on-surface tracking-tight truncate">
              {fmtMoney(calculateInventoryValue(products))}
            </h3>
            {/* Un servicio no es capital parado: no hay mercadería que valorizar. */}
            <p className="text-xs text-on-surface-variant mt-1">Solo mercader&iacute;a</p>
          </div>
          <div className="w-14 h-14 shrink-0 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconLayers className="w-7 h-7" />
          </div>
        </div>
        )}

        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Stock Bajo</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{kpis.lowStock}</h3>
          </div>
          <div className="w-14 h-14 shrink-0 rounded-xl bg-error/10 text-error flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconAlertTriangle className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="px-4 lg:px-7 py-4 lg:py-5 border-b border-outline-variant/10 flex flex-col md:flex-row gap-3 lg:gap-4 items-center justify-between bg-surface-container-lowest">
          <div className="flex w-full md:w-96 gap-2">
            <div className="relative flex-1 min-w-0">
              <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Buscar nombre, SKU o código..."
                /* text-base en móvil: por debajo de 16px iOS hace zoom al enfocar. */
                className="w-full h-11 bg-surface-container border border-outline-variant/20 rounded-xl pl-11 pr-4 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
              />
            </div>
            {/* Escaneo con la cámara: el código detectado va al mismo buscador,
                porque buscar por código es buscar. */}
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label="Escanear código de barras"
              title="Escanear código de barras"
              className="lg:hidden shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary transition-colors"
            >
              <IconScanLine className="w-5 h-5" />
            </button>
          </div>
          {/* Etiquetas cortas en móvil: "Todas las Categorías" se cortaba a
              "Todas las C" y dejaba de decir qué filtra. */}
          <div className="flex w-full md:w-auto gap-2 lg:gap-3">
            <Select
              aria-label="Filtrar por tipo"
              containerClassName="flex-1 md:w-36"
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value as "" | "product" | "service"); setCurrentPage(1); }}
            >
              <option value="">Tipo</option>
              <option value="product">Productos</option>
              <option value="service">Servicios</option>
            </Select>
            <Select
              aria-label="Filtrar por categoría"
              containerClassName="flex-1 md:w-44"
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="">Categor&iacute;a</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por estado de stock"
              containerClassName="flex-1 md:w-40"
              value={stockFilter}
              onChange={e => { setStockFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="">Stock</option>
              <option value="Óptimo">&Oacute;ptimo</option>
              <option value="Stock Bajo">Stock Bajo</option>
              <option value="Agotado">Agotado</option>
            </Select>
            <Select
              aria-label="Filtrar por estado"
              containerClassName="flex-1 md:w-36"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as CatalogStatusFilter); setCurrentPage(1); }}
            >
              <option value="active">Activos</option>
              <option value="archived">Archivados</option>
              <option value="all">Todos</option>
            </Select>
          </div>
          {/* En móvil no hay encabezados que tocar: el orden se elige acá. */}
          <Select
            aria-label="Ordenar por"
            containerClassName="w-full lg:hidden"
            value={sortKey ? `${sortKey}:${sortDir}` : ""}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":");
              setFilters(key ? { sort: key, dir, page: null } : { sort: null, dir: null, page: null });
            }}
          >
            <option value="">Más recientes primero</option>
            <option value="name:asc">Nombre (A–Z)</option>
            <option value="name:desc">Nombre (Z–A)</option>
            <option value="price:asc">Precio: menor a mayor</option>
            <option value="price:desc">Precio: mayor a menor</option>
            <option value="stock:asc">Stock: menor a mayor</option>
            <option value="stock:desc">Stock: mayor a menor</option>
            <option value="category:asc">Categoría (A–Z)</option>
          </Select>
        </div>

        {productionOn && (
          <div className="flex gap-2 overflow-x-auto px-4 lg:px-7 py-3 border-b border-outline-variant/10 bg-surface-container-lowest" role="group" aria-label="Vista de insumos y recetas">
            {RECIPE_VIEWS.map((v) => {
              const count =
                v.id === "insumos-bajos"
                  ? products.filter((p) => p.status !== "inactive" && ingredientNeedsRestock(p)).length
                  : null;
              const active = recipeView === v.id;
              return (
                <button
                  key={v.id || "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRecipeView(v.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? "border-primary/40 bg-primary/10 text-primary-ink"
                      : "border-outline-variant/20 bg-surface-container text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {v.label}
                  {count !== null && count > 0 && (
                    <span className="rounded-full bg-error px-1.5 text-[10px] leading-4 text-on-error tabular-nums">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Móvil: la tabla de 7 columnas no entra en un teléfono, así que cada
            ítem se dibuja como tarjeta. El fondo alterno es lo que separa
            uno del siguiente: la ficha ocupa tres líneas y una divisoria de
            1px no da la señal. */}
        <ul className="lg:hidden divide-y divide-outline-variant/20">
          {loading ? (
            <li><CollectionLoading label="Cargando catálogo…" /></li>
          ) : filteredRows.length === 0 ? (
            <li>
              {rows.length === 0 ? (
                <CollectionEmpty icon={<IconBox className="h-8 w-8" />} title="Aún no hay nada en tu catálogo" description="Crea tu primer producto o servicio para empezar a vender." action={{ label: "Crear el primero", href: "/dashboard/inventory/product" }} />
              ) : (
                <CollectionFilteredEmpty title="Nada coincide con los filtros" action={{ label: "Limpiar filtros", onClick: clearFilters }} />
              )}
            </li>
          ) : (
            paginatedRows.map((row) => {
              const isService = row.kind === "service";
              const archived = isArchivedRow(row);
              // `null` = no hay estado de stock que mostrar. Un servicio nunca
              // lo tuvo; un producto marcado "sin inventario" dejó de tenerlo, y
              // pintarle "Agotado" sobre un cero que nadie mantiene sería
              // afirmar algo falso.
              const status = row.kind === "product" && tracksStock(row.product)
                ? stockStatusOf(row.product.stock_level, row.product.minimum_stock)
                : null;
              // La tarjeta entera es el objetivo táctil, no un ícono de 16px en
              // la esquina: en el teléfono se toca con el pulgar. Sin permiso de
              // edición se dibuja igual pero no navega: un enlace que lleva a un
              // formulario que no se puede guardar es peor que no tenerlo.
              const cardBody = (
                <>
                  <div className="flex items-start gap-3">
                      <div className="relative w-11 h-11 shrink-0 rounded-xl bg-surface-container-lowest border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30 overflow-hidden">
                        {row.imageUrl ? (
                          <Image src={row.imageUrl} alt="" fill sizes="44px" unoptimized className="object-cover" />
                        ) : isService ? (
                          <IconScissors className="w-5 h-5 text-[#8b5cf6]" />
                        ) : (
                          <IconImagePlaceholder className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-snug font-semibold text-on-surface break-words">
                          {row.name}
                          {archived && <ArchivedChip />}
                          {row.kind === "product" && productionOn && row.product.is_ingredient && <KindChip label="Insumo" tone="ingredient" />}
                          {row.kind === "product" && recipeKindByProduct.get(row.id) === "sale" && <KindChip label="Receta" tone="recipe" />}
                          {row.kind === "product" && recipeKindByProduct.get(row.id) === "production" && <KindChip label="Por lotes" tone="recipe" />}
                          {row.kind === "service" && servicesWithRecipe.has(row.id) && <KindChip label="Receta" tone="recipe" />}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                          {row.kind === "product" ? (
                            <span className="font-mono">{row.product.sku}</span>
                          ) : (
                            <span>{row.service.duration_minutes} min</span>
                          )}
                          {row.categoryName ? ` · ${row.categoryName}` : ""}
                        </p>
                      </div>
                      {/* El precio de venta acompaña al nombre; el costo baja a
                          la línea del stock. Así lo primario no compite con lo
                          secundario y el nombre gana el ancho que necesita. */}
                      <p className="shrink-0 text-base font-bold text-on-surface tabular-nums leading-snug">
                        {fmtMoney(row.price)}
                      </p>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      {row.kind === "service" || status === null ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${SERVICE_CHIP}`}>
                          {row.kind === "service" ? "Servicio" : NO_STOCK_LABEL}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${STOCK_CHIP[status]}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${STOCK_DOT[status]}`} />
                          {stockLabelOf(row.product.stock_level, row.product.minimum_stock)}
                        </span>
                      )}
                      {canSeeCosts && row.kind === "product" && (
                        <span className="text-[11px] text-on-surface-variant/70 tabular-nums shrink-0">
                          costo {fmtMoney(getUnitCost(row.product))}{(row.product.units_per_package ?? 1) > 1 ? " / u." : ""}
                        </span>
                      )}
                    </div>
                </>
              );

              const canOpen = row.kind === "product" ? canEdit : canEditServices;

              return (
                <li key={`${row.kind}-${row.id}`} className={`even:bg-on-surface/[0.05] ${archived ? "opacity-60" : ""}`}>
                  <div className={canMoveStock ? "flex items-stretch" : ""}>
                  {canOpen ? (
                    <Link
                      href={editHref(row)}
                      // min-w-0: a flex item cannot shrink below its content
                      // width by default, which pushed the movement button past
                      // the screen edge on phones.
                      className="flex-1 min-w-0 block px-4 py-3.5 active:bg-on-surface/10 transition-colors"
                    >
                      {cardBody}
                    </Link>
                  ) : (
                    <div className="flex-1 min-w-0 px-4 py-3.5">{cardBody}</div>
                  )}
                  {/* Services have no stock to move; reserve the button's width
                      so their prices line up with the product rows. */}
                  {canMoveStock && row.kind === "service" && (
                    <span aria-hidden="true" className="shrink-0 w-[3.25rem]" />
                  )}
                  {canMoveStock && row.kind === "product" && (
                    <button
                      type="button"
                      onClick={() => { setAdjustProductId(row.id); setAdjustModalOpen(true); }}
                      className="shrink-0 w-[3.25rem] flex items-center justify-center text-on-surface-variant hover:text-primary active:text-primary transition-colors"
                      title="Registrar movimiento"
                      aria-label={`Registrar movimiento de ${row.name}`}
                    >
                      <IconMoveHorizontal className="w-5 h-5" />
                    </button>
                  )}
                  </div>
                  {/* Fuera del enlace de la tarjeta: un enlace dentro de otro
                      es inválido y el toque iría a cualquiera de los dos. */}
                  {row.kind === "product" && (
                    <Link
                      href={movementsHref(row.id)}
                      className="inline-flex items-center gap-1 mx-4 mb-3 -mt-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                    >
                      Ver movimientos
                    </Link>
                  )}
                </li>
              );
            })
          )}
        </ul>

        {/* Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
                <SortableTh label="Ítem" sortKey="name" current={sortKey} dir={sortDir} onSort={toggleSort} className="px-7" />
                <SortableTh label="Categoría" sortKey="category" current={sortKey} dir={sortDir} onSort={toggleSort} className="px-4" />
                <th scope="col" className="px-4 py-4 font-bold">SKU</th>
                {canSeeCosts && <th scope="col" className="px-4 py-4 font-bold">Costo</th>}
                <SortableTh label="Precio" sortKey="price" current={sortKey} dir={sortDir} onSort={toggleSort} className="px-4" />
                <SortableTh label="Stock" sortKey="stock" current={sortKey} dir={sortDir} onSort={toggleSort} className="px-4" />
                <th scope="col" className="px-7 py-4 text-center font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {loading ? (
                <tr><td colSpan={6 + (canSeeCosts ? 1 : 0)}><CollectionLoading label="Cargando catálogo…" /></td></tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6 + (canSeeCosts ? 1 : 0)}>
                    {rows.length === 0 ? (
                      <CollectionEmpty icon={<IconBox className="h-8 w-8" />} title="Aún no hay nada en tu catálogo" description="Crea tu primer producto o servicio para empezar a vender." action={{ label: "Crear el primero", href: "/dashboard/inventory/product" }} />
                    ) : (
                      <CollectionFilteredEmpty title="Nada coincide con los filtros" action={{ label: "Limpiar filtros", onClick: clearFilters }} />
                    )}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const stockStatus = row.kind === "product" && tracksStock(row.product)
                    ? stockStatusOf(row.product.stock_level, row.product.minimum_stock)
                    : null;
                  const canOpen = row.kind === "product" ? canEdit : canEditServices;
                  const archived = isArchivedRow(row);
                  return (
                    <tr key={`${row.kind}-${row.id}`} className={`transition-colors group hover:bg-surface-container-lowest ${archived ? "opacity-60" : ""}`}>
                        <td className="px-7 py-3.5">
                          <div className="flex items-center gap-3.5">
                            <div className="relative w-10 h-10 rounded-xl bg-surface-container border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30 overflow-hidden shrink-0">
                              {row.imageUrl ? (
                                <Image
                                  src={row.imageUrl}
                                  alt={row.name}
                                  fill
                                  sizes="40px"
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : row.kind === "service" ? (
                                <IconScissors className="w-5 h-5 text-[#8b5cf6]" />
                              ) : (
                                <IconImagePlaceholder className="w-5 h-5" />
                              )}
                            </div>
                            <div>
                              {canOpen ? (
                                <Link href={editHref(row)} className="text-on-surface text-sm font-semibold hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                                  {row.name}
                                </Link>
                              ) : (
                                <span className="text-on-surface text-sm font-semibold">{row.name}</span>
                              )}
                              {archived && <ArchivedChip />}
                              {row.kind === "product" && productionOn && row.product.is_ingredient && <KindChip label="Insumo" tone="ingredient" />}
                              {row.kind === "product" && recipeKindByProduct.get(row.id) === "sale" && <KindChip label="Receta" tone="recipe" />}
                              {row.kind === "product" && recipeKindByProduct.get(row.id) === "production" && <KindChip label="Por lotes" tone="recipe" />}
                              {row.kind === "service" && servicesWithRecipe.has(row.id) && <KindChip label="Receta" tone="recipe" />}
                              {row.kind === "service" && (
                                <span className="block text-xs text-on-surface-variant">
                                  {row.service.duration_minutes} min
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-on-surface-variant text-sm">{row.categoryName ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          {row.kind === "product" ? (
                            <span className="inline-block bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-2.5 py-1 font-mono text-xs text-on-surface-variant">
                              {row.product.sku}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant/60">—</span>
                          )}
                        </td>
                        {canSeeCosts && (
                          <td className="px-4 py-3.5 text-on-surface-variant font-mono text-sm">
                            {row.kind === "product" ? (
                              <>
                                {fmtMoney(getUnitCost(row.product))}
                                {(row.product.units_per_package ?? 1) > 1 && (
                                  <span className="text-[11px] text-on-surface-variant/60 block font-sans">
                                    caja x{row.product.units_per_package} ({fmtMoney(row.product.purchase_price ?? 0)})
                                  </span>
                                )}
                              </>
                            ) : (
                              /* Un servicio no se compra a un proveedor: no hay
                                 costo unitario que mostrar, y un $ 0 sería una
                                 afirmación falsa sobre su margen. */
                              <span className="text-on-surface-variant/60">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-on-surface font-semibold text-sm">
                          {fmtMoney(row.price)}
                        </td>
                        <td className="px-4 py-3.5">
                          {stockStatus === null || row.kind !== "product" ? (
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-bold border ${SERVICE_CHIP}`}>
                              {row.kind === "service" ? "Servicio" : NO_STOCK_LABEL}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border ${STOCK_CHIP[stockStatus]}`}>
                              <span className={`w-2 h-2 rounded-full ${STOCK_DOT[stockStatus]}`} />
                              {stockLabelOf(row.product.stock_level, row.product.minimum_stock)}
                            </span>
                          )}
                        </td>
                        <td className="px-7 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {row.kind === "product" && (
                            <Link
                              href={movementsHref(row.id)}
                              className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              title="Ver movimientos"
                              aria-label={`Ver movimientos de ${row.name}`}
                            >
                              <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                                <path d="M3 12h4l3 8 4-16 3 8h4" />
                              </svg>
                            </Link>
                            )}
                            {canOpen && (
                            <Link
                              href={editHref(row)}
                              className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              title={row.kind === "product" ? "Editar producto" : "Editar servicio"}
                              aria-label={`Editar ${row.name}`}
                            >
                              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </Link>
                            )}
                            {canMoveStock && row.kind === "product" && (
                            <button
                              type="button"
                              onClick={() => { setAdjustProductId(row.id); setAdjustModalOpen(true); }}
                              className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Registrar movimiento"
                              aria-label={`Registrar movimiento de ${row.name}`}
                            >
                              <IconMoveHorizontal className="w-4 h-4" />
                            </button>
                            )}
                            {canArchive(row) && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                if (archived) {
                                  setRowActive(row, true);
                                } else {
                                  setConfirmArchive(row);
                                }
                              }}
                              className="w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-error-dim hover:bg-error-container/10 transition-colors"
                              title={archived ? "Activar" : "Archivar"}
                              aria-label={archived ? `Activar ${row.name}` : `Archivar ${row.name}`}
                            >
                              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                                <polyline points="21 8 21 21 3 21 3 8" />
                                <rect x="1" y="3" width="22" height="5" />
                                <line x1="10" y1="12" x2="14" y2="12" />
                              </svg>
                            </button>
                            )}
                          </div>
                        </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredRows.length > 0 && (
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={totalFilteredCount}
            startItem={pageStartItem}
            endItem={pageEndItem}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {confirmArchive && (
        <Modal
          open
          onClose={() => setConfirmArchive(null)}
          title={`Archivar ${confirmArchive.kind === "product" ? "Producto" : "Servicio"}`}
          icon={
            <div className="w-12 h-12 mx-auto rounded-full bg-error-container/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-error-dim" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
          }
          description={
            confirmArchive.kind === "product"
              ? "El producto se desactivará y no aparecerá en el catálogo activo ni en el POS. Puedes activarlo de nuevo después."
              : "El servicio se desactivará y no se podrá agendar ni cobrar. Puedes activarlo de nuevo después."
          }
          role="alertdialog"
          size="sm"
          placement="sheet"
          showCloseButton={false}
          className="text-center"
          bodyClassName="px-6 pb-6 pt-2"
        >
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmArchive(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    await setRowActive(confirmArchive, false);
                    setConfirmArchive(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-error-dim hover:bg-error text-white transition-colors"
                >
                  Archivar
                </button>
              </div>
        </Modal>
      )}

      {scannerOpen && (
        <BarcodeScannerModal
          title="Escanear producto"
          hint="Si el código no está en tu catálogo, se abre el alta con él cargado."
          onDetected={handleScannedCode}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {newProductBarcode !== null && (
        <ProductModal
          initialBarcode={newProductBarcode}
          onClose={() => setNewProductBarcode(null)}
          onCreated={() => {
            setNewProductBarcode(null);
            fetchInventory();
          }}
        />
      )}

      {canEdit && (
        <ImportWizard
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="productos"
          entity={PRODUCT_IMPORT}
          existing={existingKeys}
          templateFileName="plantilla-productos.xlsx"
          annotate={annotateImport}
          onImport={importProducts}
          previewKeys={["name", "sku", "price"]}
          note={
            <>
              Solo productos: los servicios se crean desde <strong>Producto / Servicio</strong>, no por importación. Si
              un producto ya existe (mismo SKU o código de barras), su stock no cambia: el stock se ajusta en{" "}
              <strong>Movimientos</strong>.
            </>
          }
        />
      )}

      {adjustModalOpen && (
        <StockAdjustmentModal
          preselectedProductId={adjustProductId}
          onClose={() => setAdjustModalOpen(false)}
          onSuccess={() => {
            setAdjustModalOpen(false);
            fetchInventory();
          }}
        />
      )}

    </div>
  );
}
