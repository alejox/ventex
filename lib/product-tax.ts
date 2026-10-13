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
