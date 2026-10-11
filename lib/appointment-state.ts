import type { Appointment } from "@/services/appointments.service";

/** La reserva abierta desde un enlace puede ser más reciente que el calendario. */
export function currentAppointment(original: Appointment | null | undefined, appointments: Appointment[], linked: Appointment | null): Appointment | null {
  if (!original) return null;
  if (linked?.id === original.id) return linked;
  return appointments.find((a) => a.id === original.id) ?? original;
}
