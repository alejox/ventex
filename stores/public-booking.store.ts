import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as publicSiteService from "@/services/public-site.service";
import type {
  BookingInput,
  BookingResult,
  DaySlot,
  DayAvailability,
} from "@/services/public-site.types";

/**
 * Visitor-side booking state for the public micro-site.
 *
 * The calendar holds only what the visitor has picked; every call to the
 * database goes through here, per the project's component -> store -> service
 * rule.
 *
 * Both the day grid and the day strip are kept together with the query that
 * produced them (`key`), so a slow answer for an older
 * service/day/professional combination cannot overwrite a newer one, and
 * "loading" is derived from a key mismatch instead of a flag that would have to
 * be reset by hand.
 */

export function slotKeyOf(serviceId: string, date: string, staffId: string | null): string {
  return `${serviceId}|${date}|${staffId ?? ""}`;
}

export function availabilityKeyOf(
  serviceId: string,
  from: string,
  staffId: string | null,
): string {
  return `${serviceId}|${from}|${staffId ?? ""}`;
}

interface PublicBookingState {
  slotKey: string | null;
  slots: DaySlot[];
  availabilityKey: string | null;
  availability: DayAvailability[];
  booking: boolean;
  error: string | null;
  loadDay: (
    slug: string,
    serviceId: string,
    date: string,
    staffId: string | null,
  ) => Promise<void>;
  loadAvailability: (
    slug: string,
    serviceId: string,
    from: string,
    days: number,
    staffId: string | null,
  ) => Promise<void>;
  book: (input: BookingInput) => Promise<BookingResult | null>;
}

export const usePublicBookingStore = create<PublicBookingState>((set) => ({
  slotKey: null,
  slots: [],
  availabilityKey: null,
  availability: [],
  booking: false,
  error: null,

  loadDay: async (slug, serviceId, date, staffId) => {
    const key = slotKeyOf(serviceId, date, staffId);
    try {
      const slots = await publicSiteService.fetchDaySlots(slug, serviceId, date, staffId);
      set({ slotKey: key, slots, error: null });
    } catch (e) {
      set({ slotKey: key, slots: [], error: toMessage(e) });
    }
  },

  loadAvailability: async (slug, serviceId, from, days, staffId) => {
    const key = availabilityKeyOf(serviceId, from, staffId);
    try {
      const availability = await publicSiteService.fetchAvailability(
        slug,
        serviceId,
        from,
        days,
        staffId,
      );
      set({ availabilityKey: key, availability, error: null });
    } catch (e) {
      set({ availabilityKey: key, availability: [], error: toMessage(e) });
    }
  },

  book: async (input) => {
    set({ booking: true, error: null });
    try {
      const result = await publicSiteService.bookAppointment(input);
      set({ booking: false });
      return result;
    } catch (e) {
      set({ booking: false, error: toMessage(e) });
      return null;
    }
  },
}));
