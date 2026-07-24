import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as posService from "@/services/pos.service";
import * as settingsService from "@/services/settings.service";
import { lineKey, cartLineKey as keyOf } from "@/services/pos.service";
import type {
  CatalogItem,
  CustomerOption,
  StaffOption,
  CartLine,
  PaymentMethod,
  SaleUnitKind,
} from "@/services/pos.service";

export interface SaleTab {
  id: string;
  name: string;
  cart: CartLine[];
  customerId: string | null;
  staffId: string | null;
  paymentMethod: PaymentMethod;
  transferMethod?: string | null;
  cardMethod?: string | null;
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
  stockAlert: string | null;
  clearStockAlert: () => void;

  // Configuración
  /** Del negocio (`settings.include_tax`). Persiste: no es por venta. */
  includeTax: boolean;
  /** Devuelve false si la RLS rechazó la escritura (empleado sin permiso). */
  setIncludeTax: (val: boolean) => Promise<boolean>;
  /** Del negocio (`settings.allow_oversell`). false = no se cobra sin stock. */
  allowOversell: boolean;
  defaultPaymentMethod: PaymentMethod;
  setDefaultPaymentMethod: (method: PaymentMethod) => void;
  defaultStaffId: string | null;
  setDefaultStaffId: (id: string | null) => void;
  defaultCustomerId: string | null;
  setDefaultCustomerId: (id: string | null) => void;

  init: () => Promise<void>;

  // Gestión de pestañas
  addTab: () => void;
  setActiveTab: (id: string) => void;
  removeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;

  // Gestión de clientes
  addCustomer: (params: { name: string; doc_type?: string; identification?: string }) => Promise<boolean>;

