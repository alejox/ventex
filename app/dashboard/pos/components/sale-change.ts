import type { PaymentMethod } from "@/services/pos.service";

export interface SaleChangeSummary {
  /** Total cobrado al cliente. */
  total: number;
  /** Efectivo recibido; null si no se pagó en efectivo o no se anotó. */
  tendered: number | null;
  /** Cambio a entregar; 0 si no corresponde. */
  change: number;
}

/**
 * Resumen de la venta para el modal de éxito: total, recibido y cambio.
 *
 * Mismo criterio que el modal de cobro: solo hay vuelto en efectivo SIN pago
 * dividido (con splits el efectivo de cada parte no se anota como "recibido").
 * Se arma antes de cobrar, porque al registrarse la venta el store limpia el
 * carrito y el total pasa a valer cero.
 */
export function saleChangeSummary(
  total: number,
  paymentMethod: PaymentMethod,
  splitsCount: number,
  amountTendered: string,
): SaleChangeSummary {
  const paidCash = paymentMethod === "efectivo" && splitsCount === 0;
  if (!paidCash) return { total, tendered: null, change: 0 };
  const tendered = parseFloat(amountTendered) || 0;
  return {
    total,
    tendered: tendered > 0 ? tendered : null,
    change: Math.max(0, tendered - total),
  };
}
