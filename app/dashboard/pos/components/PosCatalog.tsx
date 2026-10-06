import { useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { IconSearch, IconImagePlaceholder } from "@/app/assets/icons/DashboardIcons";
import type { CatalogItem } from "@/services/pos.service";
import { shouldSubmitIdleCode } from "./catalog-code";
import { useProfile } from "@/components/ProfileProvider";
import { formatMoney } from "@/lib/money";

const BARCODE_IDLE_MS = 250;
const SCANNER_KEY_GAP_MS = 80;
/** Ventana tras un envío automático en la que un Enter se toma como del lector. */
const SCANNER_TRAILING_ENTER_MS = 1000;
import { formatDuration } from "@/lib/duration";

/**
 * Lo que dice la tarjeta de un servicio donde un producto dice su stock: cuánto
 * dura. En el mostrador de una barbería "1 hora y media" decide si el turno
 * entra antes del siguiente cliente; "Servicio" no decía nada que la foto no
 * dijera ya.
 */
function serviceTag(item: CatalogItem): string {
  return formatDuration(item.duration_minutes) || "Servicio";
}

/**
 * Columnas de la grilla de productos (vista escritorio).
 *
 * Los breakpoints de Tailwind miden la VENTANA, pero esta grilla nunca la tiene
 * entera: el sidebar (w-64 = 256px), la factura (480px fijos desde lg) y el
 * padding del contenedor (pl-10 + pr-6 + pr-2 = 72px) se llevan 808px ANTES de
 * que empiece el catálogo. Contando columnas por ventana, a 1450px pedía 5 y el
 * precio se salía de la tarjeta e invadía la de al lado.
 *
 * Estos cortes se calcularon sobre el ancho REAL (ventana - 808 - gaps), para
 * que la caja de texto nunca baje de ~106px — lo que mide un precio de 7 cifras
 * a `text-base` bold:
 *
 *   1024 → 1 (192px)   1080 → 2 (106px)   1240 → 3 (109px)
 *   1400 → 4 (124px)   1750 → 5 (151px)   2100 → 6 (178px)
 *
 * Son `min-[…]` propios porque los de Tailwind no sirven acá: `xl` abarca
 * 1280-1535 y a 1280 no entran 4 columnas mientras que a 1450 sí.
 *
 * NO MEZCLAR con variantes con nombre (`lg:`, `xl:`) para las columnas.
 * Tailwind v4 emite los `min-[…]` arbitrarios ANTES que los nombrados, así que
 * a 1451px matcheaban los dos y ganaba el último del archivo: un `lg:grid-cols-1`
 * pisaba a `min-[1400px]:grid-cols-4` y dejaba todo en una sola columna. Por eso
 * la base es `grid-cols-1` sin variante y todos los cortes son arbitrarios: así
 * se ordenan entre ellos por ancho y el más específico gana. (La grilla vive
 * dentro de un `hidden lg:block`, así que abajo de 1024 no se dibuja nunca.)
 *
 * Si cambia el ancho de la factura o del sidebar, estos números cambian.
 */
const CATALOG_GRID_COLS =
  "grid gap-3 xl:gap-4 grid-cols-1 " +
  "min-[1080px]:grid-cols-2 min-[1240px]:grid-cols-3 min-[1400px]:grid-cols-4 " +
  "min-[1750px]:grid-cols-5 min-[2100px]:grid-cols-6";


interface PosCatalogProps {
  search: string;
  setSearch: (v: string) => void;
  activeCategory: string;
  setActiveCategory: (v: string) => void;
  categories: string[];
  filtered: CatalogItem[];
  catalog: CatalogItem[];
  viewMode: "grid" | "list";
  setViewMode: (v: "grid" | "list") => void;
  loading: boolean;
  error: string | null;
  cartQty: Map<string, number>;
  allowOversell: boolean;
  isWorker: boolean;
  requireActiveShift: boolean;
  currentShift: { opened_at: string } | null;
  addToCart: (item: CatalogItem) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  lineKey: (id: string) => string;
  onOpenScanner: () => void;
  onSubmitCode: (code: string) => boolean;
  /**
   * Enter con el buscador vacío: abre el cobro. Es lo que permite vender solo
   * con teclado y escáner, sin soltar el lector para ir al mouse.
   */
  onSubmitEmpty?: () => boolean;
  /** Ref del buscador, para que la página le devuelva el foco. */
  searchRef?: React.RefObject<HTMLInputElement | null>;
  onOpenShift: () => void;
  onOpenWithdrawal: () => void;
  openCloseShift: () => void;
  /** Franja entre la barra de búsqueda y las categorías (citas de hoy). */
  topSlot?: React.ReactNode;
}

export function PosCatalog({
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  categories,
  filtered,
  catalog,
  viewMode,
  setViewMode,
  loading,
  error,
  cartQty,
  allowOversell,
  isWorker,
  requireActiveShift,
  currentShift,
  addToCart,
  increment,
  decrement,
  lineKey,
  onOpenScanner,
  onSubmitCode,
  onSubmitEmpty,
  searchRef: externalSearchRef,
  onOpenShift,
  onOpenWithdrawal,
  openCloseShift,
  topSlot,
}: PosCatalogProps) {
  const salesBlocked = isWorker && requireActiveShift && !currentShift;
  const router = useRouter();
  const profile = useProfile();
  /**
   * A dónde lleva el CTA del catálogo vacío (B2). Un negocio que solo vende
   * servicios (sin inventario) arranca en la pestaña Servicio del formulario.
   */
  const firstItemHref =
    profile?.modules?.services && !profile?.modules?.inventory
      ? "/dashboard/inventory/product?type=servicio&from=/dashboard/pos"
      : "/dashboard/inventory/product?from=/dashboard/pos";
  /** Un empleado sin permiso de catálogo vería el formulario rechazado. */
  const canCreateItems =
    !isWorker ||
    Boolean(profile?.workerPermissions?.inventory_edit || profile?.workerPermissions?.services);
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = externalSearchRef ?? internalSearchRef;
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSubmittedRef = useRef<string | null>(null);
  /**
   * Cuándo se envió solo el último código (sin Enter, por inactividad). Un
   * lector que manda el Enter tarde encuentra el buscador ya vacío: ese Enter
   * es la cola de la lectura, no el cajero pidiendo cobrar.
   */
  const lastAutoSubmitAtRef = useRef(0);
  const lastInputRef = useRef({ value: "", at: 0, rapidKeys: 0 });

  useEffect(() => {
    searchRef.current?.focus();
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [searchRef]);

  const cancelPendingScan = () => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 px-6 lg:pl-10 lg:pr-6 lg:border-r border-outline-variant/10">

      <div className="flex flex-wrap items-center gap-2 lg:gap-3 mb-4 lg:mb-6 pt-4">
        <div className="relative w-full lg:w-auto lg:flex-1 min-w-0 order-1">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-primary rounded-l-2xl flex items-center justify-center">
            <IconSearch className="w-5 h-5 text-white" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              const now = performance.now();
              const previous = lastInputRef.current;
              const appended = value.startsWith(previous.value) ? value.length - previous.value.length : 0;
              const rapidKeys = appended > 1
                ? 3
                : appended === 1 && now - previous.at <= SCANNER_KEY_GAP_MS
                  ? previous.rapidKeys + 1
                  : 0;
              lastInputRef.current = { value, at: now, rapidKeys };
              cancelPendingScan();
              lastAutoSubmittedRef.current = null;
              setSearch(value);
              if (shouldSubmitIdleCode(catalog, value, rapidKeys)) {
                scanTimerRef.current = setTimeout(() => {
                  scanTimerRef.current = null;
                  if (searchRef.current?.value !== value) return;
                  if (onSubmitCode(value)) {
                    lastAutoSubmittedRef.current = value;
                    lastAutoSubmitAtRef.current = performance.now();
                    lastInputRef.current = { value: "", at: 0, rapidKeys: 0 };
                    setSearch("");
                  }
                }, BARCODE_IDLE_MS);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                cancelPendingScan();
                const value = e.currentTarget.value;
                if (lastAutoSubmittedRef.current === value) return;
                if (!value.trim()) {
                  // Buscador vacío: Enter cobra. Salvo que sea la cola de una
                  // lectura que ya se envió sola (ver `lastAutoSubmitAtRef`).
                  if (performance.now() - lastAutoSubmitAtRef.current < SCANNER_TRAILING_ENTER_MS) return;
                  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
                  // Se suelta el foco al abrir el cobro: si quedara acá, el
                  // Enter siguiente (el que confirma) moriría en este campo.
                  // Al cerrar el modal la página lo devuelve.
                  if (onSubmitEmpty?.()) e.currentTarget.blur();
                  return;
                }
                if (onSubmitCode(value)) {
                  setSearch("");
                }
              }
            }}
            placeholder="Buscar o escanear código"
            ref={searchRef}
            className="w-full h-12 bg-surface-container-lowest rounded-2xl pl-14 pr-14 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant border border-outline-variant/30 shadow-sm"
          />
          <button
            type="button"
            disabled={salesBlocked}
            onClick={onOpenScanner}
            aria-label="Escanear código de barras"
            title="Escanear código de barras"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
            </svg>
          </button>
        </div>

        <div className="order-2 flex items-center gap-2 lg:gap-3 w-full lg:w-auto overflow-x-auto scrollbar-hide">
          {isWorker && currentShift && (
            <>
              <button
                onClick={onOpenWithdrawal}
                className="h-12 px-4 rounded-2xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors shrink-0"
                title="Registrar un retiro de efectivo de la caja"
              >
                Retiro
              </button>
              <button
                onClick={openCloseShift}
                className="h-12 px-4 rounded-2xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors shrink-0 flex items-center gap-2"
                title={`Turno abierto desde ${new Date(currentShift.opened_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`}
              >
                <span className="w-2 h-2 rounded-full bg-accent-fin animate-pulse" />
                Cerrar turno
              </button>
            </>
          )}
          <button
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            className="hidden lg:flex w-12 h-12 rounded-2xl border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors items-center justify-center shrink-0"
            title={viewMode === "grid" ? "Vista lista" : "Vista cuadr\u00edcula"}
          >
            {viewMode === "grid" ? (
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            ) : (
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            )}
          </button>
          <button
            onClick={() => router.push("/dashboard/inventory/product?from=/dashboard/pos")}
            aria-label="Nuevo producto"
            title="Nuevo producto"
            className="shrink-0 whitespace-nowrap w-12 h-12 lg:w-auto lg:px-5 ml-auto lg:ml-0 rounded-2xl bg-transparent border border-primary/50 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
          >
            <span className="hidden lg:inline">Nuevo producto</span>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5 lg:w-4 lg:h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/*
        Sin turno el empleado puede armar el carrito pero NO cobrar
        (`create_sale` lo rechaza). Antes eso se decía con un botón gris igual a
        los demás y se descubría recién al intentar cobrar, con el cliente
        esperando. Ahora se dice antes, una sola vez y con la acción al lado.
      */}
      {isWorker && !currentShift && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface">La caja está cerrada</p>
            <p className="text-xs text-on-surface-variant">
              {requireActiveShift
                ? "Abre tu turno con la base de caja para habilitar los productos, servicios y la venta."
                : "Puedes cobrar sin turno. Abre la caja si quieres llevar el arqueo de tus ventas."}
            </p>
          </div>
          <button
            onClick={onOpenShift}
            className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim"
          >
            Abrir turno
          </button>
        </div>
      )}

      {topSlot}

      <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-medium transition-colors ${
              cat === activeCategory
                ? "bg-primary text-on-primary"
                : "bg-surface-container border border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 lg:overflow-y-auto pb-6 pr-2">
        {error && (
          <div className="mb-4 rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-sm text-on-surface-variant py-12">Cargando catálogo…</p>
        ) : catalog.length === 0 ? (
          <div className="mx-auto max-w-sm py-12 text-center flex flex-col items-center">
            <div className="w-14 h-14 mb-4 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-7 h-7" aria-hidden="true">
                <path d="M21 8l-9-5-9 5 9 5 9-5z" />
                <path d="M3 8v8l9 5 9-5V8" />
                <path d="M12 13v8" />
              </svg>
            </div>
            <p className="text-base font-bold text-on-surface">Tu catálogo está vacío</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Carga lo que vendes para empezar a cobrar desde aquí.
            </p>
            {canCreateItems ? (
              <button
                type="button"
                onClick={() => router.push(firstItemHref)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:bg-primary-dim transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
                Agregar mi primer producto o servicio
              </button>
            ) : (
              <p className="mt-4 text-xs text-on-surface-variant">
                Pídele al dueño del negocio que cargue los productos y servicios.
              </p>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-on-surface-variant py-12">
            Ningún ítem coincide con el filtro.
          </p>
        ) : (
          <>
            <ul className="lg:hidden space-y-1.5">
              {filtered.map((item) => {
                const qty = cartQty.get(item.id) ?? 0;
                // El que manda es `stock_level`, no `kind`: un servicio puede
                // venir de `services` o ser un producto con unidad "Servicio".
                // En los dos casos llega en null y no hay stock que mostrar.
                const stock = item.stock_level;
                const outOfStock = stock != null && stock <= 0;
                const blocked = salesBlocked || (!allowOversell && outOfStock);
                const atStockCap = !allowOversell && stock != null && qty >= stock;
                return (
                  <li key={item.id}>
                    <div
                      className={`flex items-center gap-2.5 p-2 rounded-xl border transition-colors ${
                        qty > 0
                          ? "border-primary bg-primary/5"
                          : stock == null
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : "border-outline-variant/10 bg-surface-container"
                      } ${salesBlocked || (blocked && qty === 0) ? "opacity-50" : ""}`}
                    >
                      <div className="w-12 h-12 shrink-0 rounded-lg bg-surface-container-lowest flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
                          <Image src={item.image_url} alt="" width={48} height={48} unoptimized className="w-full h-full object-cover" />
                        ) : (
                          <IconImagePlaceholder className="w-5 h-5 text-on-surface-variant/30" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-on-surface leading-snug line-clamp-2">
                          {item.name}
                        </p>
                        <p className="text-[15px] font-bold text-on-surface tabular-nums">
                          {formatMoney(item.price)}
                        </p>
                        <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                          {stock == null ? (
                            <span className="text-emerald-500">{serviceTag(item)}</span>
                          ) : outOfStock ? (
                            <span className={allowOversell ? "text-amber-600" : "text-error"}>Sin stock</span>
                          ) : (
                            `Stock: ${stock}`
                          )}
                        </p>
                      </div>

                      {qty > 0 ? (
                        <div className="flex items-center gap-1 shrink-0 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                          <button
                            disabled={salesBlocked}
                            onClick={() => decrement(lineKey(item.id))}
                            aria-label={`Quitar una unidad de ${item.name}`}
                            className="w-10 h-10 flex items-center justify-center text-lg text-on-surface-variant active:bg-on-surface/10 rounded-l-xl"
                          >
                            &minus;
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-on-surface tabular-nums">
                            {qty}
                          </span>
                          <button
                            onClick={() => increment(lineKey(item.id))}
                            disabled={salesBlocked || atStockCap}
                            aria-label={`Agregar una unidad de ${item.name}`}
                            className="w-10 h-10 flex items-center justify-center text-lg text-on-surface-variant active:bg-on-surface/10 rounded-r-xl disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          disabled={blocked}
                          aria-label={`Agregar ${item.name} a la venta`}
                          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-primary text-white active:bg-primary-dim transition-colors disabled:opacity-30"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" className="w-5 h-5">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden lg:block">
              {viewMode === "grid" ? (
                <div className={CATALOG_GRID_COLS}>
                  {filtered.map((item) => {
                    // null = no lleva inventario (servicio). Ver `CatalogItem`.
                    const stock = item.stock_level;
                    const outOfStock = stock != null && stock <= 0;
                    // `min-w-0 overflow-hidden` en la tarjeta: un <button> es
                    // ítem de grilla con min-width:auto, así que sin eso el
                    // contenido manda sobre el ancho de la columna en vez de al
                    // revés — y como los botones no recortan, el precio
                    // terminaba dibujado encima de la tarjeta vecina.
                    return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addToCart(item)}
                      disabled={salesBlocked || (!allowOversell && outOfStock)}
                      className={`text-left rounded-2xl p-3 border flex flex-col min-w-0 overflow-hidden transition-colors group shadow-sm relative disabled:opacity-50 disabled:cursor-not-allowed ${
                        stock == null
                          ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-400/40 disabled:hover:border-emerald-500/20"
                          : "bg-surface-container border-outline-variant/10 hover:border-primary/30 disabled:hover:border-outline-variant/10"
                      }`}
                    >
                      {outOfStock && (
                        <span
                          className={`absolute top-2 right-2 z-10 text-[10px] font-bold px-2 py-1 rounded-md border ${
                            allowOversell
                              ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                              : "bg-error/10 text-error-dim border-error/20"
                          }`}
                        >
                          Sin stock
                        </span>
                      )}
                      <div className="aspect-square rounded-xl bg-surface-container-lowest flex items-center justify-center mb-3 group-hover:bg-surface-container-low transition-colors overflow-hidden">
                        {item.image_url ? (
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            width={160}
                            height={160}
                            unoptimized
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <IconImagePlaceholder className="w-8 h-8 text-on-surface-variant/30" />
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                        {stock == null ? "Servicio" : `SKU: ${item.sku}`}
                      </p>
                      {/* `break-words`: line-clamp recorta de alto, no de ancho.
                          Una palabra sola y larga (INALAMBRICO) se salía igual. */}
                      <h3 className="text-sm font-medium text-on-surface mb-2 line-clamp-2 leading-tight flex-1 break-words group-hover:text-primary transition-colors">
                        {item.name}
                      </h3>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 mt-auto w-full min-w-0">
                        {/* El precio es un token sin puntos de corte: si no cabe
                            no se parte, se sale. `min-w-0 truncate` es el último
                            recurso — puntos suspensivos DENTRO de su tarjeta es
                            peor que el precio completo, pero mucho mejor que
                            pisar el producto de al lado. */}
                        <span className="text-sm sm:text-base text-on-surface font-bold tabular-nums min-w-0 truncate">
                          {formatMoney(item.price)}
                        </span>
                        {stock == null ? (
                          <span className="text-[10px] font-bold text-on-surface-variant shrink-0">
                            {serviceTag(item)}
                          </span>
                        ) : (
                          <span
                            className={`text-[10px] font-bold shrink-0 ${
                              stock <= 0
                                ? "text-amber-600"
                                : stock <= 5
                                  ? "text-amber-500"
                                  : "text-on-surface-variant"
                            }`}
                          >
                            Stock: {stock}
                          </span>
                        )}
                      </div>
                    </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filtered.map((item) => {
                    // null = no lleva inventario (servicio). Ver `CatalogItem`.
                    const stock = item.stock_level;
                    const outOfStock = stock != null && stock <= 0;
                    return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      disabled={salesBlocked || (!allowOversell && outOfStock)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                        stock == null
                          ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-400/40"
                          : "bg-surface-container border-outline-variant/10 hover:bg-surface-container-high"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center overflow-hidden shrink-0">
                        {item.image_url ? (
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            width={36}
                            height={36}
                            unoptimized
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-3 h-3 rounded bg-outline-variant/20" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider truncate">
                          {stock == null ? serviceTag(item) : item.sku}
                        </p>
                        <h3 className="text-xs font-medium text-on-surface truncate">{item.name}</h3>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-on-surface">{formatMoney(item.price)}</p>
                        {stock != null && (
                          <span
                            className={`text-[9px] font-bold ${
                              stock <= 0
                                ? "text-amber-600"
                                : stock <= 5
                                  ? "text-amber-500"
                                  : "text-on-surface-variant"
                            }`}
                          >
                            {stock} uds.
                          </span>
                        )}
                      </div>
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
