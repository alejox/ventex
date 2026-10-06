import { minutesToTime, toMinutes } from "@/lib/calendar-layout";

/**
 * Horario de atención del negocio, un día de la semana. Es la tabla
 * `business_hours` (la que se edita en "Página web → Horarios de reserva" y la
 * misma que ofrece los turnos de la reserva pública): `weekday` va de
 * 0 = domingo a 6 = sábado, igual que `Date.getDay()`.
 */
export interface OpeningHour {
  weekday: number;
  is_open: boolean;
  /** "HH:MM" (o "HH:MM:SS", que es como lo devuelve PostgREST). */
  opens_at: string;
  closes_at: string;
}

/** Rango de la grilla cuando el negocio no cargó horarios. */
export const DEFAULT_GRID_HOURS = { from: 7, to: 21 } as const;

export interface Interval {
  start: number;
  end: number;
}

/** Día de la semana de una fecha "YYYY-MM-DD", al mediodía local (sin saltos por zona horaria). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00`).getDay();
}

function hourOf(hours: OpeningHour[], weekday: number): OpeningHour | undefined {
  return hours.find((h) => h.weekday === weekday);
}

/**
 * Horas (enteras) que muestra la grilla: desde la apertura más temprana hasta
 * el cierre más tardío de los días a la vista. Si los días a la vista están
 * todos cerrados se usa el horario del resto de la semana (un domingo cerrado
 * se ve con la misma escala que el lunes, todo sombreado). Sin horario cargado,
 * o con la semana entera cerrada, queda el 7–21 de siempre.
 */
export function gridHourRange(hours: OpeningHour[] | null, weekdays: number[]): { from: number; to: number } {
  if (!hours || hours.length === 0) return { ...DEFAULT_GRID_HOURS };
  const openVisible = hours.filter((h) => h.is_open && weekdays.includes(h.weekday));
  const open = openVisible.length > 0 ? openVisible : hours.filter((h) => h.is_open);
  if (open.length === 0) return { ...DEFAULT_GRID_HOURS };
  const from = Math.max(0, Math.min(...open.map((h) => Math.floor(toMinutes(h.opens_at) / 60))));
  const to = Math.min(24, Math.max(...open.map((h) => Math.ceil(toMinutes(h.closes_at) / 60))));
  return { from, to: Math.max(to, from + 1) };
}

/**
 * Tramos CERRADOS de un día dentro de la ventana [fromMin, toMin), para
 * sombrearlos. Sin horario cargado no se sombrea nada: no hay dato, y pintar
 * "cerrado" por defecto mentiría.
 */
export function closedIntervals(hours: OpeningHour[] | null, weekday: number, fromMin: number, toMin: number): Interval[] {
  if (!hours || hours.length === 0) return [];
  const day = hourOf(hours, weekday);
  if (!day || !day.is_open) return [{ start: fromMin, end: toMin }];
  const opens = toMinutes(day.opens_at);
  const closes = toMinutes(day.closes_at);
  const out: Interval[] = [];
  if (opens > fromMin) out.push({ start: fromMin, end: Math.min(opens, toMin) });
  if (closes < toMin) out.push({ start: Math.max(closes, fromMin), end: toMin });
  return out.filter((i) => i.end > i.start);
}

/** ¿El tramo cae entero dentro del horario de ese día? Sin horario cargado, siempre sí. */
export function isWithinOpenHours(hours: OpeningHour[] | null, weekday: number, startMin: number, endMin: number): boolean {
  if (!hours || hours.length === 0) return true;
  const day = hourOf(hours, weekday);
  if (!day || !day.is_open) return false;
  return startMin >= toMinutes(day.opens_at) && endMin <= toMinutes(day.closes_at);
}

/** Inicios sugeridos de siempre: cada 30 min, de 6:00 a 22:00. */
export const FALLBACK_START_SLOTS: string[] = Array.from({ length: 33 }, (_, i) => minutesToTime(6 * 60 + i * 30));

/**
 * Horas de inicio que ofrece el selector para un día: solo dentro del horario
 * de atención, cada `step` minutos desde la apertura, y que una cita de `step`
 * minutos termine antes del cierre. Día cerrado: ninguna (queda "Otra hora…").
 * Sin horario cargado: las de siempre.
 */
export function openStartSlots(hours: OpeningHour[] | null, weekday: number, step = 30): string[] {
  if (!hours || hours.length === 0) return FALLBACK_START_SLOTS;
  const day = hourOf(hours, weekday);
  if (!day || !day.is_open) return [];
  const opens = toMinutes(day.opens_at);
  const closes = toMinutes(day.closes_at);
  const slots: string[] = [];
  for (let t = opens; t + step <= closes; t += step) slots.push(minutesToTime(t));
  return slots;
}

/** "Otra hora…": todo el día cada 15 minutos (00:00 … 23:45). */
export function quarterHourSlots(): string[] {
  return Array.from({ length: 96 }, (_, i) => minutesToTime(i * 15));
}
