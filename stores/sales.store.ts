import { create } from "zustand";
import * as salesService from "@/services/sales.service";
import type {
  SaleListItem,
  SaleDetail,
  SalesSummary,
  SalesPeriodId,
} from "@/services/sales.service";

interface SalesState {
  sales: SaleListItem[];
  /** Total de ventas del período, para paginar (no es `sales.length`). */
  total: number;
  page: number;
  loading: boolean;
  error: string | null;

  /** KPIs del período completo; vienen del RPC, no de `sales`. */
  summary: SalesSummary | null;

  period: SalesPeriodId;
  customFrom: string;
  customTo: string;
  /** Búsqueda por nombre de cliente. Vacío = sin filtrar. */
  customerQuery: string;

  detail: SaleDetail | null;
  detailLoading: boolean;

  /** Recarga listado + totales del período actual. */
  fetchSales: () => Promise<void>;
  setPeriod: (period: SalesPeriodId) => Promise<void>;
  setCustomRange: (from: string, to: string) => Promise<void>;
  setCustomerQuery: (query: string) => Promise<void>;
  setPage: (page: number) => Promise<void>;
  openDetail: (saleId: string) => Promise<void>;
  closeDetail: () => void;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  total: 0,
  page: 0,
  loading: false,
  error: null,
  summary: null,
  // Arranca en el mes en curso: mostrar todo el histórico es caro y casi nunca
  // es lo que se quiere mirar al abrir la pantalla.
  period: "month",
  customFrom: "",
  customTo: "",
  customerQuery: "",
  detail: null,
  detailLoading: false,

  fetchSales: async () => {
    const { period, customFrom, customTo, page, customerQuery } = get();
    set({ loading: true, error: null });
    try {
      const range = salesService.resolvePeriod(period, customFrom, customTo);
      // En paralelo: son consultas independientes y la página las necesita a las dos.
      const [pageResult, summary] = await Promise.all([
        salesService.fetchSales(range, page, undefined, customerQuery),
        salesService.fetchSalesSummary(range, customerQuery),
      ]);
      set({ sales: pageResult.items, total: pageResult.total, summary, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  setPeriod: async (period) => {
    // Cambiar de período reinicia la paginación: la página 3 del mes pasado no
    // tiene por qué existir en "hoy".
    set({ period, page: 0 });
    // "Personalizado" espera a que haya fechas cargadas.
    if (period === "custom" && !get().customFrom && !get().customTo) return;
    await get().fetchSales();
  },

  setCustomRange: async (from, to) => {
    set({ customFrom: from, customTo: to, period: "custom", page: 0 });
    if (!from && !to) return;
    await get().fetchSales();
  },

  setCustomerQuery: async (query) => {
    // Volver a la página 1: la 3 de "todos" no tiene por qué existir filtrando.
    set({ customerQuery: query, page: 0 });
    await get().fetchSales();
  },

  setPage: async (page) => {
    set({ page });
    await get().fetchSales();
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
