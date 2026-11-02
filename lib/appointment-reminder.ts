import { hasStarted, type LocalNow } from "@/lib/appointment-status";

/**
 * "Recordar por WhatsApp": el recordatorio de una cita confirmada que todavía
 * no llega. Lo manda una persona con un enlace `wa.me` (Ventex no usa la API de
 * WhatsApp a propósito, igual que el aviso de cancelación). Puro y testeado.
 */

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * 'YYYY-MM-DD' → "sábado 7 de noviembre". Se calcula sobre el texto (y el día
 * de la semana en UTC): `new Date('2026-11-07')` es medianoche UTC y en
 * Colombia se mostraría el 6.
 */
export function formatReminderDate(date: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} de ${MONTHS[month - 1]}`;
}

export interface ReminderInput {
  /** Nombre completo: se saluda solo con el primero. */
  customerName?: string | null;
  service?: string | null;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** Hora ya formateada en el formato del negocio (12 o 24 h). */
  time: string;
  businessName?: string | null;
}

const clean = (value: string | null | undefined): string | null =>
  value && value.trim() ? value.trim().replace(/\s+/g, " ") : null;

export function buildReminderMessage(input: ReminderInput): string {
  const firstName = clean(input.customerName)?.split(" ")[0] ?? null;
  const service = clean(input.service);
  const date = formatReminderDate(input.date);
  const time = clean(input.time);
  const business = clean(input.businessName);

  let cita = "te recordamos tu cita";
  if (service) cita += ` de ${service}`;
  if (date) cita += ` el ${date}`;
  if (time) cita += ` a las ${time}`;
  if (business) cita += ` en ${business}`;

  return `Hola${firstName ? ` ${firstName}` : ""}, ${cita}. Si no puedes asistir, avísanos por aquí.`;
}

/** Se recuerda lo confirmado que todavía no empezó (hoy más tarde o un día que viene). */
export function canRemind(
  appointment: { status: string; appointment_date: string; start_time: string },
  now: LocalNow,
): boolean {
  return appointment.status === "confirmed" && !hasStarted(appointment, now);
}
