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
