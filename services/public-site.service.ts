import { createClient } from "@/utils/supabase/client";
import type {
  BookingInput,
  BookingResult,
  CancelAppointmentResult,
  DaySlot,
  RescheduleResult,
  DayAvailability,
  SlotState,
  UpcomingAppointment,
} from "@/services/public-site.types";

/**
 * Visitor-side I/O for the public micro-site.
 *
 * Runs in the browser with the `anon` key and reaches only the two SECURITY
 * DEFINER RPCs granted to that role. No table is touched directly.
 */

/**
 * Every slot of a day with its state, for the calendar grid, including the
 * busy slots the grid renders as "Reservado".
 *
 * The re-validation against double-booking happens server-side, inside the
 * booking RPC itself (it calls `public_site_slots` in SQL before confirming) —
 * not through a client-side pre-check.
 */
export async function fetchDaySlots(
  slug: string,
  serviceId: string,
  date: string,
  staffId: string | null,
  /** The appointment being rescheduled: its own row must not block a slot. */
  excludeAppointmentId: string | null = null,
): Promise<DaySlot[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_day_slots", {
    p_slug: slug,
    p_service_id: serviceId,
    p_date: date,
    p_staff_id: staffId ?? undefined,
    p_exclude_appointment_id: excludeAppointmentId ?? undefined,
  });

  if (error) throw error;
  return ((data ?? []) as { slot_time: string; slot_state: string }[]).map((row) => ({
    time: row.slot_time,
    state: row.slot_state as SlotState,
  }));
}

/** How many slots each of the next `days` days still has free. */
export async function fetchAvailability(
  slug: string,
  serviceId: string,
  from: string,
  days: number,
  staffId: string | null,
  excludeAppointmentId: string | null = null,
): Promise<DayAvailability[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_availability", {
    p_slug: slug,
    p_service_id: serviceId,
    p_from: from,
    p_days: days,
    p_staff_id: staffId ?? undefined,
    p_exclude_appointment_id: excludeAppointmentId ?? undefined,
  });

  if (error) throw error;
  return ((data ?? []) as { day: string; is_open: boolean; free_slots: number }[]).map((row) => ({
    date: row.day,
    isOpen: row.is_open,
    freeSlots: row.free_slots,
  }));
}

/**
 * Creates the appointment as `pending` in the tenant's own agenda.
 *
 * The RPC re-validates the slot server-side: the list this browser holds may be
 * stale, and a visitor is never trusted to pick a legal time on their own.
 */
export async function bookAppointment(input: BookingInput): Promise<BookingResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_book", {
    p_slug: input.slug,
    p_service_id: input.serviceId,
    p_date: input.date,
    p_time: input.time,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_staff_id: input.staffId ?? undefined,
    p_notes: input.notes ?? undefined,
  });

  if (error) throw error;
  // The RPC returns jsonb, which the generated types widen to `Json`. The shape
  // is fixed by public_site_book itself — see BookingResult.
  return data as unknown as BookingResult;
}

type RpcError = { message?: string; code?: string };

/**
 * RPC not yet in `database.types.ts` (migration 20261101100000), with `this`
 * bound. Regenerating the types makes this unnecessary.
 */
function untypedRpc<T>(fn: string, args: Record<string, unknown>) {
  const supabase = createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: T | null; error: RpcError | null }>;
  return rpc(fn, args);
}

/**
 * Upcoming `pending|confirmed` appointments booked with this phone on this
 * site. The RPC matches the last 10 digits (see `phoneLookupKey`) and returns
 * an empty list for a phone too short to match safely.
 */
export async function findAppointments(
  slug: string,
  phone: string,
): Promise<UpcomingAppointment[]> {
  const { data, error } = await untypedRpc<UpcomingAppointment[]>(
    "public_site_find_appointments",
    { p_slug: slug, p_phone: phone },
  );

  if (error) throw error;
  return data ?? [];
}

/**
 * Cancels one of those appointments. Idempotent: an already-cancelled one
 * comes back with `already: true`. Raises `CITA_NO_ENCONTRADA` (not this
 * phone's, or gone) or `CITA_NO_CANCELABLE` (completed or already started),
 * which `toMessage` translates.
 */
export async function cancelAppointment(
  slug: string,
  phone: string,
  appointmentId: string,
): Promise<CancelAppointmentResult> {
  const { data, error } = await untypedRpc<CancelAppointmentResult>(
    "public_site_cancel_appointment",
    { p_slug: slug, p_phone: phone, p_appointment_id: appointmentId },
  );

  if (error) throw error;
  if (!data) throw new Error("No pudimos cancelar la cita. Intenta de nuevo.");
  return data;
}

/**
 * Moves one of those appointments to another free slot (same service, same
 * professional) and leaves it `pending` (migration 20261102100000). Raises
 * `CITA_NO_ENCONTRADA`, `CITA_NO_REPROGRAMABLE` (translated by `toMessage`)
 * or a Spanish business message such as "Ese horario ya fue tomado…".
 */
export async function rescheduleAppointment(
  slug: string,
  phone: string,
  appointmentId: string,
  date: string,
  time: string,
): Promise<RescheduleResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_reschedule_appointment", {
    p_slug: slug,
    p_appointment_id: appointmentId,
    p_phone: phone,
    p_date: date,
    p_time: time,
  });

  if (error) throw error;
  if (!data) throw new Error("No pudimos cambiar la cita. Intenta de nuevo.");
  // jsonb widens to `Json`; the shape is fixed by the RPC — see RescheduleResult.
  return data as unknown as RescheduleResult;
}
