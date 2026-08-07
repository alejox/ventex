import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as settingsService from "@/services/settings.service";
import type { Settings, SettingsInput } from "@/services/settings.service";

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchSettings: () => Promise<void>;
  /** Devuelve true si se guardó correctamente. */
  saveSettings: (input: SettingsInput) => Promise<boolean>;

  /** Sube el logo y devuelve su URL pública (o null si falla). */
  uploadLogo: (file: File) => Promise<string | null>;
}


export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  error: null,
  submitting: false,

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await settingsService.fetchSettings();
      set({ settings, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  saveSettings: async (input) => {
    set({ submitting: true, error: null });
    try {
      const settings = await settingsService.saveSettings(input);
      set({ settings, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  uploadLogo: async (file) => {
    set({ error: null });
    try {
      return await settingsService.uploadBusinessLogo(file);
    } catch (e) {
      set({ error: toMessage(e) });
      return null;
    }
  },
}));
