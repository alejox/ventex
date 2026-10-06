import { create } from "zustand";
import * as gettingStartedService from "@/services/getting-started.service";
import type { GettingStartedFacts } from "@/lib/getting-started";

interface GettingStartedState {
  /** null mientras no se consultó: el checklist no se dibuja a medias. */
  facts: GettingStartedFacts | null;
  loading: boolean;
  fetchFacts: () => Promise<void>;
}

export const useGettingStartedStore = create<GettingStartedState>((set, get) => ({
  facts: null,
  loading: false,

  fetchFacts: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const facts = await gettingStartedService.fetchGettingStartedFacts();
      set({ facts, loading: false });
    } catch {
      // Es una ayuda, no una función del panel: si falla, simplemente no se
      // muestra (facts queda en null).
      set({ loading: false });
    }
  },
}));
