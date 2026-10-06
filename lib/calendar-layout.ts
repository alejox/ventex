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

// ---- Vista y encabezado del calendario ----

export type CalendarView = "month" | "week" | "day";

/** Por debajo de esto la semana no entra (7 columnas ≈ 792px) y se abre en Día. */
export const NARROW_CALENDAR_QUERY = "(max-width: 767px)";

/**
 * Vista con la que abre el calendario. La que eligió la persona manda siempre;
 * si no eligió ninguna (`null`), decide la pantalla: Día en el teléfono,
 * Semana en el resto.
 */
export function initialCalendarView(chosen: CalendarView | null, narrow: boolean): CalendarView {
  if (chosen) return chosen;
  return narrow ? "day" : "week";
}

/**
 * Filtro de persona con el que abre el calendario. Un trabajador con ficha
 * (`staff_id`) abre en "Mis citas": lo primero que necesita es su propia agenda,
 * no la de todo el equipo. Puede pasar a "Todas las personas" cuando quiera.
 */
export function initialStaffFilter(isWorker: boolean, staffId: string | null | undefined): string {
  return isWorker && staffId ? staffId : "all";
}

/** Lee lo guardado en `localStorage` sin confiar en lo que haya ahí. */
export function parseCalendarView(raw: string | null | undefined): CalendarView | null {
  return raw === "month" || raw === "week" || raw === "day" ? raw : null;
}

const MONTHS_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Rango de la semana como lo diría una persona: "6 – 12 oct" dentro del mismo
 * mes, "29 sep – 5 oct" cuando cruza, y con año solo si cruza de año. Antes se
 * armaba con el mes de la fecha actual y la semana del 29 al 5 decía
 * "29 - 5 Octubre", como si el 29 fuera de octubre.
 */
export function formatWeekRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const tail = `${end.getDate()} ${MONTHS_SHORT_ES[end.getMonth()]}${sameYear ? "" : ` ${end.getFullYear()}`}`;
  if (sameMonth) return `${start.getDate()} – ${tail}`;
  const head = `${start.getDate()} ${MONTHS_SHORT_ES[start.getMonth()]}${sameYear ? "" : ` ${start.getFullYear()}`}`;
  return `${head} – ${tail}`;
}
