import { longDateFmt, parseDateInput } from "@/lib/booking-month";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import type { DaySlot, SlotState, UpcomingAppointment } from "@/services/public-site.types";

/**
 * Pure rules of the public "Cambiar fecha" step (booking UX phase 4,
 * `public_site_reschedule_appointment`).
 */

/** A slot of the reschedule grid: `current` is the appointment's own time. */
export interface RescheduleSlot {
  time: string;
  state: SlotState | "current";
}

/**
 * Whether the lookup row can offer "Cambiar fecha". The RPC decides
 * (`reschedulable`: service still bookable, assigned person still on the
 * site); a payload without the field predates the feature and has no
 * `serviceId` to load the pickers with.
 */
export function canReschedule(appointment: UpcomingAppointment): boolean {
  return Boolean(appointment.serviceId) && appointment.reschedulable === true;
}

/**
 * The slot RPCs exclude the appointment being moved, so its own time comes
 * back `free`. Offering it as "new" would be a no-op the RPC rejects; it is
 * marked `current` instead, on its own day only.
 */
export function markCurrentSlot(
  slots: DaySlot[],
  date: string,
  appointment: Pick<UpcomingAppointment, "date" | "time">,
): RescheduleSlot[] {
  if (date !== appointment.date) return slots;
  return slots.map((slot) =>
    slot.time === appointment.time ? { time: slot.time, state: "current" } : slot,
  );
}

/** "martes, 17 de noviembre a las 3:30 PM" (business clock preference). */
export function rescheduleWhen(date: string, time: string, timeFormat?: TimeFormat): string {
  return `${longDateFmt.format(parseDateInput(date))} a las ${formatAppointmentTime(time, timeFormat)}`;
}
