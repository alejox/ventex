import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as creditsService from "@/services/credits.service";
import type { CreditDetail, CreditRow } from "@/services/credits.service";

interface CreditsState {
  /**
   * La cartera ENTERA: los que deben y los que ya saldaron.
   *
   * Una sola lista, y el filtro por pestaña se hace en la pantalla. Con dos
   * listas separadas, un cobro tendría que sacar de una y meter en la otra, y
   * cualquier olvido deja al mismo cliente en las dos —o en ninguna—.
   */
  rows: CreditRow[];
  loading: boolean;
  error: string | null;
  submitting: boolean;
  /**
   * El detalle abierto, cacheado por cliente. Volver a abrir la misma fila no
   * vuelve a pedir la cuenta: no cambia mientras nadie cobre, y cobrar ya lo
   * invalida abajo.
   */
  detail: Record<string, CreditDetail>;
  detailLoading: string | null;

  fetchRows: () => Promise<void>;
  loadDetail: (customerId: string) => Promise<void>;
  registerPayment: (customerId: string, amount: number, notes?: string) => Promise<boolean>;
}

export const useCreditsStore = create<CreditsState>((set, get) => ({
  rows: [],
  // Arranca en `true`: el primer render es anterior al fetch, y con `false`
  // la pantalla anuncia "nadie te debe" sobre una cartera que todavía no llegó.
  loading: true,
  error: null,
  submitting: false,
  detail: {},
  detailLoading: null,

  fetchRows: async () => {
    set({ loading: true, error: null });
    try {
      const rows = await creditsService.fetchCreditRows();
      set({ rows, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  loadDetail: async (customerId) => {
    if (get().detail[customerId]) return;
    set({ detailLoading: customerId, error: null });
    try {
      const detail = await creditsService.fetchCreditDetail(customerId);
      set((s) => ({ detail: { ...s.detail, [customerId]: detail }, detailLoading: null }));
    } catch (e) {
      set({ error: toMessage(e), detailLoading: null });
    }
  },

  registerPayment: async (customerId, amount, notes) => {
    set({ submitting: true, error: null });
    try {
      const balance = await creditsService.registerPayment(customerId, amount, notes);
      const ahora = new Date().toISOString();
      set((s) => ({
        // El cliente que salda NO se borra: se queda con su saldo en cero y
        // pasa a la pestaña de los que ya pagaron. Sacarlo de la lista perdía
        // el único registro de que fió, pagó y cumplió — que es exactamente el
        // dato con el que se decide si se le vuelve a fiar.
        rows: s.rows.map((c) =>
          c.id === customerId
            ? {
                ...c,
                credit_balance: balance,
                total_paid: c.total_paid + amount,
                last_payment_at: ahora,
              }
            : c,
        ),
        // El detalle cacheado quedó viejo: le falta el abono recién hecho.
        detail: Object.fromEntries(
          Object.entries(s.detail).filter(([id]) => id !== customerId),
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
