/**
 * ICUI: Impuesto a los Comestibles Ultraprocesados Industrialmente (Colombia).
 *
 * Impuesto saludable de la Ley 2277 de 2022, tarifa actual 20 %, código DIAN 35.
 * Es MONOFÁSICO: se liquida solo en producción/importación, así que el
 * comerciante que revende NO lo cobra en sus ventas — ya viene incluido en el
 * costo. Por eso en Ventex el ICUI se MARCA en el producto y se REGISTRA en la
 * compra, y nunca se toca `create_sale`.
 *
 * Es el espejo cliente de `public.purchase_icui_amount` (migración
 * 20261023100000): la base es la que recalcula la cabecera; esta copia existe
 * para que el formulario muestre el mismo número antes de guardar.
 */

/** Tasa nacional vigente del ICUI (dato del usuario: "Su tarifa actual es del 20 %"). */
export const ICUI_RATE = 0.2;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Tasa de ICUI que usa el formulario de compras.
 *
 * Espejo de `purchaseTaxRateFor` (IVA): editando una compra que ya tenía ICUI se
 * conserva la tasa GUARDADA, y solo un cambio explícito la mueve. "Ninguno"
 * apaga el impuesto. Sin tasa guardada cae a la configurada del negocio
 * (`businessRate`, que a su vez respalda en `ICUI_RATE`).
 */
export function icuiRateFor(
  option: "ICUI" | "Ninguno" | string,
  storedRate: number | null | undefined,
  businessRate: number = ICUI_RATE,
): number {
  if (option === "Ninguno") return 0;
  if (storedRate != null && storedRate > 0) return storedRate;
  return businessRate;
}

/**
 * Monto del ICUI sobre la base marcada, en centavos.
 *
 * Espejo de `public.purchase_icui_amount(base, rate)`: la base son las líneas
 * cuyo producto tiene `icui_applies`, y NO se le descuenta el descuento de
 * cabecera (el descuento es una negociación; el impuesto grava la mercadería).
 */
export function icuiAmountFor(icuiBase: number, rate: number): number {
  return round2(Math.max(icuiBase || 0, 0) * (rate || 0));
}
