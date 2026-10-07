import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as service from "@/services/production.service";
import type {
  BatchFilters,
  ProductionBatch,
  RegisterBatchResult,
  VoidBatchResult,
} from "@/services/production.service";

/**
 * Lotes de producción. `registerBatch` guarda el id del INTENTO
 * (`pendingClientBatchId`) hasta que el lote queda registrado: un reintento
 * tras un error de red manda el mismo id y la base devuelve el lote que ya
 * existía en vez de descontar dos veces. Al cambiar lo que se va a registrar
 * (otro producto u otra cantidad), la pantalla llama `resetAttempt`.
 */

export interface RegisterBatchFormInput {
  productId: string;
  /** Uno de los dos. */
  batches?: number;
  outputQty?: number;
  notes?: string;
}

interface ProductionState {
  batches: ProductionBatch[];
  loading: boolean;
  registering: boolean;
  /** Lote que se está anulando (para el spinner de su fila). */
  voidingId: string | null;
  error: string | null;
  /** Resultado del último registro, para el aviso de éxito (insumos en negativo, costo). */
  lastResult: RegisterBatchResult | null;
  pendingClientBatchId: string | null;
  filters: BatchFilters;

  fetchBatches: (filters?: BatchFilters) => Promise<void>;
  registerBatch: (input: RegisterBatchFormInput) => Promise<RegisterBatchResult | null>;
  voidBatch: (batchId: string, reason?: string) => Promise<VoidBatchResult | null>;
  /** Olvida el intento en curso (cambió el formulario o se cerró el modal). */
  resetAttempt: () => void;
  clearError: () => void;
}

export const useProductionStore = create<ProductionState>((set, get) => ({
  batches: [],
  loading: false,
  registering: false,
  voidingId: null,
  error: null,
  lastResult: null,
  pendingClientBatchId: null,
  filters: {},

  fetchBatches: async (filters) => {
    const next = filters ?? get().filters;
    set({ loading: true, error: null, filters: next });
    try {
      const batches = await service.fetchBatches(next);
      set({ batches, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  registerBatch: async (input) => {
    if (get().registering) return null;
    const clientBatchId = get().pendingClientBatchId ?? service.newClientBatchId();
    set({ registering: true, error: null, pendingClientBatchId: clientBatchId });
    try {
      const result = await service.registerBatch({ ...input, clientBatchId });
      set({ registering: false, lastResult: result, pendingClientBatchId: null });
      await get().fetchBatches();
      return result;
    } catch (e) {
      // El id del intento se conserva: reintentar no duplica el lote.
      set({ registering: false, error: toMessage(e) });
      return null;
    }
  },

  voidBatch: async (batchId, reason) => {
    if (get().voidingId) return null;
    set({ voidingId: batchId, error: null });
    try {
      const result = await service.voidBatch(batchId, reason);
      set({ voidingId: null });
      await get().fetchBatches();
      return result;
    } catch (e) {
      set({ voidingId: null, error: toMessage(e) });
      return null;
    }
  },

  resetAttempt: () => set({ pendingClientBatchId: null }),
  clearError: () => set({ error: null }),
}));
