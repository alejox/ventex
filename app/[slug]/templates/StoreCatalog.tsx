"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { esImagenAjena } from "@/lib/remoteImage";
import { filterCatalog, restoreOrder } from "@/lib/store-catalog";
import {
  MAX_LINE_QTY,
  addToOrder,
  buildOrderMessage,
  orderCount,
  orderTotal,
  orderWhatsappLink,
  removeFromOrder,
  setOrderQty,
  type OrderLine,
} from "@/lib/site-order";
import type { PublicProduct, PublicSite } from "@/services/public-site.types";
import { formatCOP } from "./theme";
import styles from "./StoreCatalog.module.css";

/*
 * El pedido vive en el navegador del visitante, guardado por slug para que
 * recargar la página o volver más tarde no lo borre. Es un almacén externo
 * leído con `useSyncExternalStore`: el servidor y la hidratación ven un pedido
 * vacío (`getServerSnapshot`) y React pasa al guardado apenas hidrata, sin
 * desajuste y sin un efecto que haga `setState`.
 *
 * Toda lectura/escritura de `localStorage` va en try/catch: en una ventana
 * privada o con el almacenamiento bloqueado tira, y entonces el pedido sigue
 * funcionando en memoria mientras dure la pestaña.
 */
const STORAGE_PREFIX = "ventex:pedido:";
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
let storageBroken = false;

function readStored(slug: string): string {
  if (!storageBroken) {
    try {
      return window.localStorage.getItem(STORAGE_PREFIX + slug) ?? "";
    } catch {
      storageBroken = true;
    }
  }
  return memory.get(slug) ?? "";
}

