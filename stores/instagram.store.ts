import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as instagramService from "@/services/instagram.service";
import type { InstagramConnection } from "@/services/instagram.service";

interface InstagramState {
  connection: InstagramConnection | null;
  /** True until the first fetch settles, so the editor never flashes "not connected". */
  loading: boolean;
  disconnecting: boolean;
  error: string | null;
  fetchConnection: () => Promise<void>;
  disconnect: () => Promise<boolean>;
}

export const useInstagramStore = create<InstagramState>((set) => ({
  connection: null,
  loading: true,
  disconnecting: false,
  error: null,

  fetchConnection: async () => {
    set({ loading: true, error: null });
    try {
      set({ connection: await instagramService.fetchInstagramConnection(), loading: false });
    } catch (e) {
      set({ loading: false, error: toMessage(e) });
    }
  },

  disconnect: async () => {
    set({ disconnecting: true, error: null });
    try {
      await instagramService.disconnectInstagram();
      set({ connection: null, disconnecting: false });
      return true;
    } catch (e) {
      set({ disconnecting: false, error: toMessage(e) });
      return false;
    }
  },
}));
