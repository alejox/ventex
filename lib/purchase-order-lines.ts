/**
 * Valor de las líneas de un pedido de compra. Pura y testeada.
 *
 * En un pedido, `quantity` está en UNIDADES pero `unit_price` es el
 * `purchase_price` del producto, que para un producto por caja
 * (`units_per_package > 1`) es el costo de la CAJA. Multiplicar uno por otro
 * —lo que hacía la lista de Pedidos— cobraba 24 cajas por 24 latas.
 *
 * Es la misma cuenta con la que `receive_purchase_order` arma la compra: cajas
 * completas a precio de caja + unidades sueltas a `round(precio_caja / u, 2)`,
 * redondeada a 2 decimales por línea como `replace_purchase_invoice_items`. Si
 * cambia una, cambia la otra: así lo que se ve en Pedidos es lo que queda
 * registrado al recibir.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface OrderLineInput {
  quantity: number;
  unit_price: number;
  /** Del producto; null/undefined/<=1 = se compra por unidad. */
  units_per_package?: number | null;
}

export interface OrderLineBreakdown {
  /** Cajas completas (0 si el producto se compra por unidad). */
  packages: number;
  /** Unidades que no completan una caja (todas, si se compra por unidad). */
  looseUnits: number;
  unitsPerPackage: number;
  /** Precio de la caja (0 si se compra por unidad). */
  packagePrice: number;
  /** Precio de cada unidad suelta. */
  looseUnitPrice: number;
  total: number;
}

function packSize(units: number | null | undefined): number {
  const n = Math.floor(Number(units));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export function orderLineBreakdown(line: OrderLineInput): OrderLineBreakdown {
  const quantity = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const u = packSize(line.units_per_package);

  if (u === 1) {
    return {
      packages: 0,
      looseUnits: quantity,
      unitsPerPackage: 1,
      packagePrice: 0,
      looseUnitPrice: price,
      total: round2(quantity * price),
    };
  }

  const packages = Math.floor(quantity / u);
  // Redondeo a 3 decimales como numeric(12,3): 30.4 - 24 no deja 6.399999.
  const looseUnits = Math.round((quantity - packages * u) * 1000) / 1000;
  const looseUnitPrice = round2(price / u);
  return {
    packages,
    looseUnits,
    unitsPerPackage: u,
    packagePrice: price,
    looseUnitPrice,
    total: round2(packages * price + looseUnits * looseUnitPrice),
  };
}

export function orderLineTotal(line: OrderLineInput): number {
  return orderLineBreakdown(line).total;
}

/** Suma de las líneas, ya redondeadas una por una (como la base). */
export function orderTotal(lines: readonly OrderLineInput[]): number {
  return round2(lines.reduce((sum, line) => sum + orderLineTotal(line), 0));
}

/**
 * Cantidad legible: "2 cajas ×24 + 6 u." / "1 caja ×12" / "5 u.".
 */
export function orderLineQuantityLabel(line: OrderLineInput): string {
  const b = orderLineBreakdown(line);
  if (b.unitsPerPackage === 1) return `${b.looseUnits} u.`;
  const parts: string[] = [];
  if (b.packages > 0) parts.push(`${b.packages} caja${b.packages !== 1 ? "s" : ""} ×${b.unitsPerPackage}`);
  if (b.looseUnits > 0 || parts.length === 0) parts.push(`${b.looseUnits} u.`);
  return parts.join(" + ");
}
