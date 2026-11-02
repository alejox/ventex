/**
 * Human-readable day of an appointment: "Hoy", "Mañana", "Ayer" or
 * "lun 3 nov" (with the year only when it differs from today's).
 *
 * Both arguments are calendar days ("YYYY-MM-DD", any time suffix ignored).
 * The caller decides what "today" is (business or device clock), so this stays
 * pure and timezone-safe: days are compared as UTC midnights and formatted with
 * `timeZone: "UTC"`, never parsed as local `Date`s that could shift the day.
 */

const DAY_MS = 86_400_000;

const PARTS = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function utcDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatAppointmentDay(day: string, today: string): string {
  const target = utcDay(day);
  const base = utcDay(today);
  if (target === null || base === null) return day;

  const diff = Math.round((target - base) / DAY_MS);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";

  const parts: Record<string, string> = {};
  for (const part of PARTS.formatToParts(new Date(target))) {
    if (part.type !== "literal") parts[part.type] = part.value.replace(/\.$/, "");
  }
  const label = `${parts.weekday} ${parts.day} ${parts.month}`;
  return parts.year === today.slice(0, 4) ? label : `${label} ${parts.year}`;
}
