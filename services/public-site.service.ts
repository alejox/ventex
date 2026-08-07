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
