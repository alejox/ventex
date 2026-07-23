import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as subscriptionService from "@/services/subscription.service";
import type { MySubscription, Plan, PlanPeriod } from "@/services/subscription.service";

interface SubscriptionState {
  subscription: MySubscription | null;
  plans: Plan[];
  /** Tiempos vendibles de cada plan (mensual, trimestral, …). */
  periods: PlanPeriod[];
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  /** Recarga solo el resumen de uso (tras crear staff/ventas). */
  refreshUsage: () => Promise<void>;
}


export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  plans: [],
  periods: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [subscription, plans, periods] = await Promise.all([
        subscriptionService.fetchMySubscription(),
        subscriptionService.fetchPlans(),
        subscriptionService.fetchPlanPeriods(),
      ]);
      set({ subscription, plans, periods, loading: false });
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
