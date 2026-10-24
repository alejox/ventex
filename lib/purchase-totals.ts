/**
 * Totales de una compra (invoices.type = 'compra'). Pura y testeada.
 *
 * El IVA va sobre lo que efectivamente se paga por la mercadería: el subtotal
 * MENOS el descuento. Antes se calculaba sobre el subtotal entero y el
 * descuento se restaba después, lo que cobraba IVA sobre plata que el
 * proveedor nunca facturó.
 *
 * Es la misma cuenta que `public.purchase_totals` en la base
 * (migración 20261007120000). La base es la que manda —recalcula la cabecera
 * desde las líneas guardadas—; esta copia existe para que el formulario
 * muestre el mismo número antes de guardar. Si cambia una, cambia la otra.
 */

export interface PurchaseTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function purchaseTotalsOf(subtotal: number, discount: number, taxRate: number): PurchaseTotals {
  const s = round2(subtotal || 0);
  const d = round2(discount || 0);
  const taxable = Math.max(s - d, 0);
  const taxAmount = round2(taxable * (taxRate || 0));
  return { subtotal: s, taxAmount, total: round2(taxable + taxAmount) };
}

/**
 * IVA de UNA línea de compra, redondeado a centavos POR LÍNEA (como lo imprime
 * el proveedor). Espejo de `public.purchase_line_tax` (migración
 * 20261024100000): `round(greatest(line_total, 0) × rate, 2)`, mitad hacia
 * arriba. Se cuenta en centavos × puntos básicos (enteros) para que el
 * redondeo no dependa de artefactos de punto flotante; la base guarda la tasa
 * con 4 decimales (`numeric(5,4)`).
 */
export function purchaseLineTax(lineTotal: number, rate: number): number {
  const cents = Math.max(Math.round((lineTotal || 0) * 100), 0);
  const basisPoints = Math.round((rate || 0) * 10000);
  return Math.round((cents * basisPoints) / 10000) / 100;
}

/**
 * Totales de una compra con IVA POR LÍNEA (cada línea con su tasa: 19 %, 5 %,
 * exento…). Espejo de `recompute_purchase_invoice_totals` cuando las líneas
 * tienen `tax_rate`: subtotal = Σ line_total, IVA = Σ IVA redondeado de cada
 * línea, total = subtotal + IVA. El ICUI va aparte (`lib/icui.ts`) y se suma
 * al total afuera, igual que en la base.
 *
 * `lineTotal` ya viene neto del descuento de la línea (`lineTotalOf`).
 * `purchaseTotalsOf` queda para las compras legadas (tasa única de cabecera).
 */
export function purchaseTotalsByLine(lines: { lineTotal: number; taxRate: number }[]): PurchaseTotals {
  let subCents = 0;
  let taxCents = 0;
  for (const l of lines) {
    subCents += Math.round((l.lineTotal || 0) * 100);
    taxCents += Math.round(purchaseLineTax(l.lineTotal, l.taxRate) * 100);
  }
  return { subtotal: subCents / 100, taxAmount: taxCents / 100, total: (subCents + taxCents) / 100 };
}

/**
 * Tasa EFECTIVA de una línea guardada: la suya, o la de la cabecera si es una
 * línea legada (`tax_rate` null, anterior al IVA por línea). Misma regla que
 * `coalesce(ii.tax_rate, invoices.tax_rate)` en la base.
 */
export function purchaseLineRateOf(lineRate: number | null | undefined, headerRate: number | null | undefined): number {
  return lineRate ?? headerRate ?? 0;
}

/**
 * Tasa de IVA que usa el formulario.
 *
 * Editando una compra que ya tenía IVA se conserva la tasa GUARDADA: si el
 * negocio cambió su tasa después, reabrir y guardar una compra vieja no tiene
 * que recalcularle el impuesto en silencio. Solo cambia si la persona lo cambia
 * explícitamente (pasar a "Ninguno", o activar IVA en una compra que no tenía,
 * que toma la tasa vigente).
 */
export function purchaseTaxRateFor(
  option: "IVA" | "Ninguno" | string,
  storedRate: number | null | undefined,
  businessRate: number,
): number {
  if (option === "Ninguno") return 0;
  if (storedRate != null && storedRate > 0) return storedRate;
  return businessRate;
}
