"use client";

import { useState, useEffect, Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  IconSearch,
  IconBox,
} from "@/app/assets/icons/DashboardIcons";
import { useInventoryStore } from "@/stores/inventory.store";
import type { NewCategoryInput } from "@/services/inventory.service";
import { stockStatusOf, stockLabelOf, STOCK_CHIP, STOCK_DOT } from "@/lib/stock";
import { useProfile } from "@/components/ProfileProvider";
import { can } from "@/lib/permissions";
import { Select } from "@/components/ui/Select";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { ProductModal } from "@/components/ProductModal";
import { notifyError } from "@/lib/notifications";


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

const EMPTY_CATEGORY: NewCategoryInput = { name: "", description: "" };

export default function InventoryPage() {
  // Espejo de la RLS: acá se esconde lo que la persona no puede usar, pero
  // quien corta de verdad es la base (policies, trigger y RPC).
  const profile = useProfile();
  const canSeeCosts = can(profile, "inventory_costs");
  const canEdit = can(profile, "inventory_edit");
  const canMoveStock = can(profile, "inventory_stock");

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

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const [newCategory, setNewCategory] = useState<NewCategoryInput>(EMPTY_CATEGORY);

  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addCategory = useInventoryStore((s) => s.addCategory);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  /** Código escaneado que no existe en el catálogo: abre el alta con él puesto. */
  const [newProductBarcode, setNewProductBarcode] = useState<string | null>(null);

  /**
   * Un escaneo desde el inventario responde una de dos cosas: "acá está" o
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
      return;
    }

    if (!canEdit) {
      setSearchQuery(value);
      notifyError("Producto no encontrado", `Ningún producto tiene el código ${value}.`);
      return;
    }

    setNewProductBarcode(value);
  };

  const filteredProducts = products.filter((p) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      // También por código de barras: lo que llega del escáner cae en este mismo
      // campo, y ese código no es el SKU.
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q) &&
        !(p.barcode ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    if (categoryFilter && p.categories?.name !== categoryFilter) return false;
    if (stockFilter === "Agotado" && p.stock_level !== 0) return false;
    if (stockFilter === "Stock Bajo" && (p.stock_level <= 0 || p.stock_level > 5)) return false;
    if (stockFilter === "Óptimo" && p.stock_level <= 5) return false;
    return true;
  });

  const parentProducts = filteredProducts.filter((p) => !p.parent_product_id);
  const productGroups = parentProducts.map((parent) => {
    const variants = (parent.variants ?? []).filter((v) => {
      if (stockFilter === "Agotado" && v.stock_level !== 0) return false;
      if (stockFilter === "Stock Bajo" && (v.stock_level <= 0 || v.stock_level > 5)) return false;
      if (stockFilter === "Óptimo" && v.stock_level <= 5) return false;
      return true;
    });
    return { parent, variants };
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
        {/* Móvil: secundarios a dos columnas y el primario debajo, a ancho completo.
            Cada acción se muestra solo si la persona puede ejecutarla: un botón
            que siempre falla es peor que un botón ausente. */}
        {(canMoveStock || canEdit) && (
        <div className="grid grid-cols-2 gap-3 w-full lg:flex lg:w-auto">
          {canMoveStock && (
          <Link
            href="/dashboard/inventory/movements"
            className="h-11 whitespace-nowrap bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-3 lg:px-5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Movimientos
          </Link>
          )}
          {canEdit && (
          <>
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="h-11 whitespace-nowrap bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm font-semibold px-3 lg:px-5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva Categor&iacute;a
          </button>
          <Link
            href="/dashboard/inventory/product"
            className={`h-11 ${canMoveStock ? "col-span-2" : ""} lg:col-span-1 whitespace-nowrap bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold px-5 rounded-xl shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_25px_rgba(96,99,238,0.35)]`}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo Producto
          </Link>
          </>
          )}
        </div>
        )}
      </div>

      {/* Stats. La valorización del inventario es cifra financiera del negocio:
          solo el dueño, ni siquiera un empleado con `inventory_costs`. */}
      <div className={`grid grid-cols-1 gap-6 ${canSeeInventoryValue ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Total Productos</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{products.length}</h3>
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
              ${products.reduce((sum, p) => sum + (p.purchase_price ?? 0) * p.stock_level, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-14 h-14 shrink-0 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconLayers className="w-7 h-7" />
          </div>
        </div>
        )}

        <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex justify-between items-center group hover:border-outline-variant/20 transition-colors">
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1.5">Stock Bajo</p>
            <h3 className="text-4xl font-bold text-on-surface tracking-tight">{products.filter(p => p.stock_level > 0 && p.stock_level <= 5).length}</h3>
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
                onChange={e => setSearchQuery(e.target.value)}
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
              className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-colors"
            >
              <IconScanLine className="w-5 h-5" />
            </button>
          </div>
          {/* Etiquetas cortas en móvil: "Todas las Categorías" se cortaba a
              "Todas las C" y dejaba de decir qué filtra. */}
          <div className="flex w-full md:w-auto gap-2 lg:gap-3">
            <Select
              aria-label="Filtrar por categoría"
              containerClassName="flex-1 md:w-44"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
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
              onChange={e => setStockFilter(e.target.value)}
            >
              <option value="">Stock</option>
              <option value="Óptimo">&Oacute;ptimo</option>
              <option value="Stock Bajo">Stock Bajo</option>
              <option value="Agotado">Agotado</option>
            </Select>
            <button
              aria-label="Más filtros"
              className="hidden lg:flex w-11 h-11 items-center justify-center rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0"
            >
              <IconFilter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Móvil: la tabla de 7 columnas no entra en un teléfono, así que cada
            producto se dibuja como tarjeta con sus variantes anidadas debajo.
            El fondo alterno es lo que separa un producto del siguiente: la
            ficha ocupa tres líneas y una divisoria de 1px no da la señal. */}
        <ul className="lg:hidden divide-y divide-outline-variant/20">
          {productGroups.length === 0 ? (
            <li className="p-10 text-center text-sm text-on-surface-variant">
              {products.length === 0 ? (
                <span className="flex flex-col items-center gap-3">
                  <IconBox className="w-10 h-10 text-on-surface-variant/30" />
                  <span className="font-medium">No hay productos todav&iacute;a.</span>
                  <Link
                    href="/dashboard/inventory/product"
                    className="text-primary hover:text-primary-dim font-semibold underline underline-offset-2"
                  >
                    Crear tu primer producto
                  </Link>
                </span>
              ) : (
                "Ningún producto coincide con los filtros."
              )}
            </li>
          ) : (
            productGroups.map(({ parent: item, variants }) => {
              const status = stockStatusOf(item.stock_level);
              // El bandeado va en el <li> para que cada producto arrastre sus
              // variantes: el bloque entero se lee como una sola unidad.
              // La tarjeta entera es el objetivo táctil, no un ícono de 16px en
              // la esquina: en el teléfono se toca con el pulgar. Sin permiso de
              // edición se dibuja igual pero no navega: un enlace que lleva a un
              // formulario que no se puede guardar es peor que no tenerlo.
              const cardBody = (
                <>
                  <div className="flex items-start gap-3">
                      <div className="relative w-11 h-11 shrink-0 rounded-xl bg-surface-container-lowest border border-outline-variant/10 flex items-center justify-center text-on-surface-variant/30 overflow-hidden">
                        {item.image_url ? (
                          <Image src={item.image_url} alt="" fill sizes="44px" unoptimized className="object-cover" />
                        ) : (
                          <IconImagePlaceholder className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-snug font-semibold text-on-surface break-words">
                          {item.name}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                          <span className="font-mono">{item.sku}</span>
                          {item.categories?.name ? ` · ${item.categories.name}` : ""}
                        </p>
                      </div>
                      {/* El precio de venta acompaña al nombre; el costo baja a
                          la línea del stock. Así lo primario no compite con lo
                          secundario y el nombre gana el ancho que necesita. */}
                      <p className="shrink-0 text-base font-bold text-on-surface tabular-nums leading-snug">
                        ${item.price.toFixed(2)}
                      </p>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${STOCK_CHIP[status]}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${STOCK_DOT[status]}`} />
                        {stockLabelOf(item.stock_level)}
                      </span>
                      {canSeeCosts && (
                        <span className="text-[11px] text-on-surface-variant/70 tabular-nums shrink-0">
                          costo ${(item.purchase_price ?? 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                </>
              );

              return (
                <li key={item.id} className="even:bg-on-surface/[0.05]">
                  {canEdit ? (
                    <Link
                      href={`/dashboard/inventory/product?id=${item.id}`}
                      className="block px-4 py-3.5 active:bg-on-surface/10 transition-colors"
                    >
                      {cardBody}
                    </Link>
                  ) : (
                    <div className="px-4 py-3.5">{cardBody}</div>
                  )}

                  {variants.length > 0 && (
                    <ul className="ml-8 mr-4 pb-2 border-l-2 border-outline-variant/20">
                      {variants.map((v) => {
                        const variantBody = (
                          <>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs text-on-surface truncate">{v.name}</span>
                              <span className="block font-mono text-[10px] text-on-surface-variant">{v.sku}</span>
                            </span>
                            <span className="text-xs font-semibold text-on-surface tabular-nums shrink-0">
                              ${v.price.toFixed(2)}
                            </span>
                            <span
                              className={`text-[10px] font-bold shrink-0 tabular-nums ${
                                v.stock_level <= 0
                                  ? "text-error"
                                  : v.stock_level <= 5
                                    ? "text-[#f59e0b]"
                                    : "text-on-surface-variant"
                              }`}
                            >
                              {v.stock_level} uds.
                            </span>
                          </>
                        );
                        return (
                          <li key={v.id}>
                            {canEdit ? (
                              <Link
                                href={`/dashboard/inventory/product?id=${v.id}`}
                                className="flex items-center gap-2 pl-3 pr-1 py-2 active:bg-on-surface/10 transition-colors"
                              >
                                {variantBody}
                              </Link>
                            ) : (
                              <div className="flex items-center gap-2 pl-3 pr-1 py-2">{variantBody}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
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
                <th className="px-7 py-4 font-bold">Producto</th>
                <th className="px-4 py-4 font-bold">Categor&iacute;a</th>
                <th className="px-4 py-4 font-bold">SKU</th>
                {canSeeCosts && <th className="px-4 py-4 font-bold">Costo</th>}
                <th className="px-4 py-4 font-bold">Precio</th>
                <th className="px-4 py-4 font-bold">Stock</th>
                {canEdit && <th className="px-7 py-4 text-center font-bold">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {productGroups.length === 0 ? (
                <tr>
                  <td colSpan={5 + (canSeeCosts ? 1 : 0) + (canEdit ? 1 : 0)} className="p-16 text-center text-on-surface-variant text-sm">
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
                productGroups.map((group) => {
                  const { parent: item, variants } = group;
                  const stockStatus = stockStatusOf(item.stock_level);
                  const stockLabel = stockLabelOf(item.stock_level);
                  return (
                    <Fragment key={item.id}>
                      <tr className="hover:bg-surface-container-lowest transition-colors group">
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
                        {canSeeCosts && <td className="px-4 py-4 text-on-surface-variant font-mono text-sm">${(item.purchase_price ?? 0).toFixed(2)}</td>}
                        <td className="px-4 py-4 text-on-surface font-semibold text-sm">${item.price.toFixed(2)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border ${STOCK_CHIP[stockStatus]}`}>
                            <span className={`w-2 h-2 rounded-full ${STOCK_DOT[stockStatus]}`} />
                            {stockLabel}
                          </span>
                        </td>
                        {canEdit && (
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
                          </div>
                        </td>
                        )}
                      </tr>
                      {variants.map((v) => {
                        const vStockStatus = stockStatusOf(v.stock_level);
                        const vStockLabel = stockLabelOf(v.stock_level);
                        return (
                          <tr key={v.id} className="hover:bg-surface-container-lowest transition-colors group bg-surface-container-low/30">
                            <td className="px-7 py-3 pl-14">
                              <div className="flex items-center gap-3">
                                <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="w-3.5 h-3.5 text-on-surface-variant/40 shrink-0">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                                <span className="text-sm text-on-surface">{v.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-on-surface-variant">{v.categories?.name ?? "\u2014"}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-2 py-0.5 font-mono text-[11px] text-on-surface-variant">
                                {v.sku}
                              </span>
                            </td>
                            {canSeeCosts && <td className="px-4 py-3 text-on-surface-variant font-mono text-xs">${(v.purchase_price ?? 0).toFixed(2)}</td>}
                            <td className="px-4 py-3 text-on-surface font-semibold text-xs">${v.price.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${STOCK_CHIP[vStockStatus]}`}>
                                {vStockLabel}
                              </span>
                            </td>
                            {canEdit && (
                            <td className="px-7 py-3 text-center">
                              <Link
                                href={`/dashboard/inventory/product?id=${v.id}`}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Editar variante"
                              >
                                <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </Link>
                            </td>
                            )}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        {productGroups.length > 0 && (
        <div className="px-7 py-4 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest">
          <p className="text-xs text-on-surface-variant font-medium">
            Mostrando {productGroups.reduce((acc, g) => acc + 1 + g.variants.length, 0)} de {products.length} registro{products.length !== 1 ? "s" : ""}
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

    </div>
  );
}
