import { toMinutes } from "@/lib/calendar-layout";

/**
 * Estados de una cita y lo que la pantalla hace con ellos. `no_show` ("No vino")
 * es el cliente que no se presentó: libera el horario igual que una cancelada
 * (mismo criterio que `appointments_prevent_staff_overlap` y la reserva pública).
 */
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

/** Orden del filtro "Estado" y de la leyenda. */
export const APPOINTMENT_STATUSES: { value: AppointmentStatus; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "No vino" },
];

/** Estados que NO ocupan el horario: no chocan con otra cita ni restan cupo. */
export const SLOT_FREEING_STATUSES: readonly AppointmentStatus[] = ["cancelled", "no_show"];

export function freesSlot(status: string | null | undefined): boolean {
  return SLOT_FREEING_STATUSES.includes((status ?? "pending") as AppointmentStatus);
}

export function statusLabel(status: string): string {
  return APPOINTMENT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** "Ahora" en el reloj local: el día ('YYYY-MM-DD') y los minutos desde la medianoche. */
export interface LocalNow {
  date: string;
  minutes: number;
}

interface TimedAppointment {
  appointment_date: string;
  start_time: string;
}

/** ¿Ya llegó la hora de la cita? (empezó, aunque no haya terminado). */
export function hasStarted(appointment: TimedAppointment, now: LocalNow): boolean {
  if (appointment.appointment_date !== now.date) return appointment.appointment_date < now.date;
  return toMinutes(appointment.start_time) <= now.minutes;
}

/**
 * "Marcar como no vino": solo cuando ya pasó la hora (antes, lo que corresponde
 * es cancelar), sobre una cita que seguía en agenda y que nadie cobró.
 */
export function canMarkNoShow(
  appointment: TimedAppointment & { status: string; sale_id?: string | null },
  now: LocalNow,
): boolean {
  if (appointment.status !== "pending" && appointment.status !== "confirmed") return false;
  if (appointment.sale_id) return false;
  return hasStarted(appointment, now);
}
