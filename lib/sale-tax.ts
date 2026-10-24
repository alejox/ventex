/**
 * IVA de una venta con tasa POR LÍNEA. Espejo exacto del bloque de IVA de
 * `create_sale` (migración `20261024200000_sale_line_tax_rate.sql`): si cambia
 * uno, cambia el otro. Pura y en centavos enteros para testearla sin base
 * (`tests/sale-line-tax.test.ts`).
 *
 * Los precios del POS son de vitrina (IVA incluido): el IVA se desglosa hacia
 * atrás. La regla:
 *
 * 1. Neto de cada línea = bruto − su descuento. Sin desglose por línea (la
 *    venta no lo manda cuando alguna línea quedó con más descuento que lo que
 *    vale), el descuento de la venta se prorratea por bruto
 *    (`round(desc × bruto_i / bruto, 2)`) y el residuo de centavos —para que
 *    Σneto = neto de la venta— va a la línea de MAYOR neto (empate: la
 *    primera).
 * 2. Las líneas se agrupan por tasa; base del grupo = round(neto_g / (1 + t), 2).
 * 3. Con UNA sola tasa hay un solo grupo y la cuenta es la de siempre
 *    (round(neto / (1 + t), 2)): un negocio que no usa tasas por producto no
 *    se mueve ni un centavo.
 * 4. Cliente exento: paga Σbase (se le quita solo el IVA que cada línea
 *    tenía). Negocio sin IVA (`includeTax` false): sin IVA, paga el neto.
 */

export interface SaleTaxLine {
  /** Bruto de la línea en centavos (`lineTotalCents`). */
  grossCents: number;
  /** Tasa de la línea (0..1): la del producto o, si no tiene, la del negocio. */
  rate: number;
}

export interface SaleTaxGroup {
  /** Tasa del grupo (0..1). */
  rate: number;
  netCents: number;
  baseCents: number;
  /** IVA del grupo (0 con cliente exento). */
  taxCents: number;
}

export interface SaleTaxResult {
  grossCents: number;
  discountCents: number;
  netCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** Desglose por tasa, de mayor a menor. Vacío si el negocio no maneja IVA. */
  groups: SaleTaxGroup[];
}

/** Tasa en puntos básicos enteros (numeric(5,4) en la base). */
const toBp = (rate: number) => Math.round((Number(rate) || 0) * 10000);

/**
 * round(a / b) con la mitad alejándose de cero, como `round(numeric)` de
 * Postgres, sobre enteros (b > 0).
 */
function divRound(a: number, b: number): number {
  const sign = a < 0 ? -1 : 1;
  const abs = Math.abs(a);
  return sign * Math.floor((2 * abs + b) / (2 * b));
}

/**
 * @param lineDiscountsCents descuento de cada línea en centavos (lo mismo que
 *   viaja como `discount_amount`), o null si la venta no manda desglose.
 * @param saleDiscountCents descuento total de la venta (`p_discount_amount`).
 * @param defaultRate tasa del negocio (solo se usa si no hay líneas).
 */
export function saleTaxTotals(
  lines: SaleTaxLine[],
  lineDiscountsCents: number[] | null,
  saleDiscountCents: number,
  defaultRate: number,
  taxExempt: boolean,
  includeTax: boolean,
): SaleTaxResult {
  const grossCents = lines.reduce((s, l) => s + l.grossCents, 0);
  const discountCents = saleDiscountCents;
  const netCents = Math.max(grossCents - discountCents, 0);

  if (!includeTax) {
    return { grossCents, discountCents, netCents, subtotalCents: netCents, taxCents: 0, totalCents: netCents, groups: [] };
  }

  const bps = lines.map((l) => toBp(l.rate));
  const distinct = [...new Set(bps)];

  // neto por grupo de tasa (bp → centavos)
  const groupNets = new Map<number, number>();
  if (distinct.length <= 1) {
    groupNets.set(distinct[0] ?? toBp(defaultRate), netCents);
  } else {
    const nets = lines.map((l, i) => {
      const lineDiscount = lineDiscountsCents
        ? lineDiscountsCents[i] ?? 0
        : grossCents > 0
          ? divRound(discountCents * l.grossCents, grossCents)
          : 0;
      return l.grossCents - lineDiscount;
    });
    let top = 0;
    for (let i = 1; i < nets.length; i++) if (nets[i] > nets[top]) top = i;
    nets[top] += netCents - nets.reduce((s, n) => s + n, 0);
    nets.forEach((n, i) => groupNets.set(bps[i], (groupNets.get(bps[i]) ?? 0) + n));
  }

  const groups: SaleTaxGroup[] = [...groupNets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([bp, net]) => {
      const base = divRound(net * 10000, 10000 + bp);
      return { rate: bp / 10000, netCents: net, baseCents: base, taxCents: taxExempt ? 0 : net - base };
    });
  const subtotalCents = groups.reduce((s, g) => s + g.baseCents, 0);

  if (taxExempt) {
    return { grossCents, discountCents, netCents, subtotalCents, taxCents: 0, totalCents: subtotalCents, groups };
  }
  return {
    grossCents,
    discountCents,
    netCents,
    subtotalCents,
    taxCents: netCents - subtotalCents,
    totalCents: netCents,
    groups,
  };
}

/** "19 %", "5 %", "16,5 %": la tasa como se imprime en Colombia. */
export function formatTaxRate(rate: number): string {
  const pct = Math.round((Number(rate) || 0) * 10000) / 100;
  return `${pct.toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;
}

export interface TaxSummaryRow {
  label: string;
  amount: number;
}

/**
 * Filas de IVA del resumen (carrito y recibo). Con una sola tasa, una fila
 * "IVA (19 %)" como siempre. Con varias, una fila por tasa gravada ("IVA 19 %",
 * "IVA 5 %") y, si hay productos exentos, su base ("Exento de IVA"), como lo
 * imprime una factura.
 */
export function taxSummaryRows(
  breakdown: { rate: number; base: number; tax: number }[] | undefined,
  fallbackRate: number,
  taxAmount: number,
): TaxSummaryRow[] {
  if (!breakdown || breakdown.length <= 1) {
    const rate = breakdown?.[0]?.rate ?? fallbackRate;
    return [{ label: `IVA (${formatTaxRate(rate)})`, amount: taxAmount }];
  }
  return breakdown.map((g) =>
    g.rate > 0
      ? { label: `IVA ${formatTaxRate(g.rate)}`, amount: g.tax }
      : { label: "Exento de IVA (base)", amount: g.base },
  );
}

/**
 * Etiqueta del IVA de una venta GUARDADA (detalle en Ventas). Con todas las
 * líneas a la misma tasa, "Impuesto (19%)" como siempre; si mezcla tasas (pan
 * exento + gaseosa al 19 %), "Impuesto (varias tasas)": la tasa de la venta
 * sola mentiría. Una línea sin tasa (venta legada) vale la de la venta.
 */
export function saleTaxLabel(
  saleRate: number,
  lineRates: readonly (number | null | undefined)[],
): string {
  const bps = new Set(lineRates.map((r) => toBp(r ?? saleRate)));
  if (bps.size > 1) return "Impuesto (varias tasas)";
  const rate = bps.size === 1 ? [...bps][0] / 10000 : Number(saleRate) || 0;
  return `Impuesto (${Math.round(rate * 100)}%)`;
}
