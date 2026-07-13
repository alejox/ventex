import { create } from "zustand";
import * as resellerService from "@/services/reseller.service";
import type {
  CreditMovement,
  NewClientInput,
  ResellerClient,
  ResellerStats,
} from "@/services/reseller.service";
import type { Plan } from "@/services/subscription.service";

interface ResellerState {
  clients: ResellerClient[];
  stats: ResellerStats | null;
  history: CreditMovement[];
  plans: Plan[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchOverview: () => Promise<void>;
  fetchClients: () => Promise<void>;
  createClient: (input: NewClientInput) => Promise<boolean>;
  setClientStatus: (userId: string, action: "suspend" | "reactivate") => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useResellerStore = create<ResellerState>((set) => ({
  clients: [],
  stats: null,
  history: [],
  plans: [],
  loading: false,
  submitting: false,
  error: null,

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const [stats, clients, history, plans] = await Promise.all([
        resellerService.fetchStats(),
        resellerService.fetchClients(),
        resellerService.fetchCreditHistory(),
        resellerService.fetchPlans(),
      ]);
      set({ stats, clients, history, plans, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchClients: async () => {
    set({ loading: true, error: null });
    try {
      const [clients, plans] = await Promise.all([
        resellerService.fetchClients(),
        resellerService.fetchPlans(),
      ]);
      set({ clients, plans, loading: false });
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
