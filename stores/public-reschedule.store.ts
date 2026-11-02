import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as publicSiteService from "@/services/public-site.service";
import type {
  DayAvailability,
  DaySlot,
  RescheduleResult,
} from "@/services/public-site.types";

/**
 * Visitor-side "Cambiar fecha" state for the public micro-site lookup modal.
 *
 * Separate from `public-booking.store`: the booking widget can be mounted on
 * the same page, and sharing its slot/availability cache would make each one
 * overwrite the other's answer. Keys include the appointment being moved,
 * because the slot RPCs exclude it (its own row never blocks its new time).
 * "Loading" is a key mismatch, as in the booking store (`loadStatusOf`).
 */

export function rescheduleSlotKeyOf(appointmentId: string, date: string): string {
  return `${appointmentId}|${date}`;
}

interface PublicRescheduleState {
  slotKey: string | null;
  slots: DaySlot[];
  slotErrorKey: string | null;
  /** Appointment id the availability belongs to. */
  availabilityKey: string | null;
  availability: DayAvailability[];
  availabilityErrorKey: string | null;
  saving: boolean;
  error: string | null;
  loadAvailability: (input: {
    slug: string;
    appointmentId: string;
    serviceId: string;
    staffId: string | null;
    from: string;
    days: number;
  }) => Promise<void>;
  loadDay: (input: {
    slug: string;
    appointmentId: string;
    serviceId: string;
    staffId: string | null;
    date: string;
  }) => Promise<void>;
  reschedule: (input: {
    slug: string;
    phone: string;
    appointmentId: string;
    date: string;
    time: string;
  }) => Promise<RescheduleResult | null>;
  clearError: () => void;
  reset: () => void;
}

const INITIAL = {
  slotKey: null,
  slots: [],
  slotErrorKey: null,
  availabilityKey: null,
  availability: [],
  availabilityErrorKey: null,
  saving: false,
  error: null,
} satisfies Partial<PublicRescheduleState>;

export const usePublicRescheduleStore = create<PublicRescheduleState>((set) => ({
  ...INITIAL,

  loadAvailability: async ({ slug, appointmentId, serviceId, staffId, from, days }) => {
    const key = appointmentId;
    set((s) =>
      s.availabilityErrorKey === key ? { availabilityKey: null, availabilityErrorKey: null } : {},
    );
    try {
      const availability = await publicSiteService.fetchAvailability(
        slug,
        serviceId,
        from,
        days,
        staffId,
        appointmentId,
      );
      set({ availabilityKey: key, availability, availabilityErrorKey: null });
    } catch {
      set({ availabilityKey: key, availability: [], availabilityErrorKey: key });
    }
  },

  loadDay: async ({ slug, appointmentId, serviceId, staffId, date }) => {
    const key = rescheduleSlotKeyOf(appointmentId, date);
    set((s) => (s.slotErrorKey === key ? { slotKey: null, slotErrorKey: null } : {}));
    try {
      const slots = await publicSiteService.fetchDaySlots(slug, serviceId, date, staffId, appointmentId);
      set({ slotKey: key, slots, slotErrorKey: null });
    } catch {
      set({ slotKey: key, slots: [], slotErrorKey: key });
    }
  },

  reschedule: async ({ slug, phone, appointmentId, date, time }) => {
    set({ saving: true, error: null });
    try {
      const result = await publicSiteService.rescheduleAppointment(slug, phone, appointmentId, date, time);
      set({ saving: false });
      return result;
    } catch (e) {
      set({ saving: false, error: toMessage(e) });
      return null;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(INITIAL),
}));
