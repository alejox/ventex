import { create } from "zustand";
import * as adminService from "@/services/admin.service";
import type { AdminCompany, AdminStats, PlanUpdateInput } from "@/services/admin.service";
import type { Plan } from "@/services/subscription.service";

interface AdminState {
  companies: AdminCompany[];
  stats: AdminStats | null;
  plans: Plan[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchOverview: () => Promise<void>;
  fetchCompanies: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  setCompanyPlan: (userId: string, planId: string, status: string) => Promise<boolean>;
  updatePlan: (id: string, input: PlanUpdateInput) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useAdminStore = create<AdminState>((set, get) => ({
  companies: [],
  stats: null,
  plans: [],
  loading: false,
  submitting: false,
  error: null,

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const [stats, companies, plans] = await Promise.all([
        adminService.fetchStats(),
        adminService.fetchCompanies(),
        adminService.fetchPlans(),
      ]);
      set({ stats, companies, plans, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchCompanies: async () => {
    set({ loading: true, error: null });
    try {
      const [companies, plans] = await Promise.all([
        adminService.fetchCompanies(),
        adminService.fetchPlans(),
      ]);
      set({ companies, plans, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchPlans: async () => {
    set({ loading: true, error: null });
    try {
      const plans = await adminService.fetchPlans();
      set({ plans, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  setCompanyPlan: async (userId, planId, status) => {
    set({ submitting: true, error: null });
    try {
      await adminService.setCompanyPlan(userId, planId, status);
      // Refleja el cambio en memoria sin recargar todo.
      const planName = get().plans.find((p) => p.id === planId)?.name ?? planId;
      set((s) => ({
        submitting: false,
        companies: s.companies.map((c) =>
          c.user_id === userId ? { ...c, plan_id: planId, plan_name: planName, status } : c,
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updatePlan: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      await adminService.updatePlan(id, input);
      set((s) => ({
        submitting: false,
        plans: s.plans.map((p) => (p.id === id ? { ...p, ...input } : p)),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
