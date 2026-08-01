import { create } from "zustand";
import {
  subscribeToPlan,
  fetchBillingOrder,
  fetchCheckoutAuthStatus,
  fetchBillingStatus,
  setRecurring as setRecurringRequest,
  claimGuestOrders,
  type SubscribePayer,
  type SubscribeResult,
  type BillingOrder,
  type BillingStatus,
} from "@/services/subscription-billing.service";
import { toMessage } from "@/lib/errors";

export type PollResult =
  | { status: "pending" }
  | { status: "paid" }
  | { status: "failed"; error: string | null }
  | { status: "cancelled" };

interface BillingState {
  submitting: boolean;
  error: string | null;
  /** null = aún consultando (landing). */
  checkoutAuthed: boolean | null;
  billing: BillingStatus | null;
  billingLoading: boolean;

  /** Crea la orden y devuelve el checkout hosteado al que hay que redirigir. */
  subscribe: (params: {
    planPeriodId: string;
    payer: SubscribePayer;
    email?: string;
  }) => Promise<SubscribeResult>;
  /** Consulta el estado de una orden (polling del checkout). */
  pollOrder: (orderId: string, email?: string) => Promise<PollResult>;
  /** Devuelve la orden completa (para retomar un pago al volver del checkout). */
  fetchOrder: (orderId: string, email?: string) => Promise<BillingOrder>;
  checkAuth: () => Promise<void>;
  loadBilling: () => Promise<void>;
  setRecurring: (enabled: boolean) => Promise<void>;
  claim: () => Promise<number>;
  reset: () => void;
}

export const useSubscriptionBillingStore = create<BillingState>((set, get) => ({
  submitting: false,
  error: null,
  checkoutAuthed: null,
  billing: null,
  billingLoading: false,

  subscribe: async (params) => {
    set({ submitting: true, error: null });
    try {
      const result = await subscribeToPlan(params);
      set({ submitting: false });
      return result;
    } catch (error) {
      set({ error: toMessage(error), submitting: false });
      throw error;
    }
  },

  pollOrder: async (orderId, email) => {
    const order = await fetchBillingOrder(orderId, email);
    if (order.status === "paid") return { status: "paid" };
    if (order.status === "failed") return { status: "failed", error: order.error };
    if (order.status === "cancelled") return { status: "cancelled" };
    return { status: "pending" };
  },

  fetchOrder: (orderId, email) => fetchBillingOrder(orderId, email),

  checkAuth: async () => {
    try {
      set({ checkoutAuthed: await fetchCheckoutAuthStatus() });
    } catch {
      set({ checkoutAuthed: false });
    }
  },

  loadBilling: async () => {
    set({ billingLoading: true });
    try {
      set({ billing: await fetchBillingStatus(), billingLoading: false });
    } catch (error) {
      set({ error: toMessage(error), billingLoading: false });
    }
  },

  setRecurring: async (enabled) => {
    set({ submitting: true, error: null });
    try {
      await setRecurringRequest(enabled);
      set({ submitting: false });
      await get().loadBilling();
    } catch (error) {
      set({ error: toMessage(error), submitting: false });
      throw error;
    }
  },

  /**
   * Reclama pagos hechos como invitado y devuelve cuántos se activaron, para
   * que la pantalla sepa si tiene que recargar la suscripción.
   */
  claim: async () => {
    try {
      const { activated } = await claimGuestOrders();
      return activated;
    } catch {
      // No es un error accionable para el usuario: si no había nada que
      // reclamar, o la sesión no corresponde, la pantalla sigue igual.
      return 0;
    }
  },

  reset: () => set({ submitting: false, error: null }),
}));
