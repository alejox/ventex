import { create } from "zustand";
import * as shiftsService from "@/services/shifts.service";
import type { CurrentShift, Shift, ShiftSummary } from "@/services/shifts.service";

interface ShiftsState {
  /** Turno abierto del empleado autenticado (null = sin turno). */
  currentShift: CurrentShift | null;
  /** Historial de turnos del negocio (vista del dueño). */
  shifts: Shift[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  /** El último cierre falló porque el descuadre necesita justificación. */
  needsJustification: boolean;

  fetchCurrentShift: () => Promise<void>;
  /** Devuelve true si el turno quedó abierto. */
  openShift: (openingCash: number) => Promise<boolean>;
  /** Cierra el turno y devuelve el resumen del arqueo (null si falló). */
  closeShift: (closingCash: number, notes?: string, shiftId?: string) => Promise<ShiftSummary | null>;
  /** Registra un retiro de caja contra el turno abierto. true si se guardó. */
  registerWithdrawal: (amount: number, reason: string) => Promise<boolean>;
  /** Baja la exigencia de justificación al volver a contar el efectivo. */
  resetJustification: () => void;
  fetchShifts: () => Promise<void>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useShiftsStore = create<ShiftsState>((set) => ({
  currentShift: null,
  shifts: [],
  loading: false,
  submitting: false,
  error: null,
  needsJustification: false,

  fetchCurrentShift: async () => {
    set({ loading: true, error: null });
    try {
      const currentShift = await shiftsService.fetchCurrentShift();
      set({ currentShift, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  openShift: async (openingCash) => {
    set({ submitting: true, error: null });
    try {
      await shiftsService.openShift(openingCash);
      const currentShift = await shiftsService.fetchCurrentShift();
      set({ currentShift, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  closeShift: async (closingCash, notes, shiftId) => {
    set({ submitting: true, error: null, needsJustification: false });
    try {
      const summary = await shiftsService.closeShift(closingCash, notes, shiftId);
      set((s) => ({
        // Si se cerró el turno propio, ya no hay turno actual.
        currentShift: shiftId && s.currentShift?.id !== shiftId ? s.currentShift : null,
        shifts: s.shifts.map((sh) =>
          sh.id === summary.id
            ? {
                ...sh,
                status: "closed",
                closed_at: summary.closed_at,
                closing_cash: summary.closing_cash,
                expected_cash: summary.expected_cash,
                difference: summary.difference,
                sales_total: summary.sales_total,
                sales_count: summary.sales_count,
                withdrawals_total: summary.withdrawals_total,
                totals_by_method: summary.totals_by_method,
              }
            : sh,
        ),
        submitting: false,
      }));
      return summary;
    } catch (e) {
      // El descuadre sin nota no es un error a mostrar: es un paso más del
      // cierre, así que la UI pide la justificación y reintenta.
      if (shiftsService.isJustificationRequired(e)) {
        set({ needsJustification: true, submitting: false, error: null });
        return null;
      }
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  resetJustification: () => set({ needsJustification: false, error: null }),

  registerWithdrawal: async (amount, reason) => {
    set({ submitting: true, error: null });
    try {
      await shiftsService.registerWithdrawal(amount, reason);
      // El retiro cambia el efectivo esperado: se recarga el turno en vivo.
      const currentShift = await shiftsService.fetchCurrentShift();
      set({ currentShift, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  fetchShifts: async () => {
    set({ loading: true, error: null });
    try {
      const shifts = await shiftsService.fetchShifts();
      set({ shifts, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },
}));