function writeStored(slug: string, value: string) {
  memory.set(slug, value);
  if (!storageBroken) {
    try {
      if (value) window.localStorage.setItem(STORAGE_PREFIX + slug, value);
      else window.localStorage.removeItem(STORAGE_PREFIX + slug);
    } catch {
      storageBroken = true;
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Otra pestaña con el mismo sitio abierto: el pedido es uno solo.
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function parseOrder(raw: string, products: readonly PublicProduct[]): OrderLine[] {
  if (!raw) return [];
  try {
    return restoreOrder(JSON.parse(raw), products);
  } catch {
    return [];
  }
}

const serverSnapshot = () => "";

function units(count: number): string {
  return count === 1 ? "1 producto" : `${count} productos`;
}

export interface StoreCatalogProps {
  site: PublicSite;
  /**
   * `default`: la sección de productos dentro de cualquier plantilla.
   * `mercado`: además arma la cabecera con el buscador, porque ese buscador y
   * el del catálogo son el mismo estado.
   * `organico`: la misma sección que `default` (buscador dentro del catálogo),
   * con pestañas en píldora centradas y tarjetas crema muy redondeadas.
   * `despensa`: como `mercado` arma la cabecera con el buscador, y además una
   * barra oscura de categorías y una columna lateral de categorías junto a la
   * grilla; las tarjetas llevan un botón "Agregar" a todo el ancho.
   */
  variant?: "mercado" | "organico" | "despensa" | "default";
  /** Título de la sección (lo arma el servidor). */
  heading?: ReactNode;
  /** Solo `mercado`/`despensa`: piezas del servidor alrededor del buscador. */
  topBar?: ReactNode;
  brand?: ReactNode;
  hero?: ReactNode;
  /** Solo `despensa`: lo que va a la derecha de la barra de categorías. */
  navEnd?: ReactNode;
  /** Solo `mercado`/`despensa`: false = la sección de productos está oculta o vacía. */
  showCatalog?: boolean;
}

export function StoreCatalog({ site, variant = "default", heading, topBar, brand, hero, navEnd, showCatalog = true }: StoreCatalogProps) {
  const slug = site.slug;
  const products = site.products;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const searchId = useId();

  const stored = useSyncExternalStore(subscribe, () => readStored(slug), serverSnapshot);
  const order = useMemo(() => parseOrder(stored, products), [stored, products]);
  const visible = useMemo(() => filterCatalog(products, { categoryId, query }), [products, categoryId, query]);

  // Sin un WhatsApp usable el catálogo se muestra igual, pero no se puede pedir.
  const canOrder = orderWhatsappLink(site.whatsapp, "") !== null;
  const count = orderCount(order);
  const total = orderTotal(order);
  const link = order.length
    ? orderWhatsappLink(site.whatsapp, buildOrderMessage({ businessName: site.businessName, lines: order, formatMoney: formatCOP, customerName, notes }))
    : null;

  /** Cada cambio parte de lo guardado, no del render: dos clics seguidos no se pisan. */
  function update(change: (current: OrderLine[]) => OrderLine[]) {
    const next = change(parseOrder(readStored(slug), products));
    writeStored(slug, next.length ? JSON.stringify(next) : "");
  }

  const qtyOf = (productId: string) => order.find((line) => line.productId === productId)?.qty ?? 0;
  const openOrder = () => dialogRef.current?.showModal();
  const closeOrder = () => dialogRef.current?.close();
  const isMercado = variant === "mercado";
  const isDespensa = variant === "despensa";
  const goToCatalog = () => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const search = (
    <input
      id={searchId}
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Buscar productos…"
      aria-label="Buscar productos"
      className={styles.search}
      autoComplete="off"
    />
  );

  const tabs = site.categories.length ? (
    <div className={styles.tabs} role="group" aria-label="Categorías">
      {[{ id: null, name: "Todos" }, ...site.categories].map((category) => (
        <button
          key={category.id ?? "todos"}
          type="button"
          aria-pressed={categoryId === category.id}
          onClick={() => setCategoryId(category.id)}
          className={styles.tab}
        >
          {category.name}
        </button>
      ))}
    </div>
  ) : null;

  const grid = visible.length ? (
    <ul className={styles.grid}>
      {visible.map((product) => {
        const qty = qtyOf(product.id);
        return (
          <li key={product.id} className={`${styles.card} ${product.inStock ? "" : styles.soldOut}`}>
            <div className={styles.media}>
              {product.imageUrl ? (
                <Image src={product.imageUrl} unoptimized={esImagenAjena(product.imageUrl)} alt={product.name} fill sizes="(max-width: 640px) 50vw, 260px" className={styles.photo} />
              ) : (
                <span className={styles.icon} aria-hidden="true">{product.icon ?? "+"}</span>
              )}
              {product.inStock ? null : <span className={styles.badge}>Agotado</span>}
            </div>
            <div className={styles.body}>
              <h3 className={styles.name}>{product.name}</h3>
              {product.unit && product.unit !== "Unidad" ? <p className={styles.unit}>Precio por {product.unit}</p> : null}
              <div className={styles.row}>
                <strong className={styles.price}>{formatCOP(product.price)}</strong>
                {canOrder ? (
                  qty > 0 ? (
                    <div className={styles.stepper}>
                      <button type="button" className={styles.stepBtn} aria-label={`Quitar una unidad de ${product.name}`} onClick={() => update((current) => setOrderQty(current, product.id, qty - 1))}>−</button>
                      <span className={styles.qty}>{qty}</span>
                      <button type="button" className={styles.stepBtn} aria-label={`Agregar una unidad de ${product.name}`} disabled={qty >= MAX_LINE_QTY} onClick={() => update((current) => addToOrder(current, product))}>+</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.add}
                      aria-label={product.inStock ? `Agregar ${product.name} al pedido` : `${product.name} está agotado`}
                      disabled={!product.inStock}
                      onClick={() => update((current) => addToOrder(current, product))}
                    >
                      {isDespensa ? (product.inStock ? <><span aria-hidden="true">+</span> Agregar</> : "Agotado") : "+"}
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  ) : (
    <div className={styles.empty}>
      <p>No encontramos productos con esa búsqueda.</p>
      <button type="button" className={styles.linkBtn} onClick={() => { setQuery(""); setCategoryId(null); }}>Ver todos los productos</button>
    </div>
  );

  const orderUi = canOrder ? (
    <>
      <p className="sr-only" aria-live="polite">{count ? `${units(count)} en tu pedido` : ""}</p>
      {count > 0 ? (
        <button type="button" className={styles.fab} onClick={openOrder} aria-label={`Ver tu pedido: ${units(count)}, ${formatCOP(total)}`}>
          <span className={styles.fabCount} aria-hidden="true">{count}</span>
          <span aria-hidden="true">Ver pedido · {formatCOP(total)}</span>
        </button>
      ) : null}
      <dialog
        ref={dialogRef}
        className={styles.drawer}
        aria-labelledby={titleId}
        onClick={(event) => { if (event.target === event.currentTarget) closeOrder(); }}
      >
        <div className={styles.drawerInner}>
          <div className={styles.drawerHead}>
            <h2 id={titleId} className={styles.drawerTitle}>Tu pedido</h2>
            <button type="button" className={styles.close} onClick={closeOrder} aria-label="Cerrar pedido">×</button>
          </div>
          {order.length ? (
            <ul className={styles.lines}>
              {order.map((line) => (
                <li key={line.productId} className={styles.line}>
                  <div className={styles.lineCopy}>
                    <span className={styles.lineName}>{line.name}</span>
                    <span className={styles.lineMeta}>{formatCOP(line.unitPrice)} c/u</span>
                  </div>
                  <div className={styles.stepper}>
                    <button type="button" className={styles.stepBtn} aria-label={`Quitar una unidad de ${line.name}`} onClick={() => update((current) => setOrderQty(current, line.productId, line.qty - 1))}>−</button>
                    <span className={styles.qty}>{line.qty}</span>
                    <button type="button" className={styles.stepBtn} aria-label={`Agregar una unidad de ${line.name}`} disabled={line.qty >= MAX_LINE_QTY} onClick={() => update((current) => setOrderQty(current, line.productId, line.qty + 1))}>+</button>
                  </div>
                  <button type="button" className={styles.remove} aria-label={`Quitar ${line.name} del pedido`} onClick={() => update((current) => removeFromOrder(current, line.productId))}>×</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.drawerEmpty}>Tu pedido está vacío. Agrega productos del catálogo.</p>
          )}
          {order.length ? (
            <div className={styles.drawerFoot}>
              <p className={styles.total}><span>Total</span><strong>{formatCOP(total)}</strong></p>
              <label className={styles.field}>
                <span>Tu nombre (opcional)</span>
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={80} autoComplete="name" />
              </label>
              <label className={styles.field}>
                <span>Nota para el negocio (opcional)</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} placeholder="Ej.: entrega a domicilio, sin bolsa…" />
              </label>
              {link ? <a href={link} target="_blank" rel="noopener noreferrer" className={styles.send}>Enviar pedido por WhatsApp</a> : null}
              <button type="button" className={styles.linkBtn} onClick={() => update(() => [])}>Vaciar pedido</button>
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  ) : null;

  const headerSearch = showCatalog ? (
    <form
      role="search"
      className={styles.mSearch}
      onSubmit={(event) => {
        event.preventDefault();
        goToCatalog();
      }}
    >
      {search}
      <button type="submit" className={styles.mSearchBtn} aria-label="Buscar">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </form>
  ) : null;

  const cartButton = showCatalog && canOrder ? (
    <button type="button" className={styles.mCart} onClick={openOrder} aria-label={`Ver tu pedido: ${units(count)}`}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="20" r="1.4" fill="currentColor" /><circle cx="17" cy="20" r="1.4" fill="currentColor" /></svg>
      {count ? <span className={styles.mCartCount} aria-hidden="true">{count}</span> : null}
    </button>
  ) : null;

  if (isDespensa) {
    // Barra oscura: atajos a las categorías. Elegir una filtra y baja al catálogo.
    const navLinks = showCatalog && site.categories.length ? (
      <div className={styles.dNavLinks} role="group" aria-label="Atajos de categorías">
        {[{ id: null, name: "Todas las categorías" }, ...site.categories].map((category) => (
          <button
            key={category.id ?? "todas"}
            type="button"
            aria-pressed={categoryId === category.id}
            className={styles.dNavLink}
            onClick={() => { setCategoryId(category.id); goToCatalog(); }}
          >
            {category.name}
          </button>
        ))}
      </div>
    ) : null;

    return (
      <div className={`${styles.catalog} ${styles.despensa}`}>
        {topBar}
        <header id="inicio" className={styles.mHeader}>
          <div className={styles.mHeaderInner}>
            {brand}
            {headerSearch}
            {cartButton}
          </div>
        </header>
        {navLinks || navEnd ? (
          <nav className={styles.dNav} aria-label="Categorías">
            <div className={styles.dNavInner}>
              {navLinks ?? <span />}
              {navEnd}
            </div>
          </nav>
        ) : null}
        {hero}
        {showCatalog ? (
          <section id="productos" ref={sectionRef} className={`site-section site-products-section ${styles.mSection}`}>
            {heading}
            <div className={`${styles.dLayout} ${tabs ? "" : styles.dLayoutFull}`}>
              {tabs ? (
                <aside className={styles.dAside}>
                  <p className={styles.dAsideTitle}>Categorías</p>
                  {tabs}
                </aside>
              ) : null}
              <div className={styles.dMain}>{grid}</div>
            </div>
          </section>
        ) : null}
        {showCatalog ? orderUi : null}
      </div>
    );
  }

  if (!isMercado) {
    return (
      <section id="productos" ref={sectionRef} className={`site-section site-products-section site-reveal ${styles.catalog} ${variant === "organico" ? styles.organico : ""}`}>
        {heading}
        <div className={styles.toolbar}>
          {tabs}
          <div className={styles.searchBox}>{search}</div>
        </div>
        {grid}
        {orderUi}
      </section>
    );
  }

  return (
    <div className={`${styles.catalog} ${styles.mercado}`}>
      {topBar}
      <header id="inicio" className={styles.mHeader}>
        <div className={styles.mHeaderInner}>
          {brand}
          {headerSearch}
          {cartButton}
        </div>
      </header>
      {hero}
      {showCatalog ? (
        <section id="productos" ref={sectionRef} className={`site-section site-products-section ${styles.mSection}`}>
          {heading}
          <div className={styles.toolbar}>{tabs}</div>
          {grid}
        </section>
      ) : null}
      {showCatalog ? orderUi : null}
    </div>
  );
}
