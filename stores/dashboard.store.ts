import { create } from "zustand";
import * as dashboardService from "@/services/dashboard.service";
import type { DashboardData } from "@/services/dashboard.service";

interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useDashboardStore = create<DashboardState>((set) => ({
  data: null,
  loading: false,
  error: null,

  fetchDashboard: async () => {
    set({ loading: true, error: null });
    try {
      const data = await dashboardService.fetchDashboard();
      set({ data, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },
}));
