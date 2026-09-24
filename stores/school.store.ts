import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as schoolSettingsService from "@/services/school-settings.service";
import type { SchoolSettings, SchoolSettingsInput } from "@/services/school-settings.service";
import { SCHOOL_DEFAULTS } from "@/services/school-settings.service";
import * as schoolEnrollmentsService from "@/services/school-enrollments.service";
import type { SchoolSummary } from "@/services/school-enrollments.service";

interface SchoolState {
  settings: SchoolSettings;
  summary: SchoolSummary | null;
  /** El negocio tiene activo el módulo (según `/config/business` y lo servido). */
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;

  /** Marca el módulo como activo después de una compra/reactivación o login. */
  setEnabled: (value: boolean) => void;
  fetchSettings: () => Promise<void>;
  saveSettings: (input: SchoolSettingsInput) => Promise<boolean>;
  fetchSummary: () => Promise<void>;
}

export const useSchoolStore = create<SchoolState>((set) => ({
  settings: SCHOOL_DEFAULTS,
  summary: null,
  enabled: true,
  loading: true,
  saving: false,
  error: null,

  setEnabled: (value) => set({ enabled: value }),

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await schoolSettingsService.fetchSchoolSettings();
      set({ settings, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  saveSettings: async (input) => {
    set({ saving: true, error: null });
    try {
      const settings = await schoolSettingsService.saveSchoolSettings(input);
      set({ settings, saving: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  fetchSummary: async () => {
    set({ loading: true, error: null });
    try {
      const summary = await schoolEnrollmentsService.fetchSchoolSummary();
      set({ summary, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },
}));