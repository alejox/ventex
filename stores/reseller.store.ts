import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as resellerService from "@/services/reseller.service";
import type {
  CreditMovement,
  NewClientInput,
  ResellerClient,
  ResellerStats,
} from "@/services/reseller.service";
import type { Plan, PlanPeriod } from "@/services/subscription.service";

interface ResellerState {
  clients: ResellerClient[];
  stats: ResellerStats | null;
  history: CreditMovement[];
  plans: Plan[];
  /** Tiempos vendibles de cada plan (mensual, trimestral, …). */
  periods: PlanPeriod[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchOverview: () => Promise<void>;
  fetchClients: () => Promise<void>;
  createClient: (input: NewClientInput) => Promise<boolean>;
  /** Recarga la licencia con un tiempo del plan; devuelve el nuevo vencimiento o null. */
  rechargeClient: (userId: string, periodId: string) => Promise<string | null>;
  setClientStatus: (userId: string, action: "suspend" | "reactivate") => Promise<boolean>;
}


export const useResellerStore = create<ResellerState>((set) => ({
  clients: [],
  stats: null,
  history: [],
  plans: [],
  periods: [],
  loading: false,
  submitting: false,
  error: null,

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const [stats, clients, history, plans, periods] = await Promise.all([
        resellerService.fetchStats(),
        resellerService.fetchClients(),
        resellerService.fetchCreditHistory(),
        resellerService.fetchPlans(),
        resellerService.fetchPlanPeriods(),
      ]);
      set({ stats, clients, history, plans, periods, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchClients: async () => {
    set({ loading: true, error: null });
    try {
      const [clients, plans, periods] = await Promise.all([
        resellerService.fetchClients(),
        resellerService.fetchPlans(),
        resellerService.fetchPlanPeriods(),
      ]);
      set({ clients, plans, periods, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  createClient: async (input) => {
    set({ submitting: true, error: null });
    try {
      await resellerService.createClientAccount(input);
      // Recarga clientes y stats: el alta afecta contadores y listado.
      const [clients, stats] = await Promise.all([
        resellerService.fetchClients(),
        resellerService.fetchStats(),
      ]);
      set({ clients, stats, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  rechargeClient: async (userId, periodId) => {
    set({ submitting: true, error: null });
    try {
      const result = await resellerService.rechargeClient(userId, periodId);
      // La recarga consume créditos y mueve el vencimiento: refresca todo.
      const [clients, stats, history] = await Promise.all([
        resellerService.fetchClients(),
        resellerService.fetchStats(),
        resellerService.fetchCreditHistory(),
      ]);
      set({ clients, stats, history, submitting: false });
      return result.period_end;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  setClientStatus: async (userId, action) => {
    set({ submitting: true, error: null });
    try {
      await resellerService.setClientStatus(userId, action);
      const [clients, stats] = await Promise.all([
        resellerService.fetchClients(),
        resellerService.fetchStats(),
      ]);
      set({ clients, stats, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
