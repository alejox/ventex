import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as offersService from "@/services/offers.service";
import type { ProductOffer, OfferInput } from "@/services/offers.service";

interface OffersState {
  offers: ProductOffer[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchOffers: () => Promise<void>;
  addOffer: (input: OfferInput) => Promise<boolean>;
  updateOffer: (id: string, input: OfferInput) => Promise<boolean>;
  setOfferActive: (id: string, active: boolean) => Promise<boolean>;
  deleteOffer: (id: string) => Promise<boolean>;
}

export const useOffersStore = create<OffersState>((set) => ({
  offers: [],
  // Arranca en `true`: el primer render es anterior al fetch del efecto, y
  // con `false` mostraba "Aún no tenés ofertas" sobre datos que sí existen
  // (mismo motivo que inventory.store.ts / services.store.ts).
  loading: true,
  submitting: false,
  error: null,

  fetchOffers: async () => {
    set({ loading: true, error: null });
    try {
      const offers = await offersService.fetchOffers();
      set({ offers, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addOffer: async (input) => {
    set({ submitting: true, error: null });
    try {
      const offer = await offersService.createOffer(input);
      set((s) => ({ offers: [offer, ...s.offers], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateOffer: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const offer = await offersService.updateOffer(id, input);
      set((s) => ({
        offers: s.offers.map((o) => (o.id === id ? offer : o)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  setOfferActive: async (id, active) => {
    try {
      await offersService.setOfferActive(id, active);
      set((s) => ({ offers: s.offers.map((o) => (o.id === id ? { ...o, active } : o)) }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  deleteOffer: async (id) => {
    try {
      await offersService.deleteOffer(id);
      set((s) => ({ offers: s.offers.filter((o) => o.id !== id) }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },
}));
