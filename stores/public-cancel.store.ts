import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import { phoneLookupKey } from "@/lib/co-mobile";
import * as publicSiteService from "@/services/public-site.service";
import type { RescheduleResult, UpcomingAppointment } from "@/services/public-site.types";

/**
 * Visitor-side "cancel my appointment" state for the public micro-site.
 *
 * The visitor types the phone they booked with, sees their upcoming
 * appointments and cancels one. `searchedPhone` is the phone the current list
 * belongs to: cancelling always sends THAT phone, never whatever the input
 * holds after the visitor kept typing.
 */

interface PublicCancelState {
  /** null = no search yet (so the empty state is not shown before searching). */
  appointments: UpcomingAppointment[] | null;
  searchedPhone: string | null;
  searching: boolean;
  cancellingId: string | null;
  /** Last appointment cancelled in this session, for the success message. */
  cancelled: UpcomingAppointment | null;
  error: string | null;
  search: (slug: string, phone: string) => Promise<void>;
  cancel: (slug: string, appointmentId: string) => Promise<boolean>;
  /** Puts a rescheduled appointment's new date/time (and `pending`) in the list. */
  applyReschedule: (result: RescheduleResult) => void;
  reset: () => void;
}

const INITIAL = {
  appointments: null,
  searchedPhone: null,
  searching: false,
  cancellingId: null,
  cancelled: null,
  error: null,
} satisfies Partial<PublicCancelState>;

export const usePublicCancelStore = create<PublicCancelState>((set, get) => ({
  ...INITIAL,

  search: async (slug, phone) => {
    const key = phoneLookupKey(phone);
    if (!key) {
      set({ error: "Escribe el número de celular con el que reservaste.", appointments: null });
      return;
    }
    set({ searching: true, error: null, cancelled: null });
    try {
      const appointments = await publicSiteService.findAppointments(slug, key);
      set({ searching: false, appointments, searchedPhone: key });
    } catch (e) {
      set({ searching: false, appointments: null, searchedPhone: null, error: toMessage(e) });
    }
  },

  cancel: async (slug, appointmentId) => {
    const phone = get().searchedPhone;
    if (!phone) return false;
    set({ cancellingId: appointmentId, error: null });
    try {
      await publicSiteService.cancelAppointment(slug, phone, appointmentId);
      const list = get().appointments ?? [];
      set({
        cancellingId: null,
        cancelled: list.find((a) => a.id === appointmentId) ?? null,
        appointments: list.filter((a) => a.id !== appointmentId),
      });
      return true;
    } catch (e) {
      set({ cancellingId: null, error: toMessage(e) });
      return false;
    }
  },

  applyReschedule: (result) => {
    const list = get().appointments ?? [];
    const updated = list.map((a) =>
      a.id === result.id
        ? { ...a, date: result.date, time: result.time, status: result.status, staff: result.staff ?? a.staff }
        : a,
    );
    // Same order as the RPC: soonest first.
    updated.sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`));
    set({ appointments: updated, cancelled: null, error: null });
  },

  reset: () => set(INITIAL),
}));
