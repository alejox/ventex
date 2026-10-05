/**
 * Minutos → cómo lo dice una persona.
 *
 * Los servicios se cargan en minutos porque es lo que se suma y se compara,
 * pero nadie piensa "90 minutos" para un corte con barba: piensa "hora y
 * media". La base sigue en minutos; esto es solo cómo se lee en pantalla.
 *
 *   30  → "30 min"
 *   60  → "1 hora"
 *   90  → "1 hora y media"
 *   75  → "1 hora 15 min"
 *   120 → "2 horas"
 *   150 → "2 horas y media"
 */
export function formatDuration(minutes: number | null | undefined): string {
  const total = Math.round(Number(minutes));
  if (!Number.isFinite(total) || total <= 0) return "";
  if (total < 60) return `${total} min`;

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const hoursLabel = `${hours} ${hours === 1 ? "hora" : "horas"}`;

  if (rest === 0) return hoursLabel;
  if (rest === 30) return `${hoursLabel} y media`;
  return `${hoursLabel} ${rest} min`;
}
