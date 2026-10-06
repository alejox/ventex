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
  /**
   * Carga los settings solo si todavía no están (ni en vuelo). La llama el shell
   * del dashboard para que la moneda (`useFormatMoney`) llegue a toda la UI sin
   * un fetch por pantalla.
   */
  ensureSettings: () => Promise<void>;
  /** Devuelve true si se guardó correctamente. */
  saveSettings: (input: SettingsInput) => Promise<boolean>;
  saveShiftRequirement: (enabled: boolean) => Promise<boolean>;

  /** Sube el logo y devuelve su URL pública (o null si falla). */
  uploadLogo: (file: File) => Promise<string | null>;
}


export const useSettingsStore = create<SettingsState>((set, get) => ({
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

  ensureSettings: async () => {
    const { settings, loading, fetchSettings } = get();
    if (settings || loading) return;
    await fetchSettings();
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

  saveShiftRequirement: async (enabled) => {
    set({ submitting: true, error: null });
    try {
      const settings = await settingsService.saveShiftRequirement(enabled);
      set({ settings, submitting: false });
      return true;
    } catch (error) {
      set({ error: toMessage(error), submitting: false });
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
