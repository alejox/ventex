import { isValidTimeZone, zonedMidnight } from "@/lib/tz";

/**
 * "Agregar a mi calendario" de la pantalla de reserva confirmada: un enlace de
 * Google Calendar y un archivo .ics, los dos armados en el navegador (sin
 * servidor). Funciones puras: el "ahora" del DTSTAMP entra por parámetro.
 *
 * Zona horaria: la cita es a la hora del NEGOCIO (`PublicSite.timezone`), así
 * que con una zona válida se convierte a un instante UTC (`…Z`) y el calendario
 * del visitante la muestra bien aunque esté de viaje. Sin zona usable se emite
 * hora FLOTANTE (sin `Z` ni `TZID`): el calendario la toma como hora local del
 * dispositivo, que es lo correcto para quien reserva desde la misma ciudad.
 *
 * El instante se calcula como medianoche del día en la zona + la hora de la
 * cita. En un día con cambio de horario antes de la cita quedaría corrida una
 * hora; Colombia no tiene cambio de horario y la cita es un recordatorio, no
 * un cobro.
 */

export interface BookingEvent {
  /** Id de la cita: hace única la entrada del .ics (re-importar no duplica). */
  uid: string;
  title: string;
  /** "YYYY-MM-DD", hora del negocio. */
  date: string;
  /** "HH:MM", hora del negocio. */
  time: string;
  durationMinutes: number;
  timeZone?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface EventTimes {
  /** `YYYYMMDDTHHMMSS` (+`Z` si no es flotante). */
  start: string;
  end: string;
  floating: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha/hora básica iCalendar con los campos UTC de `d`. */
function basicUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function eventTimes(event: BookingEvent): EventTimes {
  const [h, m] = event.time.split(":").map(Number);
  const offsetMs = ((h || 0) * 60 + (m || 0)) * 60_000;
  const durationMs = Math.max(0, event.durationMinutes) * 60_000;

  if (isValidTimeZone(event.timeZone)) {
    const start = new Date(zonedMidnight(event.date, event.timeZone).getTime() + offsetMs);
    const end = new Date(start.getTime() + durationMs);
    return { start: `${basicUtc(start)}Z`, end: `${basicUtc(end)}Z`, floating: false };
  }

  // Flotante: se hace la cuenta en UTC solo como aritmética de reloj de pared.
  const [y, mo, d] = event.date.split("-").map(Number);
  const start = new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1) + offsetMs);
  const end = new Date(start.getTime() + durationMs);
  return { start: basicUtc(start), end: basicUtc(end), floating: true };
}

/** Escapa un valor TEXT de iCalendar (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Parte una línea de contenido en tramos de 75 OCTETOS como máximo (RFC 5545
 * §3.1), continuando con CRLF + espacio. Cuenta bytes UTF-8 y nunca corta un
 * carácter por la mitad: "ñ" son dos bytes.
 */
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // La primera línea admite 75; las siguientes 74 + el espacio inicial.
    if (bytes + size > 75) {
      out.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

const filled = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim() !== "";

/** Archivo .ics con una sola cita, líneas terminadas en CRLF. */
export function buildIcs(event: BookingEvent, now: Date): string {
  const { start, end } = eventTimes(event);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ventex//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@ventex`,
    `DTSTAMP:${basicUtc(now)}Z`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (filled(event.location)) lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  if (filled(event.description)) lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Enlace "Agregar a Google Calendar" con la cita precargada. */
export function googleCalendarUrl(event: BookingEvent): string {
  const { start, end } = eventTimes(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  });
  if (filled(event.description)) params.set("details", event.description.trim());
  if (filled(event.location)) params.set("location", event.location.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
