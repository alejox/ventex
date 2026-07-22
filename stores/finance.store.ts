import { create } from "zustand";
import * as financeService from "@/services/finance.service";
import type { FinanceOverview, NewExpenseInput, TodaySales } from "@/services/finance.service";

interface FinanceState {
  overview: FinanceOverview | null;
  /** null mientras no se resolvió: el panel distingue "cargando" de "cero ventas". */
  todaySales: TodaySales | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchOverview: () => Promise<void>;
  fetchTodaySales: () => Promise<void>;
  /** Devuelve true si el gasto se registró (para que el componente cierre el modal). */
  addExpense: (input: NewExpenseInput) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useFinanceStore = create<FinanceState>((set, get) => ({
  overview: null,
  todaySales: null,
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

  fetchTodaySales: async () => {
    try {
      const todaySales = await financeService.fetchTodaySales();
      set({ todaySales });
    } catch (e) {
      // No tumba el panel: es un KPI más, el resto del resumen sigue sirviendo.
      set({ error: toMessage(e) });
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
