import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as service from "@/services/purchase-orders.service";
import type {
  PurchaseOrder,
  SavePurchaseOrderInput,
} from "@/services/purchase-orders.service";

interface PurchaseOrdersState {
  orders: PurchaseOrder[];
  loading: boolean;
  submitting: boolean;
  error: string | null;

  fetchOrders: () => Promise<void>;
  /** Devuelve el pedido creado para que la pantalla muestre su número. */
  saveDraft: (input: SavePurchaseOrderInput, id?: string | null) => Promise<PurchaseOrder | null>;
  issue: (input: SavePurchaseOrderInput, id?: string | null) => Promise<PurchaseOrder | null>;
  receive: (order: PurchaseOrder) => Promise<boolean>;
  /** Cierra el pedido sin crear compra ni mover stock. */
  complete: (id: string) => Promise<boolean>;
  cancel: (id: string) => Promise<boolean>;
  clearError: () => void;
}

export const usePurchaseOrdersStore = create<PurchaseOrdersState>((set, get) => ({
  orders: [],
  // Arranca en `true`: el primer render es anterior al fetch del efecto, y con
  // `false` mostraba el estado vacío sobre datos que sí existen.
  loading: true,
  submitting: false,
  error: null,

  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await service.fetchPurchaseOrders();
      set({ orders, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  saveDraft: async (input, id) => {
    set({ submitting: true, error: null });
    try {
      // Con id se está retomando un borrador: se reemplazan sus líneas en vez
      // de acumular un pedido nuevo cada vez que se guarda.
      const order = id
        ? await service.updatePurchaseOrder(id, input)
        : await service.createPurchaseOrder(input, "draft");
      await get().fetchOrders();
      set({ submitting: false });
      return order;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  issue: async (input, id) => {
    set({ submitting: true, error: null });
    try {
      let order: PurchaseOrder;
      if (id) {
        order = await service.updatePurchaseOrder(id, input);
        await service.issuePurchaseOrder(id);
        order = { ...order, status: "issued" };
      } else {
        order = await service.createPurchaseOrder(input, "issued");
      }
      await get().fetchOrders();
      set({ submitting: false });
      return order;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  receive: async (order) => {
    set({ submitting: true, error: null });
    try {
      await service.receivePurchaseOrder(order);
      await get().fetchOrders();
      set({ submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  complete: async (id) => {
    set({ submitting: true, error: null });
    try {
      await service.completePurchaseOrder(id);
      // Se recarga en vez de parchear en memoria: el pedido cambia de estado
      // pero SIGUE en la lista (a diferencia de cancelar, que lo saca), y hay
      // que traer el `completed_at` que puso la base.
      await get().fetchOrders();
      set({ submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  cancel: async (id) => {
    set({ submitting: true, error: null });
    try {
      await service.cancelPurchaseOrder(id);
      set((s) => ({ orders: s.orders.filter((o) => o.id !== id), submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
