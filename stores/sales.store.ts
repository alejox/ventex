import { create } from "zustand";
import * as salesService from "@/services/sales.service";
import type { SaleListItem, SaleDetail } from "@/services/sales.service";

interface SalesState {
  sales: SaleListItem[];
  loading: boolean;
  error: string | null;

  detail: SaleDetail | null;
  detailLoading: boolean;

  fetchSales: () => Promise<void>;
  openDetail: (saleId: string) => Promise<void>;
  closeDetail: () => void;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useSalesStore = create<SalesState>((set) => ({
  sales: [],
  loading: false,
  error: null,
  detail: null,
  detailLoading: false,

  fetchSales: async () => {
    set({ loading: true, error: null });
    try {
      const sales = await salesService.fetchSales();
      set({ sales, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  openDetail: async (saleId) => {
    set({ detailLoading: true, detail: null });
    try {
      const detail = await salesService.fetchSaleDetail(saleId);
      set({ detail, detailLoading: false });
    } catch (e) {
      set({ error: toMessage(e), detailLoading: false });
    }
  },

  closeDetail: () => set({ detail: null }),
}));
