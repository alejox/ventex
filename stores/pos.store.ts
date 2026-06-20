import { create } from "zustand";
import * as posService from "@/services/pos.service";
import type {
  CatalogItem,
  CustomerOption,
  StaffOption,
  CartLine,
  PaymentMethod,
} from "@/services/pos.service";

export interface SaleTab {
  id: string;
  name: string;
  cart: CartLine[];
  customerId: string | null;
  staffId: string | null;
  paymentMethod: PaymentMethod;
}

interface PosState {
  // Datos del catálogo (vienen de services)
  catalog: CatalogItem[];
  customers: CustomerOption[];
  staff: StaffOption[];
  taxRate: number;
  loading: boolean;
  error: string | null;

  // Estado de pestañas (cada venta concurrente es una pestaña)
  tabs: SaleTab[];
  activeTabId: string;
  submitting: boolean;

  init: () => Promise<void>;

  // Gestión de pestañas
  addTab: () => void;
  setActiveTab: (id: string) => void;
  removeTab: (id: string) => void;

  // Gestión de clientes
  addCustomer: (name: string) => Promise<boolean>;

  // Acciones sobre la pestaña activa
  addToCart: (item: CatalogItem) => void;
  increment: (itemId: string) => void;
  decrement: (itemId: string) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  setCustomer: (customerId: string | null) => void;
  setStaff: (staffId: string | null) => void;
  setLineDiscounts: (discounts: { itemId: string; discountAmount: number }[]) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  clearCart: () => void;
  /** Devuelve true si la venta se registró (para que el componente limpie la UI). */
  checkout: () => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

const createDefaultTab = (index: number): SaleTab => ({
  id: `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  name: index === 0 ? "Venta principal" : `Venta ${index + 1}`,
  cart: [],
  customerId: null,
  staffId: null,
  paymentMethod: "efectivo",
});

/**
 * Productos tienen stock finito (no se puede vender más del disponible);
 * los servicios no llevan stock (stock_level === null) y no tienen tope.
 */
const atStockLimit = (item: CatalogItem, qty: number) =>
  item.kind === "product" && item.stock_level != null && qty >= item.stock_level;

export const usePosStore = create<PosState>((set, get) => {
  const initialTab = createDefaultTab(0);

  return {
    catalog: [],
    customers: [],
    staff: [],
    taxRate: 0.16,
    loading: false,
    error: null,

    tabs: [initialTab],
    activeTabId: initialTab.id,
    submitting: false,

    init: async () => {
      set({ loading: true, error: null });
      try {
        const [catalog, customers, staff, taxRate] = await Promise.all([
          posService.fetchCatalog(),
          posService.fetchCustomers(),
          posService.fetchStaff(),
          posService.fetchTaxRate(),
        ]);
        set({ catalog, customers, staff, taxRate, loading: false });
      } catch (e) {
        set({ error: toMessage(e), loading: false });
      }
    },

    addTab: () =>
      set((s) => {
        const newTab = createDefaultTab(s.tabs.length);
        return { tabs: [...s.tabs, newTab], activeTabId: newTab.id };
      }),

    setActiveTab: (id) => set({ activeTabId: id }),

    removeTab: (id) =>
      set((s) => {
        const newTabs = s.tabs.filter((t) => t.id !== id);
        if (newTabs.length === 0) {
          const freshTab = createDefaultTab(0);
          return { tabs: [freshTab], activeTabId: freshTab.id };
        }
        return {
          tabs: newTabs,
          activeTabId:
            s.activeTabId === id ? newTabs[newTabs.length - 1].id : s.activeTabId,
        };
      }),

    addCustomer: async (name) => {
      try {
        const newCustomer = await posService.createCustomer(name);
        set((s) => ({
          customers: [...s.customers, newCustomer],
          // Auto-seleccionar el cliente recién creado en la pestaña activa.
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId ? { ...t, customerId: newCustomer.id } : t,
          ),
        }));
        return true;
      } catch (e) {
        set({ error: toMessage(e) });
        return false;
      }
    },

    addToCart: (item) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          const existing = t.cart.find((l) => l.item.id === item.id);
          const currentQty = existing?.quantity ?? 0;
          if (atStockLimit(item, currentQty)) return t;
          if (existing) {
            return {
              ...t,
              cart: t.cart.map((l) =>
                l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
              ),
            };
          }
          return { ...t, cart: [...t.cart, { item, quantity: 1 }] };
        }),
      })),

    increment: (itemId) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          const line = t.cart.find((l) => l.item.id === itemId);
          if (!line || atStockLimit(line.item, line.quantity)) return t;
          return {
            ...t,
            cart: t.cart.map((l) =>
              l.item.id === itemId ? { ...l, quantity: l.quantity + 1 } : l,
            ),
          };
        }),
      })),

    decrement: (itemId) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart
              .map((l) =>
                l.item.id === itemId ? { ...l, quantity: l.quantity - 1 } : l,
              )
              .filter((l) => l.quantity > 0),
          };
        }),
      })),

    setQuantity: (itemId, quantity) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          if (quantity < 1) {
            return { ...t, cart: t.cart.filter((l) => l.item.id !== itemId) };
          }
          return {
            ...t,
            cart: t.cart.map((l) => {
              if (l.item.id !== itemId) return l;
              const capped =
                l.item.kind === "product" && l.item.stock_level != null
                  ? Math.min(quantity, l.item.stock_level)
                  : quantity;
              return { ...l, quantity: capped };
            }),
          };
        }),
      })),

    removeFromCart: (itemId) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, cart: t.cart.filter((l) => l.item.id !== itemId) }
            : t,
        ),
      })),

    setCustomer: (customerId) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId ? { ...t, customerId } : t,
        ),
      })),

    setStaff: (staffId) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, staffId } : t)),
      })),

    setLineDiscounts: (discounts) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart.map((line) => {
              const d = discounts.find((x) => x.itemId === line.item.id);
              return d ? { ...line, discountAmount: d.discountAmount } : line;
            }),
          };
        }),
      })),

    setPaymentMethod: (paymentMethod) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId ? { ...t, paymentMethod } : t,
        ),
      })),

    clearCart: () =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, cart: [], customerId: null, staffId: null }
            : t,
        ),
      })),

    checkout: async () => {
      const state = get();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!activeTab || activeTab.cart.length === 0) return false;

      const { cart, customerId, staffId, paymentMethod } = activeTab;

      set({ submitting: true, error: null });
      try {
        const totalDiscount = cart.reduce((acc, l) => acc + (l.discountAmount || 0), 0);
        await posService.createSale({
          customerId,
          staffId,
          paymentMethod,
          discount: totalDiscount,
          items: cart.map((l) =>
            l.item.kind === "service"
              ? { service_id: l.item.id, quantity: l.quantity }
              : { product_id: l.item.id, quantity: l.quantity },
          ),
        });

        // Refresca el catálogo para reflejar el stock ya descontado por la RPC.
        const catalog = await posService.fetchCatalog();

        set((s) => ({
          submitting: false,
          catalog,
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId
              ? { ...t, cart: [], customerId: null, staffId: null }
              : t,
          ),
        }));

        return true;
      } catch (e) {
        set({ error: toMessage(e), submitting: false });
        return false;
      }
    },
  };
});
