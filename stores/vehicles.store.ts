import { create } from "zustand";
import * as vehiclesService from "@/services/vehicles.service";
import type {
  Vehicle,
  NewVehicleInput,
  VehicleVisit,
} from "@/services/vehicles.service";

interface VehiclesState {
  vehicles: Vehicle[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  history: VehicleVisit[];
  historyLoading: boolean;

  fetchVehicles: () => Promise<void>;
  addVehicle: (input: NewVehicleInput) => Promise<boolean>;
  updateVehicle: (id: string, input: NewVehicleInput) => Promise<boolean>;
  fetchHistory: (vehicleId: string) => Promise<void>;
  clearHistory: () => void;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useVehiclesStore = create<VehiclesState>((set) => ({
  vehicles: [],
  loading: false,
  error: null,
  submitting: false,
  history: [],
  historyLoading: false,

  fetchVehicles: async () => {
    set({ loading: true, error: null });
    try {
      const vehicles = await vehiclesService.fetchVehicles();
      set({ vehicles, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addVehicle: async (input) => {
    set({ submitting: true, error: null });
    try {
      const vehicle = await vehiclesService.createVehicle(input);
      set((s) => ({ vehicles: [...s.vehicles, vehicle], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateVehicle: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const vehicle = await vehiclesService.updateVehicle(id, input);
      set((s) => ({
        vehicles: s.vehicles.map((v) => (v.id === id ? vehicle : v)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  fetchHistory: async (vehicleId) => {
    set({ historyLoading: true, history: [] });
    try {
      const history = await vehiclesService.fetchVehicleHistory(vehicleId);
      set({ history, historyLoading: false });
    } catch (e) {
      set({ error: toMessage(e), historyLoading: false });
    }
  },

  clearHistory: () => set({ history: [] }),
}));
