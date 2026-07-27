import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as deliveryService from "@/services/delivery.service";
import type {
  DeliveryPerson,
  Delivery,
  DeliveryStatus,
} from "@/services/delivery.service";

interface DeliveryState {
  persons: DeliveryPerson[];
  deliveries: Delivery[];
  loading: boolean;
  error: string | null;

  fetchPersons: () => Promise<void>;
  addPerson: (input: { name: string; phone: string }) => Promise<DeliveryPerson | false>;
  removePerson: (id: string) => Promise<boolean>;

  fetchDeliveries: (status?: DeliveryStatus) => Promise<void>;
  changeStatus: (id: string, status: DeliveryStatus) => Promise<boolean>;
}

export const useDeliveryStore = create<DeliveryState>((set) => ({
  persons: [],
  deliveries: [],
  loading: false,
  error: null,

  fetchPersons: async () => {
    set({ loading: true, error: null });
    try {
      const persons = await deliveryService.fetchDeliveryPersons();
      set({ persons, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addPerson: async (input) => {
    try {
      const person = await deliveryService.createDeliveryPerson(input);
      set((s) => ({ persons: [...s.persons, person] }));
      return person;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  removePerson: async (id) => {
    try {
      await deliveryService.deleteDeliveryPerson(id);
      set((s) => ({ persons: s.persons.filter((p) => p.id !== id) }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  fetchDeliveries: async (status) => {
    set({ loading: true, error: null });
    try {
      const deliveries = await deliveryService.fetchDeliveries(status);
      set({ deliveries, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  changeStatus: async (id, status) => {
    try {
      await deliveryService.updateDeliveryStatus(id, status);
      set((s) => ({
        deliveries: s.deliveries.map((d) =>
          d.id === id ? { ...d, status } : d,
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },
}));
