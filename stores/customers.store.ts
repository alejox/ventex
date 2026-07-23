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
  /** Devuelve true si el alta fue correcta (para que el componente navegue/cierre). */
  addCustomer: (input: NewCustomerInput) => Promise<boolean>;
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
}));
