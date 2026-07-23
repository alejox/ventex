import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as billingService from "@/services/billing.service";
import type {
  Invoice,
  InvoiceItem,
  NewInvoiceInput,
  InvoiceStatus,
} from "@/services/billing.service";

interface BillingState {
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  items: InvoiceItem[];
  itemsLoading: boolean;

  fetchInvoices: () => Promise<void>;
  addInvoice: (input: NewInvoiceInput) => Promise<boolean>;
  updateStatus: (id: string, status: InvoiceStatus) => Promise<boolean>;
  fetchItems: (invoiceId: string) => Promise<void>;
}


export const useBillingStore = create<BillingState>((set) => ({
  invoices: [],
  loading: false,
  error: null,
  submitting: false,
  items: [],
  itemsLoading: false,

  fetchInvoices: async () => {
    set({ loading: true, error: null });
    try {
      const invoices = await billingService.fetchInvoices();
      set({ invoices, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addInvoice: async (input) => {
    set({ submitting: true, error: null });
    try {
      const invoice = await billingService.createInvoice(input);
      set((s) => ({ invoices: [invoice, ...s.invoices], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateStatus: async (id, status) => {
    set({ error: null });
    try {
      await billingService.updateInvoiceStatus(id, status);
      set((s) => ({
        invoices: s.invoices.map((i) => (i.id === id ? { ...i, status } : i)),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  fetchItems: async (invoiceId) => {
    set({ itemsLoading: true, items: [] });
    try {
      const items = await billingService.fetchInvoiceItems(invoiceId);
      set({ items, itemsLoading: false });
    } catch (e) {
      set({ error: toMessage(e), itemsLoading: false });
    }
  },
}));
