import { create } from "zustand";
import { toMessage } from "@/lib/errors";
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
  /**
   * Activa o archiva sin abrir el formulario (acción de fila del catálogo).
   * Reemplaza al borrado: ver el comentario en `services.service.ts`.
   */
  setServiceStatus: (id: string, status: "active" | "inactive") => Promise<boolean>;
}


export const useServicesStore = create<ServicesState>((set) => ({
  services: [],
  // Arranca en `true`: el primer render es anterior al fetch del efecto, y con
  // `false` mostraba el estado vacío sobre datos que sí existen.
  loading: true,
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

  setServiceStatus: async (id, status) => {
    set({ submitting: true, error: null });
    try {
      await servicesService.setServiceStatus(id, status);
      set((s) => ({
        services: s.services.map((x) => (x.id === id ? { ...x, status } : x)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

}));
