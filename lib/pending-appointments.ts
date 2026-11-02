/**
 * "Pendientes" del calendario: TODAS las reservas sin confirmar del negocio,
 * no solo las del período en pantalla. Se piden aparte del calendario
 * (`fetchPendingAppointments`) y el store las mantiene al día con estas
 * funciones puras cuando una cita se confirma, cancela, edita o borra.
 */

interface PendingLike {
  id: string;
  appointment_date: string;
  start_time: string;
  status: string;
  staff_id: string | null;
}

/** Fecha y hora ascendentes; desempate por id para un orden estable. */
export function sortByDateTime<T extends PendingLike>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) =>
      a.appointment_date.localeCompare(b.appointment_date) ||
      a.start_time.slice(0, 5).localeCompare(b.start_time.slice(0, 5)) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Refleja en la lista el estado nuevo de una cita: si sigue pendiente entra (o
 * se reemplaza) en su lugar; si no, sale.
 */
export function upsertPending<T extends PendingLike>(list: readonly T[], appointment: T): T[] {
  const rest = list.filter((a) => a.id !== appointment.id);
  return appointment.status === "pending" ? sortByDateTime([...rest, appointment]) : rest;
}

export function removePending<T extends PendingLike>(list: readonly T[], id: string): T[] {
  return list.filter((a) => a.id !== id);
}

/** Vencida: el día ya pasó y nadie la confirmó ni la canceló. `today` = 'YYYY-MM-DD' local. */
export function isOverdue(appointment: Pick<PendingLike, "appointment_date">, today: string): boolean {
  return appointment.appointment_date < today;
}

/** Mismo filtro "Persona" del calendario: todas, sin asignar o una persona. */
export function byStaffFilter<T extends PendingLike>(list: readonly T[], staffFilter: string): T[] {
  if (staffFilter === "all") return [...list];
  return list.filter((a) => (staffFilter === "unassigned" ? !a.staff_id : a.staff_id === staffFilter));
}
