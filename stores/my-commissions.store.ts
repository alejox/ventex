import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import {
  isPeriodTooLong,
  myPeriodOf,
  presetPeriod,
  type MyCommissionLine,
  type MyCommissionSummary,
  type MyPeriod,
  type MyPeriodPreset,
  type MyPeriodTotals,
} from "@/lib/my-commissions";
import {
  NoStaffRecordError,
  fetchMyCommissionLines,
  fetchMyCommissionPeriodTotals,
  fetchMyCommissionSummary,
} from "@/services/commissions-self.service";
import { fetchBusinessTimeZone } from "@/services/finance.service";

export type MyPeriodChoice = MyPeriodPreset | "custom";

interface MyCommissionsState {
  choice: MyPeriodChoice;
  period: MyPeriod | null;
  lines: MyCommissionLine[];
  summary: MyCommissionSummary | null;
  /** Totales del período calculados en la base: las tarjetas salen de acá. */
  totals: MyPeriodTotals | null;
  loading: boolean;
  error: string | null;
  /** La sesión no tiene ficha de personal activa (el RPC respondió SIN_FICHA). */
  noStaff: boolean;
  fetch: () => Promise<void>;
  setPreset: (preset: MyPeriodPreset) => Promise<void>;
  setCustomRange: (from: string, to: string) => Promise<void>;
}

let seq = 0;

export const useMyCommissionsStore = create<MyCommissionsState>((set, get) => ({
  choice: "this-month",
  period: null,
  lines: [],
  summary: null,
  totals: null,
  loading: true,
  error: null,
  noStaff: false,

  fetch: async () => {
    const mine = ++seq;
    set({ loading: true, error: null });
    try {
      // Los días se cortan en la zona del negocio, igual que Reportes.
      const tz = await fetchBusinessTimeZone();
      if (mine !== seq) return;
      const current = get();
      const period =
        current.choice === "custom" && current.period
          ? myPeriodOf(current.period.from, current.period.to, tz)
          : presetPeriod(current.choice === "custom" ? "this-month" : current.choice, tz);
      if (isPeriodTooLong(period)) {
        set({ period, loading: false, totals: null, lines: [], error: "Elige un rango válido de hasta un año." });
        return;
      }
      const [summary, totals, lines] = await Promise.all([
        fetchMyCommissionSummary(),
        fetchMyCommissionPeriodTotals(period),
        fetchMyCommissionLines(period),
      ]);
      if (mine !== seq) return;
      set({ period, summary, totals, lines, loading: false, noStaff: false });
    } catch (e) {
      if (mine !== seq) return;
      if (e instanceof NoStaffRecordError) {
        set({ noStaff: true, loading: false, lines: [], summary: null, totals: null });
        return;
      }
      set({ loading: false, error: toMessage(e) });
    }
  },

  setPreset: async (preset) => {
    set({ choice: preset });
    await get().fetch();
  },

  setCustomRange: async (from, to) => {
    if (!from || !to) return;
    // La zona real se aplica en `fetch`; acá solo se guardan las fechas.
    set({ choice: "custom", period: { from, to, fromTs: "", toTs: "" } });
    await get().fetch();
  },
}));
