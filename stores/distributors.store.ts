import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as distributorsService from "@/services/distributors.service";
import type { Distributor, NewDistributorInput } from "@/services/distributors.service";

interface DistributorsState {
  distributors: Distributor[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchDistributors: () => Promise<void>;
  /**
   * Devuelve el proveedor creado, o `null` si falló.
   *
   * Devuelve la fila y no un booleano porque quien lo crea desde un formulario
   * de compra necesita el `id` para dejarlo seleccionado; sigue sirviendo como
   * chequeo de éxito (`if (ok)`) para quien solo quiera cerrar el modal.
   */
  addDistributor: (input: NewDistributorInput) => Promise<Distributor | null>;
  updateDistributor: (id: string, input: NewDistributorInput) => Promise<boolean>;
  deleteDistributor: (id: string) => Promise<boolean>;
}


export const useDistributorsStore = create<DistributorsState>((set) => ({
  distributors: [],
  // Arranca en `true`: el primer render es anterior al fetch del efecto, y con
  // `false` mostraba el estado vacío sobre datos que sí existen.
  loading: true,
  error: null,
  submitting: false,

  fetchDistributors: async () => {
    set({ loading: true, error: null });
    try {
      const distributors = await distributorsService.fetchDistributors();
      set({ distributors, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addDistributor: async (input) => {
    set({ submitting: true, error: null });
    try {
      const distributor = await distributorsService.createDistributor(input);
      set((s) => ({ distributors: [...s.distributors, distributor], submitting: false }));
      return distributor;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  updateDistributor: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const distributor = await distributorsService.updateDistributor(id, input);
      set((s) => ({
        distributors: s.distributors.map((d) => (d.id === id ? distributor : d)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  deleteDistributor: async (id) => {
    set({ submitting: true, error: null });
    try {
      await distributorsService.deleteDistributor(id);
      set((s) => ({
        distributors: s.distributors.filter((d) => d.id !== id),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
