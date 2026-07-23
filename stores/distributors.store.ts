import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as distributorsService from "@/services/distributors.service";
import type { Distributor, NewDistributorInput } from "@/services/distributors.service";

interface DistributorsState {
  distributors: Distributor[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchDistributors: () => Promise<void>;
  /** Devuelve true si el alta fue correcta (para que el componente navegue/cierre). */
  addDistributor: (input: NewDistributorInput) => Promise<boolean>;
  updateDistributor: (id: string, input: NewDistributorInput) => Promise<boolean>;
}


export const useDistributorsStore = create<DistributorsState>((set) => ({
  distributors: [],
  loading: false,
  error: null,
  submitting: false,

  fetchDistributors: async () => {
    set({ loading: true, error: null });
    try {
      const distributors = await distributorsService.fetchDistributors();
      set({ distributors, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addDistributor: async (input) => {
    set({ submitting: true, error: null });
    try {
      const distributor = await distributorsService.createDistributor(input);
      set((s) => ({ distributors: [...s.distributors, distributor], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateDistributor: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const distributor = await distributorsService.updateDistributor(id, input);
      set((s) => ({
        distributors: s.distributors.map((d) => (d.id === id ? distributor : d)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
