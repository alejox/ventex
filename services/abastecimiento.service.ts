import { needsRestock } from "@/lib/stock";

export interface SuggestedOrderItem {
  productId: string;
  productName: string;
  imageUrl: string | null;
  sku: string;
  currentStock: number;
  minimumStock: number;
  suggestedQuantity: number;
  unit: string;
  purchasePrice: number;
  distributorName: string | null;
}

export function computeSuggestedQuantity(
  currentStock: number,
  minimumStock: number,
): number {
  const target = minimumStock * 2;
  return Math.max(0, target - currentStock);
}

/**
 * Arma la lista de faltantes.
 *
 * `alreadyOrdered` son los productos que ya viven en un pedido ABIERTO
 * (borrador o pendiente). Se excluyen porque el faltante ya se pidió: sin esto,
 * un producto bajo de stock reaparece como "falta" cada vez que se entra a la
 * pantalla y se termina pidiendo dos y tres veces lo mismo — el stock no sube
 * hasta que la mercadería llega, así que la sugerencia insiste con razón y el
 * dueño no tiene forma de saber que ya lo encargó.
 *
 * Completar o cancelar el pedido los devuelve a esta lista.
 */
export function buildSuggestedItems(
  products: {
    id: string;
    name: string;
    image_url: string | null;
    sku: string;
    stock_level: number;
    minimum_stock: number;
    unit: string;
    purchase_price: number;
    distributors: { business_name: string } | null;
  }[],
  alreadyOrdered: ReadonlySet<string> = new Set(),
): SuggestedOrderItem[] {
  return products
    // Misma definición que Inventario y el Panel. `needsRestock` ya deja fuera
    // a los servicios y a lo que no tiene mínimo configurado — eso último
    // también evita la división por cero del orden de abajo.
    .filter(needsRestock)
    .filter((p) => !alreadyOrdered.has(p.id))
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      imageUrl: p.image_url,
      sku: p.sku,
      currentStock: p.stock_level,
      minimumStock: p.minimum_stock,
      suggestedQuantity: computeSuggestedQuantity(p.stock_level, p.minimum_stock),
      unit: p.unit,
      purchasePrice: p.purchase_price,
      distributorName: p.distributors?.business_name ?? null,
    }))
    .sort((a, b) => (a.currentStock / a.minimumStock) - (b.currentStock / b.minimumStock));
}
