import { conflictsFor, type BusyAppointment } from "@/lib/appointment-availability";

/**
 * Geometría de arrastrar una cita en la grilla (mover) o estirar su borde
 * inferior (cambiar la duración). Todo en minutos desde la medianoche; la
 * pantalla convierte píxeles con `pixelsToMinutes`.
 */

/** Los cambios caen cada 15 minutos: más fino es imposible de acertar con el dedo. */
export const DRAG_SNAP_MINUTES = 15;
/** Una cita nunca queda más corta que esto al estirarla. */
export const MIN_DURATION_MINUTES = 15;
/** Movimiento mínimo (px) para que un toque cuente como arrastre y no como clic. */
export const DRAG_THRESHOLD_PX = 5;
/** En pantallas táctiles el arrastre arranca tras mantener presionado: si no, no se podría hacer scroll. */
export const LONG_PRESS_MS = 350;

export type DragMode = "move" | "resize";

export interface Span {
  start: number;
  end: number;
}

export function pixelsToMinutes(px: number, hourPx: number): number {
  return (px / hourPx) * 60;
}

/** Redondea al múltiplo de `step` más cercano (sin devolver "-0"). */
export function snapMinutes(minutes: number, step = DRAG_SNAP_MINUTES): number {
  const snapped = Math.round(minutes / step) * step;
  return snapped === 0 ? 0 : snapped;
}

/**
 * El tramo nuevo tras arrastrar `delta` minutos.
 *
 * - `move`: se corre entero y conserva la duración. El salto es RELATIVO
 *   (múltiplo de 15 sobre la hora original): una cita de 9:10 pasa a 9:25,
 *   9:40… y no se "redondea" sola a 9:15 por tocarla.
 * - `resize`: solo cambia el fin, nunca por debajo de 15 min de duración.
 *
 * Siempre queda dentro de `bounds` (la ventana visible de la grilla).
 */
export function dragSpan(original: Span, delta: number, mode: DragMode, bounds: Span = { start: 0, end: 24 * 60 }): Span {
  const step = snapMinutes(delta);
  if (mode === "resize") {
    const end = Math.min(original.end + step, bounds.end);
    return { start: original.start, end: Math.max(end, original.start + MIN_DURATION_MINUTES) };
  }
  const duration = original.end - original.start;
  const latest = Math.max(bounds.end - duration, bounds.start);
  const start = Math.min(Math.max(original.start + step, bounds.start), latest);
  return { start, end: start + duration };
}

/** Columna (día) bajo el puntero en la vista de semana. */
export function columnAt(clientX: number, left: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  const index = Math.floor(((clientX - left) / width) * count);
  return Math.min(Math.max(index, 0), count - 1);
}

export type RescheduleCheck = { ok: true } | { ok: false; conflict: BusyAppointment };

/**
 * ¿Se puede soltar la cita ahí? La misma regla que el formulario
 * (`conflictsFor`): su persona no puede tener otra cita que se pise. Una cita
 * sin persona asignada no choca con nadie (la base tampoco la frena).
 */
export function checkReschedule(
  busy: BusyAppointment[],
  appointment: { id: string; staff_id: string | null },
  start: string,
  end: string,
): RescheduleCheck {
  if (!appointment.staff_id) return { ok: true };
  const conflicts = conflictsFor(busy, appointment.staff_id, start, end, appointment.id);
  return conflicts.length > 0 ? { ok: false, conflict: conflicts[0] } : { ok: true };
}

/** Swipe horizontal claro (y no un scroll vertical torcido): dirección o null. */
export function swipeDirection(dx: number, dy: number, minDistance = 60): "prev" | "next" | null {
  if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "prev";
}
