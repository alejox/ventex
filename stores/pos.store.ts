import { create } from "zustand";
import * as posService from "@/services/pos.service";
import type {
  CatalogItem,
  CustomerOption,
  CartLine,
  PaymentMethod,
} from "@/services/pos.service";

interface PosState {
  // Datos del catálogo (vienen de services)
  catalog: CatalogItem[];
  customers: CustomerOption[];
  taxRate: number;
  loading: boolean;
  error: string | null;

  // Estado de la orden actual
  cart: CartLine[];
  customerId: string | null;
  discount: number;
  paymentMethod: PaymentMethod;
  submitting: boolean;

  init: () => Promise<void>;
  addToCart: (item: CatalogItem) => void;
  increment: (itemId: string) => void;
  decrement: (itemId: string) => void;
  removeFromCart: (itemId: string) => void;
  setCustomer: (customerId: string | null) => void;
  setDiscount: (discount: number) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  clearCart: () => void;
  /** Devuelve true si la venta se registró (para que el componente limpie la UI). */
  checkout: () => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const usePosStore = create<PosState>((set, get) => ({
  catalog: [],
  customers: [],
  taxRate: 0.16,
  loading: false,
  error: null,

  cart: [],
  customerId: null,
  discount: 0,
  paymentMethod: "efectivo",
  submitting: false,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const [catalog, customers, taxRate] = await Promise.all([
        posService.fetchCatalog(),
        posService.fetchCustomers(),
        posService.fetchTaxRate(),
      ]);
      set({ catalog, customers, taxRate, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addToCart: (item) =>
    set((s) => {
      const existing = s.cart.find((l) => l.item.id === item.id);
      if (existing) {
        return {
          cart: s.cart.map((l) =>
            l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        };
      }
      return { cart: [...s.cart, { item, quantity: 1 }] };
    }),

  increment: (itemId) =>
    set((s) => ({
      cart: s.cart.map((l) =>
        l.item.id === itemId ? { ...l, quantity: l.quantity + 1 } : l,
      ),
    })),

  decrement: (itemId) =>
    set((s) => ({
      cart: s.cart
        .map((l) =>
          l.item.id === itemId ? { ...l, quantity: l.quantity - 1 } : l,
        )
        .filter((l) => l.quantity > 0),
    })),

  removeFromCart: (itemId) =>
    set((s) => ({ cart: s.cart.filter((l) => l.item.id !== itemId) })),

  setCustomer: (customerId) => set({ customerId }),
  setDiscount: (discount) => set({ discount: Number.isFinite(discount) ? Math.max(discount, 0) : 0 }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  clearCart: () => set({ cart: [], discount: 0, customerId: null }),

  checkout: async () => {
    const { cart, customerId, discount, paymentMethod } = get();
    if (cart.length === 0) return false;
    set({ submitting: true, error: null });
    try {
      await posService.createSale({
        customerId,
        paymentMethod,
        discount,
        items: cart.map((l) =>
          l.item.kind === "service"
            ? { service_id: l.item.id, quantity: l.quantity }
            : { product_id: l.item.id, quantity: l.quantity },
        ),
      });
      // Refresca el catálogo para reflejar el stock ya descontado por la RPC.
      const catalog = await posService.fetchCatalog();
      set({ cart: [], discount: 0, customerId: null, submitting: false, catalog });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
