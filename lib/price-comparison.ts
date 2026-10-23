/**
 * Comparación de precios por proveedor. Lógica pura y testeada.
 *
 * El costo unitario de cada línea sale de la base (`product_prices_by_distributor`),
 * con la misma cuenta que `sync_products_last_cost`: caja a `package_price /
 * units_per_package`, si no el `unit_price` suelto. La base ya devuelve UN precio
 * por (producto, proveedor): el último.
 */

export interface DistributorPrice {
  product_id: string;
  distributor_id: string;
  distributor_name: string;
  unit_cost: number;
  last_purchase_at: string;
}

export interface BestPrice {
  distributor_id: string;
  distributor_name: string;
  unit_cost: number;
}

/**
 * El proveedor más barato para `productId`, excluyendo al proveedor actual.
 *
 * La alerta de compra compara contra esto: si pagás más que el mejor precio de
 * OTRO proveedor, avisamos quién lo vende más barato. Sin otro proveedor (o sin
 * historial) devuelve `null` — no hay contra qué comparar.
 */
export function bestOtherPrice(
  rows: DistributorPrice[],
  productId: string,
  currentDistributorId: string,
): BestPrice | null {
  let best: BestPrice | null = null;
  for (const r of rows) {
    if (r.product_id !== productId || r.distributor_id === currentDistributorId) continue;
    if (best === null || r.unit_cost < best.unit_cost) {
      best = { distributor_id: r.distributor_id, distributor_name: r.distributor_name, unit_cost: r.unit_cost };
    }
  }
  return best;
}

/** ¿Estás pagando más que el mejor precio de otro proveedor? */
export function isPayingMore(currentCost: number, best: BestPrice | null): boolean {
  return best !== null && currentCost > best.unit_cost;
}

/**
 * Agrupa las filas por producto, manteniendo el orden de la base (por producto,
 * proveedor más barato primero). Para la vista de comparación.
 */
export function pricesByProduct(rows: DistributorPrice[]): Map<string, DistributorPrice[]> {
  const map = new Map<string, DistributorPrice[]>();
  for (const r of rows) {
    const list = map.get(r.product_id) ?? [];
    list.push(r);
    map.set(r.product_id, list);
  }
  return map;
}

/**
 * Costo unitario de una línea de compra tal como se carga en el formulario,
 * con la misma cuenta que la base: si hay cajas con precio, `package_price /
 * units_per_package`; si no, el `unit_price` suelto. `null` si todavía no hay
 * costo (línea vacía).
 */
export function purchaseLineUnitCost(line: {
  package_quantity: number;
  loose_quantity: number;
  package_price: number;
  unit_price: number;
  units_per_package: number;
}): number | null {
  if (line.package_quantity > 0 && line.package_price > 0) {
    return line.package_price / Math.max(line.units_per_package, 1);
  }
  if (line.loose_quantity > 0 && line.unit_price > 0) {
    return line.unit_price;
  }
  return null;
}

/**
 * ¿El producto coincide con la búsqueda? Compara nombre, SKU y código de
 * barras, sin tildes ni mayúsculas. Con la búsqueda vacía todo pasa.
 */
export function matchesProductSearch(
  product: { name: string; sku: string; barcode?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    product.name.toLowerCase().includes(q) ||
    product.sku.toLowerCase().includes(q) ||
    (product.barcode ?? "").toLowerCase().includes(q)
  );
}
