import { create } from "zustand";
import * as staffService from "@/services/staff.service";
import type { StaffMember, NewStaffInput } from "@/services/staff.service";

interface StaffState {
  staff: StaffMember[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchStaff: () => Promise<void>;
  /** Devuelve true si el alta fue correcta (para que el componente cierre el modal). */
  addStaff: (input: NewStaffInput) => Promise<boolean>;
  updateStaff: (id: string, input: NewStaffInput) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useStaffStore = create<StaffState>((set) => ({
  staff: [],
  loading: false,
  error: null,
  submitting: false,

  fetchStaff: async () => {
    set({ loading: true, error: null });
    try {
      const staff = await staffService.fetchStaff();
      set({ staff, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addStaff: async (input) => {
    set({ submitting: true, error: null });
    try {
      const member = await staffService.createStaff(input);
      set((s) => ({ staff: [...s.staff, member], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateStaff: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const member = await staffService.updateStaff(id, input);
      set((s) => ({
        staff: s.staff.map((x) => (x.id === id ? member : x)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
