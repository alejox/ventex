/**
 * Descuento manual en monto fijo (pesos), repartido entre las líneas elegidas.
 *
 * Lógica pura del `DiscountModal`: no lee el store ni la base, así se testea
 * sin montar nada (`tests/pos-discount-amount.test.ts`). La salida es la MISMA
 * forma que ya consumía el POS —un `discountAmount` por línea vía
 * `setLineDiscounts`—, así que el modo en pesos no cambia nada aguas abajo:
 * `create_sale` sigue recibiendo la suma en `p_discount_amount`.
 */

/** Un monto en pesos utilizable (0 ≤ monto ≤ tope), o null si no sirve. */
export function parseDiscountAmount(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return null;
  if (amount < 0 || amount > max + 0.005) return null;
  return Math.round(amount * 100) / 100;
}

/**
 * Reparte `amount` entre líneas en proporción a su valor bruto, con centavos
 * redondeados y el residuo en la línea de mayor valor —así la suma da EXACTO
 * el monto pedido, que es lo que el cajero va a ver en el total—. Ninguna línea
 * recibe más que lo que vale. Devuelve los montos en el mismo orden.
 */
export function distributeFixedDiscount(grossByLine: number[], amount: number): number[] {
  const total = grossByLine.reduce((s, g) => s + Math.max(g, 0), 0);
  if (total <= 0 || amount <= 0) return grossByLine.map(() => 0);
  const capped = Math.min(amount, total);
  const shares = grossByLine.map((g) => Math.floor((Math.max(g, 0) / total) * capped * 100) / 100);
  let residue = Math.round((capped - shares.reduce((s, x) => s + x, 0)) * 100) / 100;
  // El residuo (unos centavos) va primero a la línea más grande que tenga lugar.
  const order = grossByLine.map((g, i) => ({ g, i })).sort((a, b) => b.g - a.g);
  for (const { g, i } of order) {
    if (residue <= 0) break;
    const room = Math.round((Math.max(g, 0) - shares[i]) * 100) / 100;
    const add = Math.min(room, residue);
    shares[i] = Math.round((shares[i] + add) * 100) / 100;
    residue = Math.round((residue - add) * 100) / 100;
  }
  return shares;
}
