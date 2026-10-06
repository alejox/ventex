import { toMinutes } from "@/lib/calendar-layout";

/** Lo mínimo de una cita para saber si ocupa a alguien: un día de agenda. */
export interface BusyAppointment {
  id: string;
  staff_id: string | null;
  start_time: string;
  end_time: string;
  title?: string | null;
}

const DEFAULT_MINUTES = 30;

function endOf(item: { start_time: string; end_time: string | null }): number {
  return item.end_time ? toMinutes(item.end_time) : toMinutes(item.start_time) + DEFAULT_MINUTES;
}

/** Dos tramos se pisan si cada uno empieza antes de que el otro termine. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Las citas de `staffId` que se pisan con el tramo (sin contar la que se edita). */
export function conflictsFor(busy: BusyAppointment[], staffId: string, start: string, end: string, excludeId?: string | null): BusyAppointment[] {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return busy.filter((a) => a.staff_id === staffId && a.id !== excludeId && overlaps(s, e, toMinutes(a.start_time), endOf(a)));
}

/** De `pool`, quiénes no tienen ninguna cita en ese tramo. */
export function freeStaff(busy: BusyAppointment[], pool: string[], start: string, end: string, excludeId?: string | null): string[] {
  return pool.filter((id) => conflictsFor(busy, id, start, end, excludeId).length === 0);
}

/**
 * A quién asignar una cita «sin asignar»: entre quienes están libres, quien
 * menos citas tenga ese día (reparte el trabajo); a igualdad, el primero del
 * `pool`. `null` si nadie está libre.
 */
export function pickStaff(busy: BusyAppointment[], pool: string[], start: string, end: string, excludeId?: string | null): string | null {
  const free = freeStaff(busy, pool, start, end, excludeId);
  if (free.length === 0) return null;
  const load = (id: string) => busy.filter((a) => a.staff_id === id && a.id !== excludeId).length;
  return free.reduce((best, id) => (load(id) < load(best) ? id : best), free[0]);
}

/**
 * ¿El tramo NO se puede reservar?
 *
 * Con una persona elegida: si ella tiene algo que se pisa. Sin elegir
 * (`staffId` null): si, de todo el equipo (`pool`), nadie queda libre. Las citas
 * antiguas sin persona ocupan un lugar del equipo sin saber de quién.
 */
export function isTaken(busy: BusyAppointment[], opts: { staffId: string | null; pool: string[] }, start: string, end: string, excludeId?: string | null): boolean {
  if (opts.staffId) return conflictsFor(busy, opts.staffId, start, end, excludeId).length > 0;
  if (opts.pool.length === 0) return false;
  const s = toMinutes(start);
  const e = toMinutes(end);
  const unassigned = busy.filter((a) => a.staff_id === null && a.id !== excludeId && overlaps(s, e, toMinutes(a.start_time), endOf(a))).length;
  return freeStaff(busy, opts.pool, start, end, excludeId).length - unassigned <= 0;
}
