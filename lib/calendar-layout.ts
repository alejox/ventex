/**
 * Geometría de la vista de semana/día: cada cita ocupa el tramo de su horario,
 * como en Google Calendar, y las que se pisan se reparten el ancho.
 */

/** "HH:MM" o "HH:MM:SS" a minutos desde la medianoche. */
export function toMinutes(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** Una cita muy corta se dibuja igual de legible: alto mínimo, en minutos. */
export const MIN_VISUAL_MINUTES = 30;

export interface LayoutInput {
  id: string;
  start: number;
  end: number;
}

export interface Placed extends LayoutInput {
  /** Fin usado para dibujar y para decidir si se pisa con otra. */
  visualEnd: number;
  column: number;
  columns: number;
}

/**
 * Reparte las citas de UN día en columnas.
 *
 * Se agrupan en "racimos" de citas que se pisan entre sí (en cadena: A pisa B y
 * B pisa C aunque A no pise C) y cada racimo se reparte su ancho en tantas
 * columnas como citas simultáneas haya como máximo. Las que no se pisan con
 * nadie ocupan el ancho completo.
 */
export function layoutDay(items: LayoutInput[]): Placed[] {
  const sorted = items
    .map((item) => ({ ...item, visualEnd: Math.max(item.end, item.start + MIN_VISUAL_MINUTES) }))
    .sort((a, b) => a.start - b.start || b.visualEnd - a.visualEnd);

  const result: Placed[] = [];
  let cluster: Placed[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const placed of cluster) placed.columns = columnEnds.length;
    result.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();

    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.visualEnd);
    } else {
      columnEnds[column] = item.visualEnd;
    }
    cluster.push({ ...item, column, columns: 1 });
    clusterEnd = cluster.length === 1 ? item.visualEnd : Math.max(clusterEnd, item.visualEnd);
  }
  if (cluster.length > 0) flush();
  return result;
}

/**
 * Rango de horas a mostrar: el de trabajo (por defecto 7–21) ampliado para que
 * ninguna cita quede fuera de la cuadrícula.
 */
export function visibleHourRange(
  starts: number[],
  ends: number[],
  defaults = { from: 7, to: 21 },
): { from: number; to: number } {
  let from = defaults.from;
  let to = defaults.to;
  for (const minutes of starts) from = Math.min(from, Math.floor(minutes / 60));
  for (const minutes of ends) to = Math.max(to, Math.ceil(minutes / 60));
  return { from: Math.max(0, from), to: Math.min(24, to) };
}

/** Redondea a media hora hacia abajo: dónde cae un clic sobre un hueco. */
export function snapToHalfHour(minutes: number): number {
  return Math.floor(minutes / 30) * 30;
}

export function minutesToTime(total: number): string {
  const clamped = Math.min(Math.max(total, 0), 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
