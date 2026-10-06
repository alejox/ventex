/**
 * Desglose del descuento de una venta por ORIGEN (C12): Ofertas, Descuento
 * manual, Premio y Puntos. Antes el carrito y el recibo mostraban una sola
 * línea "Descuento" y nadie podía decir por qué bajó el total.
 *
 * Sale de lo que el carrito ya sabe, sin pedir nada a la base:
 * - `offerId`/`offerName` de la línea → oferta automática;
 * - `manualDiscount` → lo que puso el cajero en el DiscountModal;
 * - el premio de cortes y el canje de puntos los conoce la pantalla (su monto
 *   aplicado), y entran como parámetros.
 *
 * Lo que no se puede atribuir con certeza —p. ej. una oferta que perdió su
 * etiqueta al canjear puntos sobre esa misma línea (ver "Límite conocido" en
 * AGENTS.md)— va a "Otros descuentos" en vez de inventarle un origen. La suma
 * del desglose es SIEMPRE el descuento total de las líneas.
 *
 * Pura y testeada (`tests/pos-discount-breakdown.test.ts`).
 */

export type DiscountOrigin = "offers" | "manual" | "reward" | "points" | "other";

export interface DiscountBreakdownEntry {
  origin: DiscountOrigin;
  label: string;
  amount: number;
  /** Nombres de las ofertas que aplicaron (solo `offers`). */
  names?: string[];
}

/** Lo mínimo de una línea del carrito para atribuir su descuento. */
export interface BreakdownLine {
  discountAmount?: number;
  manualDiscount?: number;
  offerId?: string;
  offerName?: string;
}

export const DISCOUNT_ORIGIN_LABEL: Record<DiscountOrigin, string> = {
  offers: "Ofertas",
  manual: "Descuento manual",
  reward: "Premio",
  points: "Puntos",
  other: "Otros descuentos",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pos = (n: number | undefined | null) => (Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0);

export function discountBreakdown(
  cart: BreakdownLine[],
  applied: { rewardAmount?: number | null; pointsAmount?: number | null } = {},
): DiscountBreakdownEntry[] {
  let total = 0;
  let offers = 0;
  let manual = 0;
  const names: string[] = [];
  for (const line of cart) {
    const d = pos(line.discountAmount);
    total += d;
    if (d <= 0) continue;
    if (line.offerId) {
      offers += d;
      if (line.offerName && !names.includes(line.offerName)) names.push(line.offerName);
    } else {
      manual += Math.min(pos(line.manualDiscount), d);
    }
  }

  // Cada origen toma lo suyo de lo que queda, en orden: nunca suman más que
  // el descuento real de las líneas, aunque un monto aplicado quede viejo.
  let remaining = round2(total);
  const take = (amount: number) => {
    const t = round2(Math.min(pos(amount), remaining));
    remaining = round2(remaining - t);
    return t;
  };

  const parts: [DiscountOrigin, number][] = [
    ["offers", take(offers)],
    ["manual", take(manual)],
    ["reward", take(pos(applied.rewardAmount))],
    ["points", take(pos(applied.pointsAmount))],
  ];
  parts.push(["other", remaining]);

  return parts
    .filter(([, amount]) => amount >= 0.01)
    .map(([origin, amount]) => ({
      origin,
      label: DISCOUNT_ORIGIN_LABEL[origin],
      amount,
      ...(origin === "offers" && names.length > 0 ? { names } : {}),
    }));
}
