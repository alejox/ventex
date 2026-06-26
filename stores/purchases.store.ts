import { create } from "zustand";
import * as purchasesService from "@/services/purchases.service";
import type { PurchaseInvoice, PurchaseLineInput } from "@/services/purchases.service";

interface PurchasesState {
  invoices: PurchaseInvoice[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchInvoices: () => Promise<void>;
  createInvoice: (params: {
    distributor_id: string;
    issue_date: string;
    supplier_invoice_number: string;
    items: PurchaseLineInput[];
  }) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const usePurchasesStore = create<PurchasesState>((set) => ({
  invoices: [],
  loading: false,
  error: null,
  submitting: false,

  fetchInvoices: async () => {
    set({ loading: true, error: null });
    try {
      const invoices = await purchasesService.fetchPurchaseInvoices();
      set({ invoices, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  createInvoice: async (params) => {
    set({ submitting: true, error: null });
    try {
      const invoice = await purchasesService.createPurchaseInvoice(params);
      set((s) => ({ invoices: [invoice, ...s.invoices], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
