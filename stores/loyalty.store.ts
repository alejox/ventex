import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as loyaltyService from "@/services/loyalty.service";
import type { LoyaltyConfig, LoyaltyLedgerEntry } from "@/services/loyalty.service";
import { EMPTY_LOYALTY_CONFIG } from "@/services/loyalty.service";

/**
 * Configuración de puntos de fidelización (tienda). El saldo y el historial
 * de UN cliente puntual, y el canje contra una venta, se delegan al servicio.
 */
interface LoyaltyState {
  config: LoyaltyConfig;
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchConfig: () => Promise<void>;
  saveConfig: (config: LoyaltyConfig) => Promise<boolean>;
  fetchBalance: (customerId: string) => Promise<number>;
  redeemPoints: (saleId: string, points: number) => Promise<number>;
  fetchLedger: (customerId: string) => Promise<LoyaltyLedgerEntry[]>;
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
  fetchBalance: (customerId) => loyaltyService.fetchCustomerLoyaltyBalance(customerId),
  redeemPoints: (saleId, points) => loyaltyService.redeemLoyaltyPoints(saleId, points),
  fetchLedger: (customerId) => loyaltyService.fetchLoyaltyLedger(customerId),
}));
