import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as customersService from "@/services/customers.service";
import type { Customer, NewCustomerInput } from "@/services/customers.service";

interface CustomersState {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchCustomers: () => Promise<void>;
  addCustomer: (input: NewCustomerInput) => Promise<boolean>;
  updateCustomer: (id: string, input: NewCustomerInput) => Promise<boolean>;
  deleteCustomer: (id: string) => Promise<boolean>;
  registerPayment: (customerId: string, amount: number, notes?: string) => Promise<boolean>;
}


export const useCustomersStore = create<CustomersState>((set) => ({
  customers: [],
  loading: false,
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
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
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

  registerPayment: async (customerId, amount, notes) => {
    set({ error: null });
    try {
      await customersService.registerPayment(customerId, amount, notes);
      set((s) => ({
        customers: s.customers.map((c) =>
          c.id === customerId
            ? { ...c, credit_balance: Math.max(0, c.credit_balance - amount) }
            : c,
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },
}));
