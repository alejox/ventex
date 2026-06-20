import { create } from "zustand";
import * as servicesService from "@/services/services.service";
import type { Service, NewServiceInput } from "@/services/services.service";

interface ServicesState {
  services: Service[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchServices: () => Promise<void>;
  /** Devuelve true si el alta fue correcta (para que el componente cierre el modal). */
  addService: (input: NewServiceInput) => Promise<boolean>;
  updateService: (id: string, input: NewServiceInput) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useServicesStore = create<ServicesState>((set) => ({
  services: [],
  loading: false,
  error: null,
  submitting: false,

  fetchServices: async () => {
    set({ loading: true, error: null });
    try {
      const services = await servicesService.fetchServices();
      set({ services, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addService: async (input) => {
    set({ submitting: true, error: null });
    try {
      const service = await servicesService.createService(input);
      set((s) => ({ services: [...s.services, service], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateService: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const service = await servicesService.updateService(id, input);
      set((s) => ({
        services: s.services.map((x) => (x.id === id ? service : x)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
