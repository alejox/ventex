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

/** Moneda cuando el negocio no configuró ninguna (o configuró algo inválido). */
export const DEFAULT_CURRENCY = "COP";

/**
 * Código ISO 4217 válido para `Intl`, o COP. `settings.currency` es texto libre
 * en la base: un valor vacío, en minúsculas o inventado no puede tirar abajo
 * toda pantalla que muestre un monto (Intl lanza RangeError con un código
 * mal formado).
 */
export function normalizeCurrency(currency: string | null | undefined): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return DEFAULT_CURRENCY;
  try {
    new Intl.NumberFormat("es-CO", { style: "currency", currency: code });
    return code;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

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
export function formatMoney(amount: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  const n = Number(amount);
  // `|| 0` también normaliza -0 → 0, que si no se imprimiría como "-$ 0".
  const value = Number.isFinite(n) ? n || 0 : 0;
  // Un monto que redondea a cero (p. ej. -0,4) tampoco debe verse como "-$ 0".
  return formatterFor(normalizeCurrency(currency)).format(Math.abs(value) < 0.5 ? 0 : value);
}

/** Formateador atado a una moneda: lo que devuelve `useFormatMoney()`. */
export type MoneyFormatter = (amount: number | null | undefined) => string;

/** `formatMoney` con la moneda ya fijada, para pasarlo a helpers puros. */
export function moneyFormatter(currency: string | null | undefined): MoneyFormatter {
  const code = normalizeCurrency(currency);
  return (amount) => formatMoney(amount, code);
}

/** Alias explícito para pesos colombianos. */
export const formatCOP = (amount: number | null | undefined): string => formatMoney(amount, "COP");
