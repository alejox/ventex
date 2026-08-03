/**
 * Vigencia del plan: cuánto le queda vivo al periodo pagado.
 *
 * La fecha llega de `subscriptions.current_period_end` (vía `/api/billing/status`)
 * y es un timestamp, pero para el usuario la vigencia es un DÍA de calendario:
 * un plan que vence hoy a las 23:59 sigue estando "vigente hoy". Por eso los días
 * restantes se cuentan entre medianoches locales y no por diferencia de horas —
 * si no, a las 8 de la mañana del día del vencimiento diría "faltan 0 días" y a
 * las 18 diría "venció", con el mismo plan todavía activo.
 */

export type ValidityTone = "ok" | "soon" | "urgent" | "expired";

/** Menos de esto ya es urgencia: se avisa fuerte y se empuja a renovar. */
const URGENT_DAYS = 7;
/** Ventana de aviso temprano. */
const SOON_DAYS = 30;

export interface PlanValidity {
  /** Fecha de fin del periodo, ya formateada en español. */
  dateLabel: string;
  /** Días de calendario que faltan. Negativo si ya venció. */
  daysLeft: number;
  tone: ValidityTone;
  /** Texto corto para la píldora: "12 meses", "5 días", "Vence hoy", "Vencido". */
  remainingLabel: string;
  /** Frase completa para el encabezado: "Vigente hasta" / "Venció el". */
  headline: string;
  /** Porcentaje del periodo ya consumido (0-100), o null si no se puede derivar. */
  progress: number | null;
}

const DAY_MS = 86_400_000;

export function formatLongDate(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Medianoche local de una fecha: la unidad en la que el usuario piensa. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function daysBetweenToday(value: string | null | undefined): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return Math.round((startOfDay(date) - startOfDay(new Date())) / DAY_MS);
}

/**
 * @param periodEnd fin del periodo pagado (`current_period_end`).
 * @param periodStart inicio del periodo (último cobro), sólo para la barra de
 *   avance. Sin él la barra no se dibuja: preferimos no mostrar nada antes que
 *   inventar un largo de periodo.
 */
export function planValidity(
  periodEnd: string | null | undefined,
  periodStart?: string | null,
): PlanValidity | null {
  const end = parseDate(periodEnd);
  if (!end) return null;

  const daysLeft = daysBetweenToday(periodEnd) ?? 0;
  const tone: ValidityTone =
    daysLeft < 0
      ? "expired"
      : daysLeft <= URGENT_DAYS
        ? "urgent"
        : daysLeft <= SOON_DAYS
          ? "soon"
          : "ok";

  return {
    dateLabel: formatLongDate(periodEnd),
    daysLeft,
    tone,
    remainingLabel: remainingLabel(daysLeft),
    headline: daysLeft < 0 ? "Venció el" : "Vigente hasta",
    progress: computeProgress(parseDate(periodStart), end),
  };
}

function remainingLabel(daysLeft: number): string {
  if (daysLeft < 0) return "Vencido";
  if (daysLeft === 0) return "Vence hoy";
  if (daysLeft === 1) return "1 día";
  // Arriba de dos meses los días sueltos no dicen nada: "11 meses" se lee mejor
  // que "334 días".
  if (daysLeft > 60) {
    const months = Math.round(daysLeft / 30);
    return `${months} meses`;
  }
  return `${daysLeft} días`;
}

function computeProgress(start: Date | null, end: Date): number | null {
  if (!start) return null;
  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;
  const elapsed = Date.now() - start.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}
