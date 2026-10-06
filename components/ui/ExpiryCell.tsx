/**
 * Vencimiento de un plan o licencia: fecha + días que faltan, con tono según la
 * urgencia. Compartido por `/admin/companies` y el panel de revendedor (F19);
 * antes cada pantalla lo armaba a mano y el revendedor solo veía la fecha.
 *
 * La lógica es pura y testeada (`tests/expiry.test.ts`): `now` entra por
 * parámetro para no depender del reloj.
 */

const MS_PER_DAY = 86_400_000;

/** Ventana de "por vencer": lo que vence en esta cantidad de días o menos. */
export const EXPIRY_SOON_DAYS = 7;

/** Días que faltan para el vencimiento (negativo = ya venció). */
export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / MS_PER_DAY);
}

export type ExpiryTone = "none" | "expired" | "soon" | "ok";

export function expiryTone(periodEnd: string | null, now: number = Date.now()): ExpiryTone {
  if (!periodEnd) return "none";
  const days = daysUntil(periodEnd, now);
  if (days < 0) return "expired";
  if (days <= EXPIRY_SOON_DAYS) return "soon";
  return "ok";
}

/** ¿Hay que renovarla ya? Vencida o venciendo dentro de la ventana. */
export function needsRenewal(periodEnd: string | null, now: number = Date.now()): boolean {
  const tone = expiryTone(periodEnd, now);
  return tone === "expired" || tone === "soon";
}

/** "Vencido hace 3 días" · "Vence hoy" · "Faltan 5 días". */
export function expiryLabel(days: number): string {
  if (days < 0) {
    const ago = Math.abs(days);
    return `Vencido hace ${ago} día${ago === 1 ? "" : "s"}`;
  }
  if (days === 0) return "Vence hoy";
  return `Faltan ${days} día${days === 1 ? "" : "s"}`;
}

function formatExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ExpiryCell({
  periodEnd,
  className = "",
}: {
  periodEnd: string | null;
  className?: string;
}) {
  if (!periodEnd) {
    return <span className={`text-on-surface-variant ${className}`}>Sin vencimiento</span>;
  }

  const days = daysUntil(periodEnd);
  const tone = expiryTone(periodEnd);

  return (
    <span className={`block ${className}`}>
      <span
        className={`block tabular-nums ${
          tone === "expired" ? "text-error-dim font-semibold" : "text-on-surface"
        }`}
      >
        {formatExpiryDate(periodEnd)}
      </span>
      <span
        className={`block text-[11px] mt-0.5 ${
          tone === "expired"
            ? "text-error-dim"
            : tone === "soon"
              ? "text-warning font-semibold"
              : "text-on-surface-variant"
        }`}
      >
        {expiryLabel(days)}
      </span>
    </span>
  );
}
