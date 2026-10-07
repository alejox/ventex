import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as reportsService from "@/services/reports.service";
import { fetchBusinessTimeZone } from "@/services/finance.service";
import type { ReportData, ReportPeriodId } from "@/services/reports.service";

interface ReportsState {
  period: ReportPeriodId;
  /** "YYYY-MM" del período personalizado, ambos incluidos. */
  customFrom: string;
  customTo: string;
  data: ReportData | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  setPeriod: (period: ReportPeriodId) => Promise<void>;
  setCustomRange: (from: string, to: string) => Promise<void>;
}

let seq = 0;

export const useReportsStore = create<ReportsState>((set, get) => ({
  period: "last6",
  customFrom: "",
  customTo: "",
  data: null,
  loading: true,
  error: null,

  fetch: async () => {
    const { period, customFrom, customTo } = get();
    const mine = ++seq;
    // Los meses se cortan en la zona del negocio, no la del dispositivo.
    const tz = await fetchBusinessTimeZone();
    if (mine !== seq) return;
    const now = new Date();
    const span = reportsService.reportMonths(period, now, customFrom, customTo, tz);
    if (!span) {
      set({ loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const data = await reportsService.fetchReport(span, now, tz);
      if (mine === seq) set({ data, loading: false });
    } catch (e) {
      if (mine === seq) set({ error: toMessage(e), loading: false });
    }
  },

  setPeriod: async (period) => {
    set({ period });
    await get().fetch();
  },

  setCustomRange: async (customFrom, customTo) => {
    set({ customFrom, customTo, period: "custom" });
    await get().fetch();
  },
}));
