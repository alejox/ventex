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
    status: string;
    items: PurchaseLineInput[];
  }) => Promise<boolean>;
  updateStatus: (id: string, status: string) => Promise<void>;
  updateInvoice: (id: string, params: {
    distributor_id: string;
    issue_date: string;
    supplier_invoice_number: string;
    status: string;
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

  updateInvoice: async (id, params) => {
    set({ submitting: true, error: null });
    try {
      const invoice = await purchasesService.updatePurchaseInvoice(id, params);
      set((s) => ({
        invoices: s.invoices.map((inv) => (inv.id === id ? invoice : inv)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateStatus: async (id, status) => {
    set({ error: null });
    try {
      await purchasesService.updateInvoiceStatus(id, status);
      set((s) => ({
        invoices: s.invoices.map((inv) =>
          inv.id === id ? { ...inv, status } : inv
        ),
      }));
    } catch (e) {
      set({ error: toMessage(e) });
    }
  },
}));
