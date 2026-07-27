import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as openfactsService from "@/services/openfacts.service";
import type { OpenFactsProduct } from "@/services/openfacts.service";

interface OpenFactsState {
  lastResult: OpenFactsProduct | null;
  loading: boolean;
  error: string | null;

  lookup: (barcode: string) => Promise<OpenFactsProduct | null>;
  clearResult: () => void;
}

export const useOpenFactsStore = create<OpenFactsState>((set) => ({
  lastResult: null,
  loading: false,
  error: null,

  lookup: async (barcode) => {
    set({ loading: true, error: null });
    try {
      const result = await openfactsService.lookupBarcode(barcode);
      set({ lastResult: result, loading: false });
      return result;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return null;
    }
  },

  clearResult: () => set({ lastResult: null, error: null }),
}));
