import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as skuMonsterService from "@/services/skumonster.service";
import type {
  SkuMonsterProduct,
  LookupParams,
  BatchLookupResult,
  SearchParams,
  SearchResult,
} from "@/services/skumonster.service";

interface SkuMonsterState {
  lastResult: SkuMonsterProduct | null;
  batchResults: BatchLookupResult | null;
  searchResults: SearchResult | null;
  loading: boolean;
  error: string | null;

  lookupBySku: (sku: string) => Promise<boolean>;
  lookupByEan: (ean: string) => Promise<boolean>;
  lookupByBarcode: (barcode: string) => Promise<boolean>;
  lookup: (params: LookupParams) => Promise<boolean>;
  lookupBatch: (items: LookupParams[]) => Promise<boolean>;
  search: (params: SearchParams) => Promise<boolean>;
  getById: (id: string) => Promise<boolean>;
  clearResult: () => void;
}

export const useSkuMonsterStore = create<SkuMonsterState>((set) => ({
  lastResult: null,
  batchResults: null,
  searchResults: null,
  loading: false,
  error: null,

  lookupBySku: async (sku) => {
    set({ loading: true, error: null });
    try {
      const result = await skuMonsterService.lookupProduct({ sku });
      set({ lastResult: result, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  lookupByEan: async (ean) => {
    set({ loading: true, error: null });
    try {
      const result = await skuMonsterService.lookupProduct({ ean });
      set({ lastResult: result, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  lookupByBarcode: async (barcode) => {
    set({ loading: true, error: null });
    try {
      const result = await skuMonsterService.lookupProduct({ barcode });
      set({ lastResult: result, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  lookup: async (params) => {
    set({ loading: true, error: null });
    try {
      const result = await skuMonsterService.lookupProduct(params);
      set({ lastResult: result, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  lookupBatch: async (items) => {
    set({ loading: true, error: null });
    try {
      const result = await skuMonsterService.batchLookup(items);
      set({ batchResults: result, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  search: async (params) => {
    set({ loading: true, error: null });
    try {
      const result = await skuMonsterService.searchProducts(params);
      set({ searchResults: result, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  getById: async (id) => {
    set({ loading: true, error: null });
    try {
      const result = await skuMonsterService.getProductById(id);
      set({ lastResult: result, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  clearResult: () =>
    set({
      lastResult: null,
      batchResults: null,
      searchResults: null,
      error: null,
    }),
}));
