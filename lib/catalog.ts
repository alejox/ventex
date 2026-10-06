import type { Product } from "@/services/inventory.service";
import type { Service } from "@/services/services.service";
import { needsRestock } from "@/lib/stock";

/**
 * El catálogo del negocio: lo que se puede cobrar, sea mercadería o trabajo.
 *
 * Un producto y un servicio son cosas DISTINTAS y viven en tablas distintas
 * (`products` y `services`) — el intento anterior de guardarlos en una sola
 * tabla, con la unidad "Servicio" como discriminador y un gemelo emparejado por
 * nombre, terminó con las dos copias desincronizadas en producción.
 *
 * Lo que sí comparten es la PANTALLA: el dueño no piensa "voy a inventario y
 * después a servicios", piensa "qué vendo". Así que la unión se hace acá, en
 * memoria, y cada mitad se sigue guardando donde corresponde.
 */

interface CatalogRowBase {
  id: string;
  name: string;
  /** Precio final de vitrina, IVA incluido (igual en las dos tablas). */
  price: number;
  /** "active" | "inactive". Un ítem archivado no se ofrece en el POS. */
  status: string;
  categoryName: string | null;
  createdAt: string;
  /**
   * La foto, venga de donde venga.
   *
   * Se resuelve acá y no en cada pantalla: cuando cada vista hacía
   * `row.kind === "product" && row.product.image_url`, agregar la foto a los
   * servicios significaba acordarse de tocar todos los lugares — y el catálogo
   * de Inventario se quedó sin ella justamente por eso.
   */
  imageUrl: string | null;
}

export type CatalogRow =
  | (CatalogRowBase & { kind: "product"; product: Product })
  | (CatalogRowBase & { kind: "service"; service: Service });

/**
 * Los productos-servicio (`unit = 'Servicio'`) quedan afuera del catálogo.
 *
 * Son filas legadas: hasta la migración `20260815000000` un servicio se
 * duplicaba ahí. Las filas siguen existiendo porque `sale_items.product_id` las
 * referencia y borrarlas rompería el histórico de ventas, pero el servicio que
 * representan ya vive en `services` y mostrarlas lo duplicaría en pantalla.
 */
export function isLegacyServiceProduct(product: { unit?: string | null }): boolean {
  return product.unit === "Servicio";
}

export function catalogRowsOf(products: Product[], services: Service[]): CatalogRow[] {
  const rows: CatalogRow[] = [];

  for (const product of products) {
    if (isLegacyServiceProduct(product)) continue;
    rows.push({
      kind: "product",
      id: product.id,
      name: product.name,
      price: product.price,
      status: product.status,
      categoryName: product.categories?.name ?? null,
      createdAt: product.created_at,
      imageUrl: product.image_url ?? null,
      product,
    });
  }

  for (const service of services) {
    rows.push({
      kind: "service",
      id: service.id,
      name: service.name,
      price: service.price,
      status: service.status,
      categoryName: service.categories?.name ?? null,
      createdAt: service.created_at,
      imageUrl: service.image_url ?? null,
      service,
    });
  }

  // Lo último creado primero, que es el orden que ya tenía Inventario: quien
  // acaba de dar algo de alta lo busca arriba, no alfabéticamente.
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * A dónde lleva tocar la fila. Las dos mitades comparten formulario, y el
 * parámetro es el que decide cuál de las dos tablas se está editando: `id` para
 * un producto, `serviceId` para un servicio. Un mismo `id` para los dos
 * obligaría al formulario a adivinar, y los uuid no dicen de qué tabla salieron.
 */
export function catalogEditHref(row: CatalogRow): string {
  return row.kind === "product"
    ? `/dashboard/inventory/product?id=${row.id}`
    : `/dashboard/inventory/product?serviceId=${row.id}`;
}

/**
 * Búsqueda por nombre, SKU o código de barras. El código del escáner cae en el
 * mismo campo que el texto: buscar por código es buscar.
 */
export function catalogMatchesQuery(row: CatalogRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.name.toLowerCase().includes(q)) return true;
  if (row.kind !== "product") return false;
  return (
    row.product.sku.toLowerCase().includes(q) ||
    (row.product.barcode ?? "").toLowerCase().includes(q)
  );
}

