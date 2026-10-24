export interface PriceMultiplierInput {
  /** `settings.include_tax`: whether the business handles IVA at all. */
  includeTax: boolean;
  /** Effective selling rate (0 when the business does not handle IVA). */
  rate: number;
  /** Configured rate, as-is. */
  rawRate: number;
  /** Purchase IVA selector value: "IVA" or "Ninguno". */
  purchaseTax: string;
  /** Selling IVA selector value: "IVA" or "Ninguno". */
  sellingTax: string;
}

/**
 * Multipliers that turn a base price into the saved total.
 *
 * A business that does not handle IVA sees no IVA anywhere in the product
 * form: what it types IS the price, on both sides. Grossing up the purchase
 * by `rawRate` there would save a cost the owner never typed.
 */
export function priceMultipliers({
  includeTax,
  rate,
  rawRate,
  purchaseTax,
  sellingTax,
}: PriceMultiplierInput): { purchase: number; selling: number } {
  if (!includeTax) return { purchase: 1, selling: 1 };
  return {
    purchase: purchaseTax === "Ninguno" ? 1 : 1 + rawRate,
    selling: sellingTax === "Ninguno" ? 1 : 1 + rate,
  };
}

/** Business settings preserve the entered total; explicit tax selectors preserve base. */
export function repricePair(
  pair: { base: string; total: string },
  multiplier: number,
  preserveTotal: boolean,
): { base: string; total: string } {
  const source = preserveTotal ? pair.total : pair.base;
  const value = parseFloat(source);
  const converted = source === "" || !Number.isFinite(value)
    ? ""
    : String(Math.round((preserveTotal ? value / multiplier : value * multiplier) * 100) / 100);
  return preserveTotal ? { base: converted, total: pair.total } : { base: pair.base, total: converted };
}

/**
 * Tasa de IVA EFECTIVA de un producto: la suya (`products.tax_rate`) o, si no
 * tiene (null), la del negocio. Es la misma que usa `create_sale` al vender y
 * la que hereda cada línea de compra.
 */
export function effectiveProductTaxRate(productRate: number | null | undefined, businessRate: number): number {
  return productRate ?? businessRate;
}

/**
 * Multiplicadores base → total de la ficha de PRODUCTO, con la tasa del campo
 * "IVA" persistido (`products.tax_rate`; null = la del negocio, 0 = exento).
 * Reemplaza al selector viejo "Impuestos (Ninguno / IVA)", que solo movía la
 * calculadora y no se guardaba. Sin IVA en el negocio no hay IVA en la ficha.
 */
export function productPriceMultipliers({
  includeTax,
  businessRate,
  productRate,
}: {
  includeTax: boolean;
  businessRate: number;
  productRate: number | null | undefined;
}): { purchase: number; selling: number } {
  if (!includeTax) return { purchase: 1, selling: 1 };
  const m = 1 + effectiveProductTaxRate(productRate, businessRate);
  return { purchase: m, selling: m };
}

/** "IVA 19 %", "IVA 5 %" o "Exento de IVA", para la calculadora de la ficha. */
export function productTaxLabel(rate: number): string {
  if (!(rate > 0)) return "Exento de IVA";
  return `IVA ${+(rate * 100).toFixed(2)} %`;
}
