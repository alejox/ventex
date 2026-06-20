import { create } from "zustand";
import * as posService from "@/services/pos.service";
import type {
  CatalogProduct,
  CustomerOption,
  CartLine,
  PaymentMethod,
} from "@/services/pos.service";

export interface SaleTab {
  id: string;
  name: string;
  cart: CartLine[];
  customerId: string | null;
  paymentMethod: PaymentMethod;
}

interface PosState {
  // Datos del catálogo (vienen de services)
  catalog: CatalogProduct[];
  customers: CustomerOption[];
  taxRate: number;
  loading: boolean;
  error: string | null;

  // Estado de pestañas
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
  addToCart: (product: CatalogProduct) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  setCustomer: (customerId: string | null) => void;
  setLineDiscounts: (discounts: { productId: string, discountAmount: number }[]) => void;
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
  paymentMethod: "efectivo",
});

export const usePosStore = create<PosState>((set, get) => {
  const initialTab = createDefaultTab(0);
  
  return {
    catalog: [],
    customers: [],
    taxRate: 0.16,
    loading: false,
    error: null,

    tabs: [initialTab],
    activeTabId: initialTab.id,
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

    addTab: () => set((s) => {
      const newTab = createDefaultTab(s.tabs.length);
      return {
        tabs: [...s.tabs, newTab],
        activeTabId: newTab.id,
      };
    }),

    setActiveTab: (id) => set({ activeTabId: id }),

    removeTab: (id) => set((s) => {
      const newTabs = s.tabs.filter(t => t.id !== id);
      if (newTabs.length === 0) {
        const freshTab = createDefaultTab(0);
        return { tabs: [freshTab], activeTabId: freshTab.id };
      }
      return {
        tabs: newTabs,
        activeTabId: s.activeTabId === id ? newTabs[newTabs.length - 1].id : s.activeTabId,
      };
    }),

    addCustomer: async (name) => {
      try {
        const newCustomer = await posService.createCustomer(name);
        set((s) => {
          // Add to customer list
          const customers = [...s.customers, newCustomer];
          // Auto-select it in current tab
          const tabs = s.tabs.map(t => 
            t.id === s.activeTabId ? { ...t, customerId: newCustomer.id } : t
          );
          return { customers, tabs };
        });
        return true;
      } catch (e) {
        set({ error: toMessage(e) });
        return false;
      }
    },

    addToCart: (product) =>
      set((s) => {
        return {
          tabs: s.tabs.map(t => {
            if (t.id !== s.activeTabId) return t;
            const existing = t.cart.find((l) => l.product.id === product.id);
            const currentQty = existing?.quantity ?? 0;
            if (currentQty >= product.stock_level) return t;
            if (existing) {
              return {
                ...t,
                cart: t.cart.map((l) =>
                  l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l
                ),
              };
            }
            return { ...t, cart: [...t.cart, { product, quantity: 1 }] };
          })
        };
      }),

    increment: (productId) =>
      set((s) => ({
        tabs: s.tabs.map(t => {
          if (t.id !== s.activeTabId) return t;
          const line = t.cart.find((l) => l.product.id === productId);
          if (!line || line.quantity >= line.product.stock_level) return t;
          return {
            ...t,
            cart: t.cart.map((l) =>
              l.product.id === productId ? { ...l, quantity: l.quantity + 1 } : l
            ),
          };
        })
      })),

    decrement: (productId) =>
      set((s) => ({
        tabs: s.tabs.map(t => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart
              .map((l) =>
                l.product.id === productId ? { ...l, quantity: l.quantity - 1 } : l
              )
              .filter((l) => l.quantity > 0),
          };
        })
      })),

    setQuantity: (productId, quantity) =>
      set((s) => ({
        tabs: s.tabs.map(t => {
          if (t.id !== s.activeTabId) return t;
          if (quantity < 1) return { ...t, cart: t.cart.filter((l) => l.product.id !== productId) };
          return {
            ...t,
            cart: t.cart.map((l) =>
              l.product.id === productId
                ? { ...l, quantity: Math.min(quantity, l.product.stock_level) }
                : l
            ),
          };
        })
      })),

    removeFromCart: (productId) =>
      set((s) => ({
        tabs: s.tabs.map(t => 
          t.id === s.activeTabId 
            ? { ...t, cart: t.cart.filter((l) => l.product.id !== productId) } 
            : t
        )
      })),

    setCustomer: (customerId) => 
      set((s) => ({
        tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, customerId } : t)
      })),
      
    setLineDiscounts: (discounts) => 
      set((s) => ({
        tabs: s.tabs.map(t => {
          if (t.id !== s.activeTabId) return t;
          const newCart = t.cart.map(line => {
            const d = discounts.find(x => x.productId === line.product.id);
            if (d) {
              return { ...line, discountAmount: d.discountAmount };
            }
            return line;
          });
          return { ...t, cart: newCart };
        })
      })),
      
    setPaymentMethod: (paymentMethod) => 
      set((s) => ({
        tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, paymentMethod } : t)
      })),
      
    clearCart: () => 
      set((s) => ({
        tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, cart: [], customerId: null } : t)
      })),

    checkout: async () => {
      const state = get();
      const activeTab = state.tabs.find(t => t.id === state.activeTabId);
      if (!activeTab || activeTab.cart.length === 0) return false;
      
      const { cart, customerId, paymentMethod } = activeTab;
      
      set({ submitting: true, error: null });
      try {
        const totalDiscount = cart.reduce((acc, line) => acc + (line.discountAmount || 0), 0);
        await posService.createSale({
          customerId,
          paymentMethod,
          discount: totalDiscount,
          items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        });
        
        // Refresca el catálogo para reflejar el stock ya descontado por la RPC.
        const catalog = await posService.fetchCatalog();
        
        set((s) => ({
          submitting: false,
          catalog,
          tabs: s.tabs.map(t => 
            t.id === s.activeTabId 
              ? { ...t, cart: [], customerId: null } 
              : t
          )
        }));
        
        return true;
      } catch (e) {
        set({ error: toMessage(e), submitting: false });
        return false;
      }
    },
  };
});
