/**
 * Columnas de la vista Día por persona: quién atiende qué, una al lado de la
 * otra. Puro: la grilla solo dibuja lo que esto decide.
 */

/** Clave de la columna de las citas sin persona asignada. */
export const UNASSIGNED_COLUMN = "unassigned";

export interface StaffColumn {
  key: string;
  /** null = "Sin asignar". */
  staffId: string | null;
  name: string;
  photoUrl: string | null;
}

interface StaffLike {
  id: string;
  full_name: string;
  photo_url?: string | null;
}

interface ColumnAppointment {
  staff_id: string | null;
  staff?: { full_name: string } | null;
}

const unassignedColumn: StaffColumn = { key: UNASSIGNED_COLUMN, staffId: null, name: "Sin asignar", photoUrl: null };

const columnOf = (member: StaffLike): StaffColumn => ({
  key: member.id,
  staffId: member.id,
  name: member.full_name,
  photoUrl: member.photo_url ?? null,
});

/**
 * Columnas a mostrar para un día.
 *
 * - `filter` es el de "Persona": `all`, `unassigned` o el id de alguien.
 * - Con `all`: el equipo activo en su orden, más quien tenga citas ese día y ya
 *   no esté activo (si no, sus citas desaparecerían), más "Sin asignar" solo si
 *   hay citas sin persona.
 * - Sin nadie en el equipo devuelve `[]`: una sola columna "Sin asignar" no
 *   dice nada que la grilla de un día no diga ya.
 */
export function staffColumnsFor(staff: StaffLike[], appointments: ColumnAppointment[], filter: string): StaffColumn[] {
  if (filter === UNASSIGNED_COLUMN) return [unassignedColumn];
  if (filter !== "all") {
    const member = staff.find((s) => s.id === filter);
    if (member) return [columnOf(member)];
    const fromAppointment = appointments.find((a) => a.staff_id === filter);
    return [{ key: filter, staffId: filter, name: fromAppointment?.staff?.full_name ?? "Otra persona", photoUrl: null }];
  }
  if (staff.length === 0) return [];

  const columns = staff.map(columnOf);
  const known = new Set(columns.map((c) => c.key));
  for (const appointment of appointments) {
    if (!appointment.staff_id || known.has(appointment.staff_id)) continue;
    known.add(appointment.staff_id);
    columns.push({ key: appointment.staff_id, staffId: appointment.staff_id, name: appointment.staff?.full_name ?? "Otra persona", photoUrl: null });
  }
  if (appointments.some((a) => !a.staff_id)) columns.push(unassignedColumn);
  return columns;
}

/** Las citas de cada columna; las que no tienen columna a la vista quedan fuera. */
export function groupByColumn<T extends ColumnAppointment>(appointments: T[], columns: StaffColumn[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const column of columns) grouped[column.key] = [];
  for (const appointment of appointments) {
    grouped[appointment.staff_id ?? UNASSIGNED_COLUMN]?.push(appointment);
  }
  return grouped;
}

/** "Ana Pérez" → "AP": primera letra del primer y del último nombre. */
export function staffInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}