  // Acciones sobre la pestaña activa
  /**
   * El mismo producto suelto y por caja son DOS líneas distintas del carrito,
   * así que las acciones de línea reciben la clave `lineKey(itemId, unitKind)`
   * y no el id del producto: con el id solo, vender 2 cajas y 3 unidades de la
   * misma gaseosa se pisaba en una sola línea.
   */
  addToCart: (item: CatalogItem, unitKind?: SaleUnitKind) => void;
  addToTab: (item: CatalogItem, tabId: string, unitKind?: SaleUnitKind) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  setCustomer: (customerId: string | null) => void;
  setStaff: (staffId: string | null) => void;
  setLineDiscounts: (discounts: { key: string; discountAmount: number }[]) => void;
  setLineStaff: (key: string, staffId: string | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setTransferMethod: (method: string | null) => void;
  setCardMethod: (method: string | null) => void;
  clearCart: () => void;
  /** Devuelve true si la venta se registró (para que el componente limpie la UI). */
  checkout: () => Promise<boolean>;
}


const createDefaultTab = (index: number, get?: () => PosState): SaleTab => {
  const defaultMethod = get?.()?.defaultPaymentMethod ?? "efectivo";
  const defaultStaff = get?.()?.defaultStaffId ?? null;
  const defaultCustomer = get?.()?.defaultCustomerId ?? null;
  return {
    id: `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: index === 0 ? "Venta principal" : `Venta ${index + 1}`,
    cart: [],
    customerId: defaultCustomer,
    staffId: defaultStaff,
    paymentMethod: defaultMethod,
  };
};

/**
 * Un producto queda sobrevendido cuando la cantidad pedida supera su stock.
 * Los servicios no llevan stock (`stock_level === null`) y nunca sobrevenden.
 */
/**
 * Una caja consume N unidades del stock, así que la comparación se hace SIEMPRE
 * en unidades sueltas: 3 cajas de 24 son 72 unidades, no 3.
 */
const unitsFor = (item: CatalogItem, unitKind: SaleUnitKind, qty: number) =>
  qty * (unitKind === "package" ? Math.max(item.units_per_package || 1, 1) : 1);

const oversells = (item: CatalogItem, unitKind: SaleUnitKind, qty: number) =>
  item.kind === "product" &&
  item.stock_level != null &&
  unitsFor(item, unitKind, qty) > item.stock_level;

/**
 * Qué hacer ante una sobreventa: lo decide el negocio en
 * `settings.allow_oversell`, y el RPC `create_sale` lo vuelve a exigir.
 *
 * - Permitida: se avisa y la venta sigue. El inventario suele ir atrasado
 *   respecto al mostrador, y frenar un cobro cuesta más que el descuadre; el
 *   stock queda en negativo, que es la señal de que falta un ajuste.
 * - No permitida: se frena acá para no llegar al servidor con un error.
 */
const oversellMessage = (item: CatalogItem, allowed: boolean) =>
  allowed
    ? `"${item.name}" — quedan ${item.stock_level} uds. La venta sigue y el stock quedará en negativo.`
    : `"${item.name}" — solo quedan ${item.stock_level} uds. y tu negocio no permite vender sin stock.`;

export const usePosStore = create<PosState>((set, get) => {
  return {
    catalog: [],
    customers: [],
    staff: [],
    taxRate: 0.19,
    loading: false,
    error: null,

    tabs: [createDefaultTab(0)], // temporal hasta que se monte el store y sobrescriba si aplica
    activeTabId: "", // se inicializará luego o en la primera tab
    submitting: false,
    stockAlert: null,

    includeTax: true,
    /**
     * Antes esto solo tocaba memoria: apagabas el IVA, recargabas y volvía a
     * estar encendido, porque `init()` relee `settings.include_tax` del
     * backend. Ahora escribe la columna y el POS refleja lo persistido.
     *
     * La actualización es optimista —el toggle tiene que responder al toque—
     * y se revierte si la RLS rechaza la escritura o si falla la red.
     */
    setIncludeTax: async (val) => {
      const previous = get().includeTax;
      if (previous === val) return true;
      set({ includeTax: val });
      try {
        const ok = await settingsService.updateIncludeTax(val);
        if (!ok) set({ includeTax: previous });
        return ok;
      } catch {
        set({ includeTax: previous });
        return false;
      }
    },
    allowOversell: true,
    defaultPaymentMethod: "efectivo",
    setDefaultPaymentMethod: (method) => set({ defaultPaymentMethod: method }),
    defaultStaffId: null,
    setDefaultStaffId: (id) => set({ defaultStaffId: id }),
    defaultCustomerId: null,
    setDefaultCustomerId: (id) => set({ defaultCustomerId: id }),

    init: async () => {
      set({ loading: true, error: null });
      try {
        const [catalog, customers, staff, config] = await Promise.all([
          posService.fetchCatalog(),
          posService.fetchCustomers(),
          posService.fetchStaff(),
          posService.fetchPosConfig(),
        ]);
        // Desglose de IVA y sobreventa son política del negocio y viven en
        // `settings`. El toggle del POS escribe `include_tax` (ver
        // `setIncludeTax`); `allowOversell` solo se configura en Ajustes.
        const { taxRate, includeTax, allowOversell } = config;
        const state = get();
        if (state.activeTabId === "") {
          const firstTab = createDefaultTab(0, get);
          set({ catalog, customers, staff, taxRate, includeTax, allowOversell, loading: false, tabs: [firstTab], activeTabId: firstTab.id });
        } else {
          set({ catalog, customers, staff, taxRate, includeTax, allowOversell, loading: false });
        }
      } catch (e) {
        set({ error: toMessage(e), loading: false });
      }
    },

    addTab: () =>
      set((s) => {
        const newTab = createDefaultTab(s.tabs.length, get);
        return { tabs: [...s.tabs, newTab], activeTabId: newTab.id };
      }),

    setActiveTab: (id) => set({ activeTabId: id }),

    /**
     * Renombrar la venta. Un nombre en blanco no se acepta: una pestaña sin
     * etiqueta es imposible de distinguir de las otras cuando hay varias
     * abiertas, que es justo para lo que sirven las pestañas.
     */
    renameTab: (id, name) =>
      set((s) => {
        const clean = name.trim().slice(0, 40);
        if (!clean) return s;
        return { tabs: s.tabs.map((t) => (t.id === id ? { ...t, name: clean } : t)) };
      }),

    removeTab: (id) =>
      set((s) => {
        const newTabs = s.tabs.filter((t) => t.id !== id);
        if (newTabs.length === 0) {
          const freshTab = createDefaultTab(0, get);
          return { tabs: [freshTab], activeTabId: freshTab.id };
        }
        return {
          tabs: newTabs,
          activeTabId:
            s.activeTabId === id ? newTabs[newTabs.length - 1].id : s.activeTabId,
        };
      }),

    addCustomer: async (params) => {
      try {
        const newCustomer = await posService.createCustomer(params);
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

    addToCart: (item, unitKind = "unit") => {
      const s = get();
      const key = lineKey(item.id, unitKind);
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const existing = tab?.cart.find((l) => keyOf(l) === key);
      const currentQty = existing?.quantity ?? 0;
      if (oversells(item, unitKind, currentQty + 1)) {
        set({ stockAlert: oversellMessage(item, s.allowOversell) });
        if (!s.allowOversell) return;
      }
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          if (existing) {
            return {
              ...t,
              cart: t.cart.map((l) =>
                keyOf(l) === key ? { ...l, quantity: l.quantity + 1 } : l,
              ),
            };
          }
          return { ...t, cart: [...t.cart, { item, unitKind, quantity: 1 }] };
        }),
      }));
    },

    addToTab: (item, tabId, unitKind = "unit") => {
      const s = get();
      const key = lineKey(item.id, unitKind);
      const tab = s.tabs.find((t) => t.id === tabId);
      const existing = tab?.cart.find((l) => keyOf(l) === key);
      const currentQty = existing?.quantity ?? 0;
      if (oversells(item, unitKind, currentQty + 1)) {
        set({ stockAlert: oversellMessage(item, s.allowOversell) });
        if (!s.allowOversell) return;
      }
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== tabId) return t;
          if (existing) {
            return {
              ...t,
              cart: t.cart.map((l) =>
                keyOf(l) === key ? { ...l, quantity: l.quantity + 1 } : l,
              ),
            };
          }
          return { ...t, cart: [...t.cart, { item, unitKind, quantity: 1 }] };
        }),
      }));
    },

    increment: (key) => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const line = tab?.cart.find((l) => keyOf(l) === key);
      if (!line) return;
      if (oversells(line.item, line.unitKind ?? "unit", line.quantity + 1)) {
        set({ stockAlert: oversellMessage(line.item, s.allowOversell) });
        if (!s.allowOversell) return;
      }
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart.map((l) =>
              keyOf(l) === key ? { ...l, quantity: l.quantity + 1 } : l,
            ),
          };
        }),
      }));
    },

    decrement: (key) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart
              .map((l) =>
                keyOf(l) === key ? { ...l, quantity: l.quantity - 1 } : l,
              )
              .filter((l) => l.quantity > 0),
          };
        }),
      })),

    setQuantity: (key, quantity) => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const line = tab?.cart.find((l) => keyOf(l) === key);
      const oversold = !!line && oversells(line.item, line.unitKind ?? "unit", quantity);
      if (oversold && line) {
        set({ stockAlert: oversellMessage(line.item, s.allowOversell) });
      }
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          if (quantity < 1) {
            return { ...t, cart: t.cart.filter((l) => keyOf(l) !== key) };
          }
          return {
            ...t,
            cart: t.cart.map((l) => {
              if (keyOf(l) !== key) return l;
              // Con la sobreventa apagada se capea al stock disponible; con ella
              // encendida no hay tope y el cajero decide.
              const perItem = l.unitKind === "package" ? Math.max(l.item.units_per_package || 1, 1) : 1;
              const capped =
                oversold && !s.allowOversell && l.item.stock_level != null
                  ? Math.floor(l.item.stock_level / perItem)
                  : quantity;
              return { ...l, quantity: capped };
            }),
          };
        }),
      }));
    },

    removeFromCart: (key) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, cart: t.cart.filter((l) => keyOf(l) !== key) }
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
              const d = discounts.find((x) => x.key === keyOf(line));
              return d ? { ...line, discountAmount: d.discountAmount } : line;
            }),
          };
        }),
      })),

    setLineStaff: (key, staffId) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart.map((line) =>
              keyOf(line) === key ? { ...line, staffId: staffId ?? null } : line,
            ),
          };
        }),
      })),

    setPaymentMethod: (paymentMethod) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId ? { ...t, paymentMethod } : t,
        ),
      })),

    setTransferMethod: (transferMethod) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId ? { ...t, transferMethod } : t,
        ),
      })),

    setCardMethod: (cardMethod) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId ? { ...t, cardMethod } : t,
        ),
      })),

    clearCart: () =>
      set((s) => {
        const defaultMethod = get().defaultPaymentMethod;
        const defaultStaff = get().defaultStaffId;
        const defaultCustomer = get().defaultCustomerId;
        return {
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId
              ? { ...t, cart: [], customerId: defaultCustomer, staffId: defaultStaff, paymentMethod: defaultMethod, transferMethod: null, cardMethod: null }
              : t,
          ),
        };
      }),

    checkout: async () => {
      const state = get();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!activeTab || activeTab.cart.length === 0) return false;

      const { cart, customerId, staffId, paymentMethod, transferMethod, cardMethod } = activeTab;

      set({ submitting: true, error: null });
      try {
        const totalDiscount = cart.reduce((acc, l) => acc + (l.discountAmount || 0), 0);
        await posService.createSale({
          customerId,
          staffId,
          paymentMethod,
          transferMethod,
          cardMethod,
          discount: totalDiscount,
          includeTax: state.includeTax,
          items: cart.map((l) => {
            const base = l.item.kind === "service"
              ? { service_id: l.item.id }
              : { product_id: l.item.id };
            return {
              ...base,
              quantity: l.quantity,
              staff_id: l.staffId ?? null,
              kind: l.unitKind ?? "unit",
            };
          }),
        });

        // Refresca el catálogo para reflejar el stock ya descontado por la RPC.
        const catalog = await posService.fetchCatalog();

        set((s) => {
          const defaultMethod = get().defaultPaymentMethod;
          const defaultStaff = get().defaultStaffId;
          const defaultCustomer = get().defaultCustomerId;
          return {
            submitting: false,
            catalog,
            tabs: s.tabs.map((t) =>
              t.id === s.activeTabId
                ? { ...t, cart: [], customerId: defaultCustomer, staffId: defaultStaff, paymentMethod: defaultMethod, transferMethod: null, cardMethod: null }
                : t,
            ),
          };
        });

        return true;
      } catch (e) {
        set({ error: toMessage(e), submitting: false });
        return false;
      }
    },

    clearStockAlert: () => set({ stockAlert: null }),
  };
});
