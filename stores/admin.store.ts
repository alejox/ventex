import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as adminService from "@/services/admin.service";
import type {
  AdminCompany,
  AdminCreditMovement,
  AdminReseller,
  AdminStats,
  CreditPack,
  CreditPackInput,
  PlanSaveInput,
  PlanPeriodInput,
} from "@/services/admin.service";
import type { Plan, PlanPeriod } from "@/services/subscription.service";

interface AdminState {
  companies: AdminCompany[];
  resellers: AdminReseller[];
  packs: CreditPack[];
  movements: AdminCreditMovement[];
  stats: AdminStats | null;
  plans: Plan[];
  /** Tiempos vendibles de cada plan (mensual, trimestral, …). */
  periods: PlanPeriod[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchOverview: () => Promise<void>;
  fetchCompanies: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchResellers: () => Promise<void>;
  setCompanyPlan: (userId: string, planId: string, status: string) => Promise<boolean>;
  /** Recarga meses a una empresa; devuelve el nuevo vencimiento o null si falla. */
  rechargeCompany: (userId: string, months: number) => Promise<string | null>;
  savePlan: (id: string | null, input: PlanSaveInput) => Promise<boolean>;
  savePlanPeriod: (id: string | null, input: PlanPeriodInput) => Promise<boolean>;
  deletePlanPeriod: (id: string) => Promise<boolean>;
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


export const useAdminStore = create<AdminState>((set) => ({
  companies: [],
  resellers: [],
  packs: [],
  movements: [],
  stats: null,
  plans: [],
  periods: [],
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
      // Revendedores y promos también: desde Empresas se pueden recargar créditos.
      const [companies, plans, periods, resellers, packs] = await Promise.all([
        adminService.fetchCompanies(),
        adminService.fetchPlans(),
        adminService.fetchPlanPeriods(),
        adminService.fetchResellers(),
        adminService.fetchCreditPacks(),
      ]);
      set({ companies, plans, periods, resellers, packs, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchPlans: async () => {
    set({ loading: true, error: null });
    try {
      const [plans, periods] = await Promise.all([
        adminService.fetchPlans(),
        adminService.fetchPlanPeriods(),
      ]);
      set({ plans, periods, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  savePlanPeriod: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      await adminService.savePlanPeriod(id, input);
      const periods = await adminService.fetchPlanPeriods();
      set({ periods, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  deletePlanPeriod: async (id) => {
    set({ submitting: true, error: null });
    try {
      await adminService.deletePlanPeriod(id);
      set((s) => ({ periods: s.periods.filter((p) => p.id !== id), submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  setCompanyPlan: async (userId, planId, status) => {
    set({ submitting: true, error: null });
    try {
      await adminService.setCompanyPlan(userId, planId, status);
      // Refrescamos el listado: el cambio de plan puede mover el vencimiento,
      // que no se puede derivar en memoria.
      const companies = await adminService.fetchCompanies();
      set({ companies, submitting: false });
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

  savePlan: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      await adminService.savePlan(id, input);
      // Un plan nuevo no está en memoria: recargamos el catálogo completo.
      const plans = await adminService.fetchPlans();
      set({ plans, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  rechargeCompany: async (userId, months) => {
    set({ submitting: true, error: null });
    try {
      const result = await adminService.rechargeCompany(userId, months);
      // La recarga puede reactivar la suscripción: refrescamos el listado.
      const companies = await adminService.fetchCompanies();
      set({ companies, submitting: false });
      return result.period_end;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },
}));
