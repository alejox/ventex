/**
 * Formato ÚNICO de montos mostrados en pantalla, recibos e impresiones.
 *
 * `es-CO` + `style: "currency"` produce `$ 45.000`: punto de miles, sin
 * decimales y con un espacio NO separable (U+00A0) entre el signo y el número,
 * para que el monto nunca se parta en dos renglones. Los pesos colombianos no
 * se manejan con centavos en el mostrador, así que no se muestran.
 *
 * Solo es para TEXTO mostrado: lo que viaja a la base, a ePayco, a un CSV/Excel
 * o a un input editable (`MoneyInput`) sigue siendo un número crudo.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      // Los dos topes en 0: navegadores viejos tiran RangeError si el máximo
      // queda por debajo del mínimo por defecto de la moneda (2 para COP).
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    formatters.set(currency, f);
  }
  return f;
}

/** Formatea un monto en la moneda dada (COP por defecto, sin decimales). */
export function formatMoney(amount: number | null | undefined, currency = "COP"): string {
  const n = Number(amount);
  // `|| 0` también normaliza -0 → 0, que si no se imprimiría como "-$ 0".
  const value = Number.isFinite(n) ? n || 0 : 0;
  // Un monto que redondea a cero (p. ej. -0,4) tampoco debe verse como "-$ 0".
  return formatterFor(currency || "COP").format(Math.abs(value) < 0.5 ? 0 : value);
}

/** Alias explícito para pesos colombianos. */
export const formatCOP = (amount: number | null | undefined): string => formatMoney(amount, "COP");
