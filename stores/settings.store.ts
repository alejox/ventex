import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as settingsService from "@/services/settings.service";
import type { Settings, SettingsInput } from "@/services/settings.service";

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;

  businessKey: string | null;
  keyLoading: boolean;
  keyRegenerating: boolean;
  keySaving: boolean;

  fetchSettings: () => Promise<void>;
  /** Devuelve true si se guardó correctamente. */
  saveSettings: (input: SettingsInput) => Promise<boolean>;

  /** Sube el logo y devuelve su URL pública (o null si falla). */
  uploadLogo: (file: File) => Promise<string | null>;
  fetchBusinessKey: () => Promise<void>;
  /**
   * Guarda una llave personalizada escrita por el dueño.
   * Devuelve `{ ok }` y, si falla, un mensaje legible para mostrar en el formulario.
   */
  setBusinessKey: (raw: string) => Promise<{ ok: boolean; error?: string }>;
  /** Genera y guarda una nueva llave de la tienda; devuelve el valor nuevo o null. */
  regenerateBusinessKey: () => Promise<string | null>;
}


export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  error: null,
  submitting: false,

  businessKey: null,
  keyLoading: false,
  keyRegenerating: false,
  keySaving: false,

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

  fetchBusinessKey: async () => {
    set({ keyLoading: true, error: null });
    try {
      const businessKey = await settingsService.fetchBusinessKey();
      set({ businessKey, keyLoading: false });
    } catch (e) {
      set({ error: toMessage(e), keyLoading: false });
    }
  },

  setBusinessKey: async (raw) => {
    set({ keySaving: true, error: null });
    try {
      const businessKey = await settingsService.setBusinessKey(raw);
      set({ businessKey, keySaving: false });
      return { ok: true };
    } catch (e) {
      const error = toMessage(e);
      set({ error, keySaving: false });
      return { ok: false, error };
    }
  },

  regenerateBusinessKey: async () => {
    set({ keyRegenerating: true, error: null });
    try {
      const businessKey = await settingsService.regenerateBusinessKey();
      set({ businessKey, keyRegenerating: false });
      return businessKey;
    } catch (e) {
      set({ error: toMessage(e), keyRegenerating: false });
      return null;
    }
  },
}));
