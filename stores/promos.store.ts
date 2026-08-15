import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as promosService from "@/services/promos.service";
import type { PromoConfig, PromoMilestone, NewMilestoneInput } from "@/services/promos.service";
import { EMPTY_PROMO_CONFIG } from "@/services/promos.service";

interface PromosState {
  config: PromoConfig;
  milestones: PromoMilestone[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  saveConfig: (config: PromoConfig) => Promise<boolean>;
  addMilestone: (input: NewMilestoneInput) => Promise<boolean>;
  removeMilestone: (id: string) => Promise<boolean>;
  /** Devuelve cuántos clientes recalculó, o null si falló. */
  recalc: () => Promise<number | null>;
}

export const usePromosStore = create<PromosState>((set) => ({
  config: EMPTY_PROMO_CONFIG,
  milestones: [],
  loading: true,
  submitting: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [config, milestones] = await Promise.all([
        promosService.fetchPromoConfig(),
        promosService.fetchMilestones(),
      ]);
      set({ config, milestones, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  saveConfig: async (config) => {
    set({ submitting: true, error: null });
    try {
      await promosService.savePromoConfig(config);
      set({ config, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  addMilestone: async (input) => {
    set({ submitting: true, error: null });
    try {
      const milestone = await promosService.createMilestone(input);
      set((s) => ({
        milestones: [...s.milestones, milestone].sort((a, b) => a.threshold - b.threshold),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  removeMilestone: async (id) => {
    set({ submitting: true, error: null });
    try {
      await promosService.deleteMilestone(id);
      set((s) => ({ milestones: s.milestones.filter((m) => m.id !== id), submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  recalc: async () => {
    set({ submitting: true, error: null });
    try {
      const n = await promosService.recalcHaircutCounts();
      set({ submitting: false });
      return n;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },
}));
