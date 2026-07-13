import { create } from "zustand";
import * as adminService from "@/services/admin.service";
import type {
  AdminCompany,
  AdminCreditMovement,
  AdminReseller,
  AdminStats,
  CreditPack,
  CreditPackInput,
  PlanUpdateInput,
} from "@/services/admin.service";
import type { Plan } from "@/services/subscription.service";

interface AdminState {
  companies: AdminCompany[];
  resellers: AdminReseller[];
  packs: CreditPack[];
  movements: AdminCreditMovement[];
  stats: AdminStats | null;
  plans: Plan[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchOverview: () => Promise<void>;
  fetchCompanies: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchResellers: () => Promise<void>;
  setCompanyPlan: (userId: string, planId: string, status: string) => Promise<boolean>;
  updatePlan: (id: string, input: PlanUpdateInput) => Promise<boolean>;
  promoteReseller: (email: string) => Promise<boolean>;
  demoteReseller: (email: string) => Promise<boolean>;
  grantCredits: (
    resellerId: string,
    planId: string,
    amount: number,
    note: string,
  ) => Promise<boolean>;
  fetchCreditsPanel: () => Promise<void>;
  savePack: (id: string | null, input: CreditPackInput) => Promise<boolean>;
  deletePack: (id: string) => Promise<boolean>;
  applyPack: (resellerId: string, packId: string) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useAdminStore = create<AdminState>((set, get) => ({
  companies: [],
  resellers: [],
  packs: [],
  movements: [],
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

  fetchResellers: async () => {
    set({ loading: true, error: null });
    try {
      const [resellers, plans, packs] = await Promise.all([
        adminService.fetchResellers(),
        adminService.fetchPlans(),
        adminService.fetchCreditPacks(),
      ]);
      set({ resellers, plans, packs, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchCreditsPanel: async () => {
    set({ loading: true, error: null });
    try {
      const [packs, movements, plans] = await Promise.all([
        adminService.fetchCreditPacks(),
        adminService.fetchCreditMovements(),
        adminService.fetchPlans(),
      ]);
      set({ packs, movements, plans, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  savePack: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      await adminService.saveCreditPack(id, input);
      const packs = await adminService.fetchCreditPacks();
      set({ packs, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  deletePack: async (id) => {
    set({ submitting: true, error: null });
    try {
      await adminService.deleteCreditPack(id);
      set((s) => ({
        submitting: false,
        packs: s.packs.filter((p) => p.id !== id),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  applyPack: async (resellerId, packId) => {
    set({ submitting: true, error: null });
    try {
      await adminService.applyCreditPack(resellerId, packId);
      // El pack cambia saldos: recarga la lista de revendedores.
      const resellers = await adminService.fetchResellers();
      set({ resellers, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  promoteReseller: async (email) => {
    set({ submitting: true, error: null });
    try {
      await adminService.setResellerByEmail(email, true);
      const resellers = await adminService.fetchResellers();
      set({ resellers, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  demoteReseller: async (email) => {
    set({ submitting: true, error: null });
    try {
      await adminService.setResellerByEmail(email, false);
      set((s) => ({
        submitting: false,
        resellers: s.resellers.filter((r) => r.email !== email),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  grantCredits: async (resellerId, planId, amount, note) => {
    set({ submitting: true, error: null });
    try {
      await adminService.grantCredits(resellerId, planId, amount, note);
      set((s) => ({
        submitting: false,
        resellers: s.resellers.map((r) =>
          r.user_id === resellerId
            ? {
                ...r,
                balances: {
                  ...r.balances,
                  [planId]: (r.balances[planId] ?? 0) + amount,
                },
              }
            : r,
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
