import { create } from "zustand";
import * as subscriptionService from "@/services/subscription.service";
import type { MySubscription, Plan } from "@/services/subscription.service";

interface SubscriptionState {
  subscription: MySubscription | null;
  plans: Plan[];
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  /** Recarga solo el resumen de uso (tras crear staff/ventas). */
  refreshUsage: () => Promise<void>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  plans: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [subscription, plans] = await Promise.all([
        subscriptionService.fetchMySubscription(),
        subscriptionService.fetchPlans(),
      ]);
      set({ subscription, plans, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  refreshUsage: async () => {
    try {
      const subscription = await subscriptionService.fetchMySubscription();
      set({ subscription });
    } catch (e) {
      set({ error: toMessage(e) });
    }
  },
}));
