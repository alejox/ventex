import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as loyaltyService from "@/services/loyalty.service";
import type { LoyaltyConfig } from "@/services/loyalty.service";
import { EMPTY_LOYALTY_CONFIG } from "@/services/loyalty.service";

/**
 * Configuración de puntos de fidelización (tienda). El saldo y el historial
 * de UN cliente puntual, y el canje contra una venta, se piden directo al
 * servicio (`loyalty.service.ts`) desde donde hacen falta — POS y Clientes —
 * igual que ya hace `promos.store.ts` con `fetchCustomerPromoTarget`/
 * `redeemPromo`: son consultas puntuales, no estado que valga la pena
 * compartir entre pantallas.
 */
interface LoyaltyState {
  config: LoyaltyConfig;
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchConfig: () => Promise<void>;
  saveConfig: (config: LoyaltyConfig) => Promise<boolean>;
}

export const useLoyaltyStore = create<LoyaltyState>((set) => ({
  config: EMPTY_LOYALTY_CONFIG,
  loading: true,
  submitting: false,
  error: null,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await loyaltyService.fetchLoyaltyConfig();
      set({ config, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  saveConfig: async (config) => {
    set({ submitting: true, error: null });
    try {
      await loyaltyService.saveLoyaltyConfig(config);
      set({ config, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
