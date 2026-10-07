import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as financeService from "@/services/finance.service";
import type {
  FinanceOverview,
  HomePeriodId,
  LocalRange,
  NewExpenseInput,
  PendingCounts,
  PendingId,
  TodaySales,
} from "@/services/finance.service";

interface FinanceState {
  /** KPIs, desglose y movimientos del PERÍODO elegido. */
  overview: FinanceOverview | null;
  /** Los mismos totales del período anterior, para la comparación. */
  previous: FinanceOverview | null;
  /** Seis meses para el gráfico: no depende del período elegido. */
  chart: FinanceOverview | null;
  /** null mientras no se resolvió: el panel distingue "cargando" de "cero ventas". */
  todaySales: TodaySales | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;

  /** Período del panel. "Este mes" por defecto: es lo que se mira al abrir. */
  period: HomePeriodId;
  customFrom: string;
  customTo: string;
  /** Rangos resueltos del período y del anterior (para las etiquetas). */
  range: LocalRange | null;
  previousRange: LocalRange | null;

  /** Pendientes de hoy: conteos ya consultados. null = todavía no se pidieron. */
  pending: PendingCounts | null;

  fetchOverview: () => Promise<void>;
  fetchTodaySales: () => Promise<void>;
  setPeriod: (period: HomePeriodId) => Promise<void>;
  setCustomRange: (from: string, to: string) => Promise<void>;
  fetchPending: (checks: PendingId[]) => Promise<void>;
  /** Devuelve true si el gasto se registró (para que el componente cierre el modal). */
  addExpense: (input: NewExpenseInput) => Promise<boolean>;
}

/** Guarda contra respuestas viejas: si cambian el período a mitad de camino, gana el último. */
let requestSeq = 0;

export const useFinanceStore = create<FinanceState>((set, get) => ({
  overview: null,
  previous: null,
  chart: null,
  todaySales: null,
  loading: false,
  error: null,
  submitting: false,
  period: "month",
  customFrom: "",
  customTo: "",
  range: null,
  previousRange: null,
  pending: null,

  fetchOverview: async () => {
    const { period, customFrom, customTo } = get();
    const seq = ++requestSeq;
    // El día y el mes se cortan en la zona del NEGOCIO (la misma con la que la
    // base fecha los retiros de caja), con la del dispositivo de respaldo.
    const tz = await financeService.fetchBusinessTimeZone();
    if (seq !== requestSeq) return;
    const now = new Date();
    const range = financeService.homePeriodRange(period, now, customFrom, customTo, tz);
    // "Personalizado" sin las dos fechas: se espera a que estén.
    if (!range) return;
    const previousRange = financeService.previousPeriod(period, range, now, tz);
    set({ loading: true, error: null, range, previousRange });
    try {
      const data = await financeService.fetchHomeOverview(range, previousRange, tz);
      if (seq !== requestSeq) return;
      set({ overview: data.current, previous: data.previous, chart: data.chart, loading: false });
    } catch (e) {
      if (seq !== requestSeq) return;
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchTodaySales: async () => {
    try {
      const tz = await financeService.fetchBusinessTimeZone();
      const todaySales = await financeService.fetchTodaySales(tz);
      set({ todaySales });
    } catch (e) {
      // No tumba el panel: es un KPI más, el resto del resumen sigue sirviendo.
      set({ error: toMessage(e) });
    }
  },

  setPeriod: async (period) => {
    set({ period });
    await get().fetchOverview();
  },

  setCustomRange: async (from, to) => {
    set({ customFrom: from, customTo: to, period: "custom" });
    await get().fetchOverview();
  },

  fetchPending: async (checks) => {
    // Nunca lanza: cada conteo que falla simplemente no aparece.
    const pending = await financeService.fetchPendingCounts(checks);
    set({ pending });
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
