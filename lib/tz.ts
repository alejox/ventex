/**
 * Días de calendario en la zona horaria del NEGOCIO, no la del dispositivo.
 *
 * Reportes y Panel cortaban el día con la zona del navegador, mientras que el
 * gasto que nace de un retiro de caja se fecha con `business_sites.timezone`
 * en la base. Un dueño mirando desde otra zona (de viaje, o con el reloj del
 * computador mal puesto) veía ventas de las 23:00 en el día siguiente y el
 * gasto del mismo retiro en el anterior. Estas funciones son puras: la zona se
 * pasa por parámetro y `Intl` hace la conversión, sin librerías.
 */

/** ¿`Intl` conoce esta zona? Un valor inválido no puede tirar la pantalla. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(tz: string, instant: Date) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Día de calendario "YYYY-MM-DD" que marca el reloj de `tz` en `instant`. */
export function calendarDayIn(tz: string, instant: Date = new Date()): string {
  const p = partsIn(tz, instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Cuánto adelanta (ms) el reloj de `tz` a UTC en `instant`. Bogotá: −5 h. */
function offsetMs(tz: string, instant: Date): number {
  const p = partsIn(tz, instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Instante de la medianoche de `day` ("YYYY-MM-DD") en `tz`.
 *
 * Se estima con el desfase del momento y se corrige una vez: alcanza para los
 * cambios de horario (el desfase de la medianoche puede no ser el del mediodía).
 */
export function zonedMidnight(day: string, tz: string): Date {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const wall = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  let guess = wall - offsetMs(tz, new Date(wall));
  const corrected = wall - offsetMs(tz, new Date(guess));
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** Mes "YYYY-MM" de un instante, en la zona `tz`. */
export function monthKeyIn(tz: string, iso: string | Date): string {
  return calendarDayIn(tz, typeof iso === "string" ? new Date(iso) : iso).slice(0, 7);
}
