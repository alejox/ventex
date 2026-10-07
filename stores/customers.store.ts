import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import type { ImportResult } from "@/lib/import/core";
import type { AbonoOptions } from "@/lib/credits";
import * as customersService from "@/services/customers.service";
import type { Customer, NewCustomerInput } from "@/services/customers.service";

interface CustomersState {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchCustomers: () => Promise<void>;
  /**
   * Devuelve el cliente creado (no un booleano): StudentForm necesita su `id`
   * para crear al alumno sin volver a leer la lista, y así puede quedarse con
   * el id si el guardado del alumno falla después (evita duplicar el cliente
   * en el reintento).
   */
  addCustomer: (input: NewCustomerInput) => Promise<Customer | null>;
  updateCustomer: (id: string, input: NewCustomerInput) => Promise<boolean>;
  deleteCustomer: (id: string) => Promise<boolean>;
  registerPayment: (customerId: string, amount: number, notes?: string, options?: AbonoOptions) => Promise<boolean>;
  /** Borra y devuelve el mensaje de error (o `null`), para mostrarlo DENTRO del diálogo. */
  deleteCustomerOrError: (id: string) => Promise<string | null>;
  fetchImpact: (id: string) => Promise<customersService.CustomerImpact>;
  importCustomers: (
    items: customersService.CustomerImportItem[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<ImportResult>;
}


export const useCustomersStore = create<CustomersState>((set, get) => ({
  customers: [],
  // Arranca en `true`: el primer render es anterior al fetch del efecto, y con
  // `false` mostraba el estado vacío sobre datos que sí existen.
  loading: true,
  error: null,
  submitting: false,

  fetchCustomers: async () => {
    set({ loading: true, error: null });
    try {
      const customers = await customersService.fetchCustomers();
      set({ customers, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addCustomer: async (input) => {
    set({ submitting: true, error: null });
    try {
      const customer = await customersService.createCustomer(input);
      set((s) => ({ customers: [...s.customers, customer], submitting: false }));
      return customer;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  updateCustomer: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const customer = await customersService.updateCustomer(id, input);
      set((s) => ({
        customers: s.customers.map((c) => (c.id === id ? customer : c)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  deleteCustomer: async (id) => {
    set({ submitting: true, error: null });
    try {
      await customersService.deleteCustomer(id);
      set((s) => ({
        customers: s.customers.filter((c) => c.id !== id),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  registerPayment: async (customerId, amount, notes, options) => {
    set({ error: null });
    try {
      // El saldo que queda lo dice la base, no una resta local: entre que se
      // leyó la lista y se cobró el abono pudo cobrar alguien más, y el número
      // que se le muestra al cliente tiene que ser el que quedó asentado.
      const balance = await customersService.registerPayment(customerId, amount, notes, options);
      set((s) => ({
        customers: s.customers.map((c) =>
          c.id === customerId ? { ...c, credit_balance: balance } : c,
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  deleteCustomerOrError: async (id) => {
    set({ submitting: true });
    try {
      await customersService.deleteCustomer(id);
      set((s) => ({ customers: s.customers.filter((c) => c.id !== id), submitting: false }));
      return null;
    } catch (e) {
      set({ submitting: false });
      return toMessage(e);
    }
  },

  fetchImpact: (id) => customersService.fetchCustomerImpact(id),

  importCustomers: async (items, onProgress) => {
    const result = await customersService.importCustomers(items, onProgress);
    await get().fetchCustomers();
    return result;
  },
}));
