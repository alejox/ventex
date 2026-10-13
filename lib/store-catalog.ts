/**
 * Catálogo del sitio público de tienda: qué productos se ven según la categoría
 * elegida y lo que el visitante escribió en el buscador, y cómo se recupera un
 * pedido guardado en el navegador contra el catálogo de HOY.
 *
 * Puro, sin React ni navegador, para probarlo con `node --test`.
 */

import { addToOrder, type OrderLine } from "@/lib/site-order";

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  inStock: boolean;
}

export interface CatalogFilter {
  /** null = "Todos". */
  categoryId: string | null;
  query: string;
}

/** Minúsculas, sin tildes ni espacios de sobra: "  CAFÉ " y "cafe" son lo mismo. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/**
 * Lo que se muestra: de la categoría elegida, con TODAS las palabras buscadas
 * en el nombre (en cualquier orden), primero lo disponible y después lo
 * agotado, cada grupo por nombre. Nunca muta la lista recibida.
 */
export function filterCatalog<T extends CatalogItem>(products: readonly T[], { categoryId, query }: CatalogFilter): T[] {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  return products
    .filter((product) => categoryId === null || product.categoryId === categoryId)
    .filter((product) => {
      if (!terms.length) return true;
      const name = normalizeSearch(product.name);
      return terms.every((term) => name.includes(term));
    })
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || byName.compare(a.name, b.name));
}

/**
 * Un pedido guardado en el navegador puede ser de hace días: el producto se
 * agotó, se borró o cambió de precio. Se rearma con el catálogo actual —nombre
 * y precio de hoy, solo lo que sigue disponible— y todo lo que no tenga forma
 * de línea se descarta en silencio: un `localStorage` viejo nunca rompe la página.
 */
export function restoreOrder(raw: unknown, products: readonly CatalogItem[]): OrderLine[] {
  if (!Array.isArray(raw)) return [];
  const available = new Map(products.filter((product) => product.inStock).map((product) => [product.id, product]));
  let order: OrderLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { productId, qty } = item as Record<string, unknown>;
    if (typeof productId !== "string" || typeof qty !== "number") continue;
    const product = available.get(productId);
    if (product) order = addToOrder(order, product, qty);
  }
  return order;
}
