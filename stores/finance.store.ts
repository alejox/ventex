import { create } from "zustand";
import * as financeService from "@/services/finance.service";
import type { FinanceOverview, NewExpenseInput } from "@/services/finance.service";

interface FinanceState {
  overview: FinanceOverview | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchOverview: () => Promise<void>;
  /** Devuelve true si el gasto se registró (para que el componente cierre el modal). */
  addExpense: (input: NewExpenseInput) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useFinanceStore = create<FinanceState>((set, get) => ({
  overview: null,
  loading: false,
  error: null,
  submitting: false,

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const overview = await financeService.fetchOverview();
      set({ overview, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addExpense: async (input) => {
    set({ submitting: true, error: null });
    try {
      await financeService.createExpense(input);
      await get().fetchOverview(); // refresca KPIs, gráfico y transacciones
      set({ submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
