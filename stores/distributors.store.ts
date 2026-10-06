import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import type { ImportResult } from "@/lib/import/core";
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
  /** Borra y devuelve el mensaje de error (o `null`), para mostrarlo DENTRO del diálogo. */
  deleteDistributorOrError: (id: string) => Promise<string | null>;
  /** Archivar (`inactive`) o reactivar. Devuelve el error o `null`. */
  setDistributorStatus: (id: string, status: "active" | "inactive") => Promise<string | null>;
  fetchImpact: (id: string) => Promise<{ purchases: number; products: number }>;
  importDistributors: (
    items: distributorsService.DistributorImportItem[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<ImportResult>;
}


export const useDistributorsStore = create<DistributorsState>((set, get) => ({
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

  deleteDistributorOrError: async (id) => {
    set({ submitting: true });
    try {
      await distributorsService.deleteDistributor(id);
      set((s) => ({ distributors: s.distributors.filter((d) => d.id !== id), submitting: false }));
      return null;
    } catch (e) {
      set({ submitting: false });
      return toMessage(e);
    }
  },

  setDistributorStatus: async (id, status) => {
    set({ submitting: true });
    try {
      const distributor = await distributorsService.setDistributorStatus(id, status);
      set((s) => ({
        distributors: s.distributors.map((d) => (d.id === id ? distributor : d)),
        submitting: false,
      }));
      return null;
    } catch (e) {
      set({ submitting: false });
      return toMessage(e);
    }
  },

  fetchImpact: (id) => distributorsService.fetchDistributorImpact(id),

  importDistributors: async (items, onProgress) => {
    const result = await distributorsService.importDistributors(items, onProgress);
    await get().fetchDistributors();
    return result;
  },
}));
