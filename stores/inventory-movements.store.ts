import { create } from "zustand";
import * as movementsService from "@/services/inventory-movements.service";
import type { InventoryMovement, ManualMovementInput } from "@/services/inventory-movements.service";

interface MovementsState {
  movements: InventoryMovement[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchMovements: (productId?: string) => Promise<void>;
  addMovement: (input: ManualMovementInput) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useMovementsStore = create<MovementsState>((set) => ({
  movements: [],
  loading: false,
  error: null,
  submitting: false,

  fetchMovements: async (productId) => {
    set({ loading: true, error: null });
    try {
      const movements = await movementsService.fetchMovements(productId);
      set({ movements, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addMovement: async (input) => {
    set({ submitting: true, error: null });
    try {
      await movementsService.createManualMovement(input);
      const movements = await movementsService.fetchMovements();
      set({ movements, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
