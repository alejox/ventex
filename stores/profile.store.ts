import { create } from "zustand";
import * as profileService from "@/services/profile.service";
import type { ProfileUpdate } from "@/services/profile.service";

interface ProfileState {
  submitting: boolean;
  error: string | null;
  /** Devuelve true si se guardó correctamente. */
  saveProfile: (patch: ProfileUpdate) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useProfileStore = create<ProfileState>((set) => ({
  submitting: false,
  error: null,

  saveProfile: async (patch) => {
    set({ submitting: true, error: null });
    try {
      await profileService.updateProfile(patch);
      set({ submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
