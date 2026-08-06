import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as purchasesService from "@/services/purchases.service";
import type { PurchaseInvoice, PurchaseInvoiceParams } from "@/services/purchases.service";

interface PurchasesState {
  invoices: PurchaseInvoice[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchInvoices: () => Promise<void>;
  createInvoice: (params: PurchaseInvoiceParams) => Promise<boolean>;
  updateStatus: (id: string, status: string) => Promise<boolean>;
  updateInvoice: (id: string, params: PurchaseInvoiceParams) => Promise<boolean>;
  /** El servicio lee sus propias líneas para devolver el stock exacto. */
  cancelInvoice: (id: string) => Promise<boolean>;
}


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

  // Marca `submitting` y devuelve si salió bien, igual que el resto: ahora el
  // cambio de estado pasa por un modal que necesita saber las dos cosas para
  // mostrar "Guardando…" y para no cerrarse cuando el servicio rechaza.
  updateStatus: async (id, status) => {
    set({ submitting: true, error: null });
    try {
      await purchasesService.updateInvoiceStatus(id, status);
      set((s) => ({
        invoices: s.invoices.map((inv) =>
          inv.id === id ? { ...inv, status } : inv
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  cancelInvoice: async (id) => {
    set({ submitting: true, error: null });
    try {
      await purchasesService.cancelPurchaseInvoice(id);
      set((s) => ({
        invoices: s.invoices.map((inv) =>
          inv.id === id ? { ...inv, status: "cancelled" } : inv
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
