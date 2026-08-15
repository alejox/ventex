import type { Product } from "@/services/inventory.service";
import type { Service } from "@/services/services.service";

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
export type CatalogKind = "product" | "service";

interface CatalogRowBase {
  id: string;
  name: string;
  /** Precio final de vitrina, IVA incluido (igual en las dos tablas). */
  price: number;
  /** "active" | "inactive". Un ítem archivado no se ofrece en el POS. */
  status: string;
  categoryName: string | null;
  createdAt: string;
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

/** El SKU es del producto; un servicio no lleva. */
export function catalogSkuOf(row: CatalogRow): string | null {
  return row.kind === "product" ? row.product.sku : null;
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