/**
 * Archivado = cualquier estado que no sea "active". Las dos tablas usan
 * "inactive" para archivar; tratar todo lo demás igual evita que un estado
 * nuevo aparezca de golpe como vendible en el catálogo.
 */
export function isArchivedRow(row: Pick<CatalogRow, "status">): boolean {
  return row.status !== "active";
}

/** Filtro "Estado" del catálogo. Activos es el default: es lo que se vende. */
export type CatalogStatusFilter = "active" | "archived" | "all";

export function catalogMatchesStatus(
  row: Pick<CatalogRow, "status">,
  filter: CatalogStatusFilter,
): boolean {
  if (filter === "all") return true;
  return filter === "archived" ? isArchivedRow(row) : !isArchivedRow(row);
}

/**
 * Los números de arriba del catálogo, contados SOLO sobre lo activo.
 *
 * Lo archivado ya no se ofrece en el POS ni se repone: contarlo inflaba "Total
 * en catálogo" y, peor, mantenía en "Stock bajo" productos que nadie piensa
 * volver a comprar.
 */
export function catalogKpis(rows: CatalogRow[]): {
  products: number;
  services: number;
  lowStock: number;
  archived: number;
} {
  let products = 0;
  let services = 0;
  let lowStock = 0;
  let archived = 0;
  for (const row of rows) {
    if (isArchivedRow(row)) {
      archived++;
      continue;
    }
    if (row.kind === "product") {
      products++;
      if (needsRestock(row.product)) lowStock++;
    } else {
      services++;
    }
  }
  return { products, services, lowStock, archived };
}

/** Columnas por las que se puede ordenar el catálogo. */
export type CatalogSortKey = "name" | "price" | "stock" | "category";

/**
 * Ordena el catálogo SIN mutar la lista. Sin clave devuelve el orden de
 * `catalogRowsOf` (lo último creado primero).
 *
 * - Nombre y categoría: alfabético en español, sin distinguir mayúsculas ni
 *   tildes, con números en orden natural ("Talla 2" antes que "Talla 10").
 * - Stock: lo que no lleva conteo (servicios y productos sin inventario) va
 *   SIEMPRE al final, en los dos sentidos: no es "cero", es "no aplica".
 * - Categoría vacía también va al final.
 * - Empates: se conserva el orden previo (sort estable).
 */
export function sortCatalogRows(
  rows: CatalogRow[],
  key: CatalogSortKey | null | undefined,
  dir: "asc" | "desc" = "asc",
): CatalogRow[] {
  if (!key) return rows;
  const sign = dir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
  const stockOf = (row: CatalogRow): number | null =>
    row.kind === "product" && row.product.tracks_stock !== false ? row.product.stock_level : null;

  return [...rows].sort((a, b) => {
    switch (key) {
      case "name":
        return sign * text(a.name, b.name);
      case "price":
        return sign * (a.price - b.price);
      case "category": {
        if (!a.categoryName || !b.categoryName) {
          return a.categoryName === b.categoryName ? 0 : a.categoryName ? -1 : 1;
        }
        return sign * text(a.categoryName, b.categoryName);
      }
      case "stock": {
        const sa = stockOf(a);
        const sb = stockOf(b);
        if (sa === null || sb === null) return sa === sb ? 0 : sa === null ? 1 : -1;
        return sign * (sa - sb);
      }
      default:
        return 0;
    }
  });
}

export const CATALOG_SORT_KEYS: CatalogSortKey[] = ["name", "price", "stock", "category"];

export function isCatalogSortKey(value: string): value is CatalogSortKey {
  return (CATALOG_SORT_KEYS as string[]).includes(value);
}
