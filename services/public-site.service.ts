import { createClient } from "@/utils/supabase/client";
import type {
  BookingInput,
  BookingResult,
  DaySlot,
  DayAvailability,
  SlotState,
} from "@/services/public-site.types";

/**
 * Visitor-side I/O for the public micro-site.
 *
 * Runs in the browser with the `anon` key and reaches only the two SECURITY
 * DEFINER RPCs granted to that role. No table is touched directly.
 */

/**
 * Bookable start times ("HH:MM") for a service on a given day.
 *
 * `staffId = null` means "cualquier profesional": the RPC then treats the shop's
 * whole active roster as capacity, so a slot stays open until every one of them
 * is busy.
 */
export async function fetchSlots(
  slug: string,
  serviceId: string,
  date: string,
  staffId: string | null,
): Promise<string[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_slots", {
    p_slug: slug,
    p_service_id: serviceId,
    p_date: date,
    // The SQL parameters carry defaults, so the generated types make them
    // optional (`string | undefined`) rather than nullable. Omitting is what
    // "cualquier profesional" means to Postgres anyway.
    p_staff_id: staffId ?? undefined,
  });

  if (error) throw error;
  return ((data ?? []) as { slot_time: string }[]).map((row) => row.slot_time);
}

/**
 * Every slot of a day with its state, for the calendar grid.
 *
 * Separate from `fetchSlots` on purpose: that one answers "what can I book" and
 * is what the server re-validates against. This one answers "what does the day
 * look like", including the busy slots the grid renders as "Reservado".
 */
export async function fetchDaySlots(
  slug: string,
  serviceId: string,
  date: string,
  staffId: string | null,
): Promise<DaySlot[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_day_slots", {
    p_slug: slug,
    p_service_id: serviceId,
    p_date: date,
    p_staff_id: staffId ?? undefined,
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
): Promise<DayAvailability[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("public_site_availability", {
    p_slug: slug,
    p_service_id: serviceId,
    p_from: from,
    p_days: days,
    p_staff_id: staffId ?? undefined,
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
