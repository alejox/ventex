/**
 * Helpers de presentación para planes/suscripciones. La definición de los
 * límites vive en la tabla `public.plans` (parametrizable desde /admin/plans);
 * esto es solo formato y metadatos de UI (acentos de color por plan).
 */

/** Formatea un monto en la moneda dada (sin decimales para montos grandes). */
export function formatMoney(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

/** Límite de ventas mensual legible; null = ilimitado. */
export function formatSalesLimit(max: number | null, currency = "COP"): string {
  return max == null ? "Ilimitado" : formatMoney(max, currency);
}

/** Porcentaje de uso (0–100) acotado, evitando división por cero/infinito. */
export function usagePercent(used: number, max: number | null): number {
  if (max == null || max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

/** Acento de color por plan (fallback para planes personalizados). */
export const PLAN_ACCENTS: Record<string, { bg: string; text: string; ring: string }> = {
  gratis: { bg: "bg-surface-container-high", text: "text-on-surface-variant", ring: "ring-outline-variant/30" },
  basica: { bg: "bg-primary/10", text: "text-primary", ring: "ring-primary/30" },
  oro: { bg: "bg-amber-500/15", text: "text-amber-500", ring: "ring-amber-500/40" },
};

export function planAccent(planId: string) {
  return PLAN_ACCENTS[planId] ?? PLAN_ACCENTS.gratis;
}

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  past_due: "Pago pendiente",
  cancelled: "Cancelada",
};

/** Etiquetas y acentos de la licencia mensual de clientes de revendedor. */
export const LICENSE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de activar",
  active: "Activa",
  expired: "Vencida",
  suspended: "Suspendida",
};

export const LICENSE_STATUS_ACCENTS: Record<string, { bg: string; text: string; ring: string }> = {
  pending: { bg: "bg-surface-container-high", text: "text-on-surface-variant", ring: "ring-outline-variant/30" },
  active: { bg: "bg-primary/10", text: "text-primary", ring: "ring-primary/30" },
  expired: { bg: "bg-error-container/20", text: "text-error-dim", ring: "ring-error-container/40" },
  suspended: { bg: "bg-amber-500/15", text: "text-amber-500", ring: "ring-amber-500/40" },
};

export function licenseAccent(status: string) {
  return LICENSE_STATUS_ACCENTS[status] ?? LICENSE_STATUS_ACCENTS.pending;
}

// ---- Modalidad anual ----
/**
 * Los 12 meses de un año se entregan siempre; `annual_charged_months` dice
 * cuántos se cobran. El precio anual se DERIVA del mensual (nunca se almacena),
 * de modo que cambiar el precio del mes ajusta el año automáticamente.
 */
export const MONTHS_PER_YEAR = 12;

interface AnnualPlan {
  price: number;
  annual_charged_months: number;
}

/** ¿El plan ofrece modalidad anual? (gratis o sin meses cobrados = no). */
export function hasAnnual(plan: AnnualPlan): boolean {
  return plan.price > 0 && plan.annual_charged_months > 0;
}

/** Precio del año completo: mensual x meses cobrados (29.000 x 10 = 290.000). */
export function annualPrice(plan: AnnualPlan): number {
  return plan.price * plan.annual_charged_months;
}

/** Meses de regalo: los 12 entregados menos los cobrados. */
export function annualFreeMonths(plan: AnnualPlan): number {
  return Math.max(0, MONTHS_PER_YEAR - plan.annual_charged_months);
}
