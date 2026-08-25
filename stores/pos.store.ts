import { create } from "zustand";
import { toMessage, isNetworkError, isBusinessRejection } from "@/lib/errors";
import * as posService from "@/services/pos.service";
import * as settingsService from "@/services/settings.service";
import * as deliveryService from "@/services/delivery.service";
import * as offlineQueue from "@/services/offline-queue.service";
import { useShiftsStore } from "@/stores/shifts.store";
import { lineKey, cartLineKey as keyOf } from "@/services/pos.service";
import {
  getWorkspaceExecutionContext,
  type WorkspaceExecutionContext,
} from "@/services/workspace.service";
import type {
  CatalogItem,
  CustomerOption,
  StaffOption,
  CartLine,
  PaymentMethod,
  PaymentSplit,
  SaleUnitKind,
} from "@/services/pos.service";

/**
 * Cómo terminó un cobro.
 *
 * `queued` NO es un error: la venta está guardada en el dispositivo y se envía
 * sola cuando vuelva la red. Para el cajero es tan válida como `sold` —el
 * carrito se limpia igual— pero el mensaje tiene que ser distinto, porque el
 * comprobante todavía no tiene número de venta del servidor.
 */
export type CheckoutOutcome = "sold" | "queued" | "failed";

export interface DeliveryData {
  personId: string | null;
  address: string;
  fee: number;
  notes: string;
}

export interface SaleTab {
  id: string;
  name: string;
  cart: CartLine[];
  customerId: string | null;
  staffId: string | null;
  paymentMethod: PaymentMethod;
  transferMethod?: string | null;
  cardMethod?: string | null;
  splits: PaymentSplit[];
  isDelivery: boolean;
  deliveryData: DeliveryData;
  /**
   * Clave de idempotencia del cobro en curso. Se acuña en el primer intento y
   * sobrevive a los reintentos de ESTE carrito; se limpia cuando el carrito se
   * vacía, porque a partir de ahí lo que se cobra es otra venta.
   */
  checkoutId: string | null;
}

interface PosState {
  /** Id de la última venta registrada en el servidor. null si se encoló offline. */
  lastSaleId: string | null;
  /** Contexto de autoridad congelado al inicializar este POS. */
  executionContext: WorkspaceExecutionContext | null;
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
  /**
   * El servidor rechazó la venta por tope de ventas del plan (create_sale
   * levanta `LIMITE_VENTAS:`). No es un error más: la caja queda trabada hasta
   * que suban de plan, así que se muestra como modal y no como toast.
   */
  planLimitHit: boolean;
  clearPlanLimit: () => void;

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
  addCustomer: (params: {
    name: string;
    doc_type?: string;
    identification?: string;
    phone?: string;
    email?: string;
  }) => Promise<boolean>;

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
  /** Cambia una línea entre unidad y caja (la decisión vive en el carrito). */
  setLineKind: (key: string, unitKind: SaleUnitKind) => void;
  setCustomer: (customerId: string | null) => void;
  setStaff: (staffId: string | null) => void;
  setLineDiscounts: (discounts: { key: string; discountAmount: number }[]) => void;
  setLineStaff: (key: string, staffId: string | null) => void;
  /** Precio del mostrador para una línea de precio abierto. `null` lo borra. */
  setLinePrice: (key: string, price: number | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setTransferMethod: (method: string | null) => void;
  setCardMethod: (method: string | null) => void;
  addSplit: () => void;
  removeSplit: (index: number) => void;
  updateSplitAmount: (index: number, amount: number) => void;
  updateSplitMethod: (index: number, method: PaymentMethod, transferMethod?: string | null, cardMethod?: string | null) => void;
  setDelivery: (enabled: boolean) => void;
  setDeliveryData: (data: Partial<DeliveryData>) => void;
  clearCart: () => void;
  /** Ver `CheckoutOutcome`: `queued` también es un cobro bueno. */
  checkout: () => Promise<CheckoutOutcome>;

  /**
   * Ventas cobradas sin conexión que todavía no llegaron al servidor. Solo las
   * de ESTA sesión: las que dejó otra cuenta en el mismo dispositivo no se
   * pueden enviar desde acá (irían al turno equivocado).
   */
  pendingSales: number;
  /** Ventas que el servidor rechazó al reenviarlas: hay que resolverlas a mano. */
  rejectedSales: number;
  /** El detalle de esas rechazadas, para la bandeja. Se carga bajo demanda. */
  rejectedList: offlineQueue.PendingSale[];
  /** Relee los contadores desde IndexedDB. */
  refreshPendingSales: () => Promise<void>;
  /** Trae el detalle de las rechazadas de esta sesión. */
  loadRejectedSales: () => Promise<void>;
  /** Devuelve una rechazada a la cola (p. ej. después de reponer stock). */
  retryRejectedSale: (clientSaleId: string) => Promise<void>;
  /** La borra del dispositivo. Es definitivo: se pierde el registro. */
  discardRejectedSale: (clientSaleId: string) => Promise<void>;

  /** Un drenaje en curso. Evita que dos disparadores pisen el mismo envío. */
  syncing: boolean;
  /**
   * Reenvía las ventas encoladas de esta sesión, de la más vieja a la más
   * nueva. Es seguro llamarla de más: si ya hay una corrida en curso, sale.
   */
  syncPendingSales: () => Promise<void>;
}


const createDefaultTab = (index: number, get?: () => PosState): SaleTab => {
  const defaultMethod = get?.()?.defaultPaymentMethod ?? "efectivo";
  const defaultStaff = get?.()?.defaultStaffId ?? null;
  const defaultCustomer = get?.()?.defaultCustomerId ?? null;
  return {
    id: crypto.randomUUID(),
    name: `Venta ${index + 1}`,
    cart: [],
    customerId: defaultCustomer,
    staffId: defaultStaff,
    paymentMethod: defaultMethod,
    transferMethod: null,
    cardMethod: null,
    splits: [],
    isDelivery: false,
    deliveryData: { personId: null, address: "", fee: 0, notes: "" },
    checkoutId: null,
  };
};

/**
 * Guarda una venta en la cola del dispositivo.
 *
 * Devuelve false si no se pudo por lo que sea. Ese false importa: mientras la
 * venta no esté guardada en algún lado, el POS no tiene derecho a decirle al
 * cajero que quedó cobrada.
 */
async function queueSale(params: {
  clientSaleId: string;
  input: posService.CheckoutInput;
  delivery: offlineQueue.PendingDelivery | null;
  total: number;
  context: WorkspaceExecutionContext;
}): Promise<boolean> {
  if (!offlineQueue.isOfflineQueueSupported()) return false;
  if (
    params.input.workspaceId !== params.context.workspaceId ||
    params.input.membershipId !== params.context.membershipId
  ) {
    return false;
  }

  try {
    await offlineQueue.enqueueSale({
      clientSaleId: params.clientSaleId,
      input: params.input,
      authUserId: params.context.authUserId,
      workspaceId: params.context.workspaceId,
      membershipId: params.context.membershipId,
      shiftId: params.input.shiftId,
      delivery: params.delivery,
      total: params.total,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Descuenta del catálogo en memoria las unidades de un carrito ya cobrado.
 * Una caja descuenta sus N unidades sueltas, igual que hace `create_sale`.
 */
function applySoldUnits(catalog: CatalogItem[], cart: CartLine[]): CatalogItem[] {
  const sold = new Map<string, number>();
  for (const line of cart) {
    if (line.item.kind !== "product") continue;
    const units = line.quantity * posService.lineUnits(line);
    sold.set(line.item.id, (sold.get(line.item.id) ?? 0) + units);
  }
  if (sold.size === 0) return catalog;

  return catalog.map((item) => {
    const units = sold.get(item.id);
    if (!units || item.stock_level == null) return item;
    return { ...item, stock_level: item.stock_level - units };
  });
}

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
    executionContext: null,
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
  lastSaleId: null,
    planLimitHit: false,

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
        const [catalog, customers, staff, config, executionContext] = await Promise.all([
          posService.fetchCatalog(),
          posService.fetchCustomers(),
          posService.fetchStaff(),
          posService.fetchPosConfig(),
          getWorkspaceExecutionContext(),
        ]);
        // Desglose de IVA y sobreventa son política del negocio y viven en
        // `settings`. El toggle del POS escribe `include_tax` (ver
        // `setIncludeTax`); `allowOversell` solo se configura en Ajustes.
        const { taxRate, includeTax, allowOversell } = config;
        const state = get();
        if (state.activeTabId === "") {
          const firstTab = createDefaultTab(0, get);
          set({ catalog, customers, staff, taxRate, includeTax, allowOversell, executionContext, loading: false, tabs: [firstTab], activeTabId: firstTab.id });
        } else {
          set({ catalog, customers, staff, taxRate, includeTax, allowOversell, executionContext, loading: false });
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
                keyOf(l) === key ? { ...l, quantity: l.quantity + 1, staffId: l.staffId ?? t.staffId } : l,
              ),
            };
          }
          return { ...t, cart: [...t.cart, { item, unitKind, quantity: 1, staffId: t.staffId ?? null }] };
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
                keyOf(l) === key ? { ...l, quantity: l.quantity + 1, staffId: l.staffId ?? t.staffId } : l,
              ),
            };
          }
          return { ...t, cart: [...t.cart, { item, unitKind, quantity: 1, staffId: t.staffId ?? null }] };
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
          // `<= 0` y no `< 1`: media unidad es una cantidad válida para lo que
          // se vende por peso, y con el corte en 1 escribir "0,5" borraba la
          // línea del carrito.
          if (quantity <= 0) {
            return { ...t, cart: t.cart.filter((l) => keyOf(l) !== key) };
          }
          return {
            ...t,
            cart: t.cart.map((l) => {
              if (keyOf(l) !== key) return l;
              // Con la sobreventa apagada se capea al stock disponible; con ella
              // encendida no hay tope y el cajero decide.
              const perItem = l.unitKind === "package" ? Math.max(l.item.units_per_package || 1, 1) : 1;
              // El tope se reparte igual que la venta: en enteros para lo que
              // se cuenta, con decimales para lo que se pesa. Redondear 2,5 kg
              // hacia abajo a 2 dejaría medio kilo invendible en el estante.
              const available =
                l.item.stock_level != null ? l.item.stock_level / perItem : quantity;
              const capped =
                oversold && !s.allowOversell && l.item.stock_level != null
                  ? (l.item.allows_fractions ? Math.round(available * 1000) / 1000 : Math.floor(available))
                  : quantity;
              return { ...l, quantity: capped };
            }),
          };
        }),
      }));
    },

    /**
     * Pasar una línea de unidad a caja (o al revés).
     *
     * Si ya hay otra línea del MISMO producto en la presentación destino, las
     * dos se fusionan sumando cantidades: dejar dos renglones idénticos sería
     * un error de lectura para el cajero justo antes de cobrar.
     */
    setLineKind: (key, unitKind) => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const line = tab?.cart.find((l) => keyOf(l) === key);
      if (!line || (line.unitKind ?? "unit") === unitKind) return;

      const targetKey = lineKey(line.item.id, unitKind);
      // Si las dos líneas se van a fusionar, el stock se compara contra la
      // cantidad SUMADA: revisar solo la línea que se mueve dejaría pasar una
      // sobreventa que aparece recién al juntarlas.
      const twinQty = tab?.cart.find((l) => keyOf(l) === targetKey)?.quantity ?? 0;

      if (oversells(line.item, unitKind, line.quantity + twinQty)) {
        set({ stockAlert: oversellMessage(line.item, s.allowOversell) });
        if (!s.allowOversell) return;
      }

      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          const twin = t.cart.find((l) => keyOf(l) === targetKey);
          if (twin) {
            return {
              ...t,
              cart: t.cart
                .map((l) =>
                  keyOf(l) === targetKey ? { ...l, quantity: l.quantity + line.quantity } : l,
                )
                .filter((l) => keyOf(l) !== key),
            };
          }
          return {
            ...t,
            cart: t.cart.map((l) => (keyOf(l) === key ? { ...l, unitKind } : l)),
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
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            staffId,
            cart: t.cart.map((line) => ({ ...line, staffId: staffId ?? line.staffId })),
          };
        }),
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

    setLinePrice: (key, price) =>
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart.map((line) =>
              keyOf(line) === key
                // `undefined` y no `null`: es "sin asignar", que es lo que la
                // línea tiene que volver a ser si se borra el precio. Un 0 sí es
                // un precio, así que no puede confundirse con vacío.
                ? { ...line, customPrice: price ?? undefined }
                : line,
            ),
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

    addSplit: () =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, splits: [...t.splits, { payment_method: "efectivo", amount: 0 }] }
            : t,
        ),
      })),

    removeSplit: (index) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, splits: t.splits.filter((_, i) => i !== index) }
            : t,
        ),
      })),

    updateSplitAmount: (index, amount) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? {
                ...t,
                splits: t.splits.map((sp, i) =>
                  i === index ? { ...sp, amount } : sp,
                ),
              }
            : t,
        ),
      })),

    updateSplitMethod: (index, method, transferMethod, cardMethod) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? {
                ...t,
                splits: t.splits.map((sp, i) =>
                  i === index
                    ? { ...sp, payment_method: method, transfer_method: transferMethod ?? null, card_method: cardMethod ?? null }
                    : sp,
                ),
              }
            : t,
        ),
      })),

    setDelivery: (enabled) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, isDelivery: enabled }
            : t,
        ),
      })),

    setDeliveryData: (data) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? { ...t, deliveryData: { ...t.deliveryData, ...data } }
            : t,
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
              ? { ...t, cart: [], customerId: defaultCustomer, staffId: defaultStaff,                 paymentMethod: defaultMethod, transferMethod: null, cardMethod: null, splits: [], isDelivery: false, deliveryData: { personId: null, address: "", fee: 0, notes: "" }, checkoutId: null }
              : t,
          ),
        };
      }),

    checkout: async () => {
      const state = get();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!activeTab || activeTab.cart.length === 0) return "failed";
      if (!state.executionContext) {
        set({
          error: "No hay un negocio activo. Volvé a elegir el negocio antes de cobrar.",
        });
        return "failed";
      }

      const { cart, customerId, staffId, paymentMethod, transferMethod, cardMethod, splits, isDelivery, deliveryData } = activeTab;

      // Un ítem de precio abierto sin precio asignado no es una venta a medias:
      // es una venta que el servidor va a rechazar (PRECIO_REQUERIDO). Se corta
      // acá para no gastar el intento ni consumir la clave de idempotencia.
      const unpriced = cart.filter((l) => l.item.open_price && l.customPrice == null);
      if (unpriced.length > 0) {
        set({
          error: `Falta asignarle precio a ${unpriced.map((l) => l.item.name).join(", ")}.`,
        });
        return "failed";
      }

      // La clave se acuña UNA vez por carrito y se guarda en la pestaña antes
      // de salir a la red. Si este intento muere sin respuesta y el cajero
      // vuelve a tocar "Cobrar", viaja la misma clave y el servidor devuelve la
      // venta que ya registró. Acuñar una nueva por intento la duplicaría.
      const clientSaleId = activeTab.checkoutId ?? crypto.randomUUID();

      set((s) => ({
        submitting: true,
        error: null,
        tabs: s.tabs.map((t) => (t.id === activeTab.id ? { ...t, checkoutId: clientSaleId } : t)),
      }));
      // El payload se arma UNA vez: lo que sale a la red y lo que se guarda en
      // la cola tienen que ser byte por byte lo mismo. Recalcularlo al reenviar
      // abriría la puerta a que la venta encolada no sea la que se cobró.
      const input: posService.CheckoutInput = {
        workspaceId: state.executionContext.workspaceId,
        membershipId: state.executionContext.membershipId,
        shiftId: useShiftsStore.getState().currentShift?.id ?? null,
        customerId,
        staffId,
        paymentMethod,
        transferMethod,
        cardMethod,
        discount: cart.reduce((acc, l) => acc + (l.discountAmount || 0), 0),
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
            // Solo viaja si el ítem lo admite: el RPC rechaza un precio en
            // cualquier otro producto, y con razón.
            ...(l.item.open_price && l.customPrice != null
              ? { unit_price: l.customPrice }
              : {}),
          };
        }),
        splits: splits.length > 0 ? splits : undefined,
        clientSaleId,
      };

      try {
        const saleId = await posService.createSale(input);
        // Se guarda para que el canje del premio pueda atarse a ESTA venta: sin
        // el vínculo, anularla dejaría al cliente sin premio y sin progreso.
        set({ lastSaleId: saleId });

        if (isDelivery && deliveryData.personId) {
          await deliveryService.createDelivery({
            sale_id: saleId,
            delivery_person_id: deliveryData.personId,
            address: deliveryData.address,
            fee: deliveryData.fee,
            notes: deliveryData.notes || undefined,
          });
        }

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
                ? { ...t, cart: [], customerId: defaultCustomer, staffId: defaultStaff,                 paymentMethod: defaultMethod, transferMethod: null, cardMethod: null, splits: [], isDelivery: false, deliveryData: { personId: null, address: "", fee: 0, notes: "" }, checkoutId: null }
                : t,
            ),
          };
        });

        return "sold";
      } catch (e) {
        const message = toMessage(e);
        // El prefijo lo pone create_sale (misma convención que STOCK_INSUFICIENTE).
        if (message.includes("LIMITE_VENTAS")) {
          set({ planLimitHit: true, error: null, submitting: false });
          return "failed";
        }

        // Se encola SOLO si no llegamos al servidor. Un STOCK_INSUFICIENTE, un
        // cupo de crédito o un tope de plan son un "no" del servidor: guardarlos
        // le escondería al cajero que la venta no se hizo, y la mercadería ya
        // salió del mostrador. Ver `isNetworkError`.
        if (isNetworkError(e)) {
          // El total tal cual se lo dijo al cliente, con la misma cuenta que
          // muestra el POS. Es contra este número que se cuadra la caja si la
          // venta después no entra.
          const cliente = state.customers.find((c) => c.id === customerId);
          const { total } = posService.computeTotals(
            cart,
            state.taxRate,
            cliente?.tax_exempt ?? false,
            state.includeTax,
          );

          const queued = await queueSale({
            clientSaleId,
            input,
            total,
            context: state.executionContext,
            delivery:
              isDelivery && deliveryData.personId
                ? {
                    personId: deliveryData.personId,
                    address: deliveryData.address,
                    fee: deliveryData.fee,
                    notes: deliveryData.notes || undefined,
                  }
                : null,
          });

          if (queued) {
            set((s) => {
              const defaultMethod = get().defaultPaymentMethod;
              const defaultStaff = get().defaultStaffId;
              const defaultCustomer = get().defaultCustomerId;
              return {
                submitting: false,
                error: null,
                pendingSales: s.pendingSales + 1,
                // Sin red no se puede releer el catálogo, así que el stock se
                // descuenta acá. Si no, durante la caída el cajero ve las
                // mismas unidades disponibles y vende cinco veces la última.
                catalog: applySoldUnits(s.catalog, cart),
                tabs: s.tabs.map((t) =>
                  t.id === s.activeTabId
                    ? { ...t, cart: [], customerId: defaultCustomer, staffId: defaultStaff, paymentMethod: defaultMethod, transferMethod: null, cardMethod: null, splits: [], isDelivery: false, deliveryData: { personId: null, address: "", fee: 0, notes: "" }, checkoutId: null }
                    : t,
                ),
              };
            });
            return "queued";
          }

          // No se pudo guardar en el dispositivo. Es el único caso peor que no
          // tener cola: decirle al cajero que la venta quedó cuando no quedó en
          // ningún lado. Se reporta como fallo y el carrito NO se limpia.
          set({
            error: "No hay conexión y tampoco pudimos guardar la venta en este dispositivo. No cierres el POS y volvé a intentar.",
            submitting: false,
          });
          return "failed";
        }

        set({ error: message, submitting: false });
        return "failed";
      }
    },

    pendingSales: 0,
    rejectedSales: 0,
    rejectedList: [],
    syncing: false,

    loadRejectedSales: async () => {
      try {
        const context = get().executionContext;
        if (!context) return;
        const rejectedList = await offlineQueue.listRejectedSales(context);
        set({ rejectedList, rejectedSales: rejectedList.length });
      } catch {
        set({ rejectedList: [] });
      }
    },

    retryRejectedSale: async (clientSaleId) => {
      await offlineQueue.retryRejectedSale(clientSaleId);
      await get().refreshPendingSales();

      // Un drenaje en curso ya tomó su lista de pendientes ANTES de que esta
      // venta volviera a la cola, así que no la incluye — y `syncPendingSales`
      // se sale sola si ya hay uno corriendo. Sin esta espera, el cajero toca
      // "Intentar de nuevo", no pasa nada visible, y la venta se queda hasta el
      // próximo intervalo.
      for (let i = 0; i < 100 && get().syncing; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }

      // Se intenta ya: si el motivo del rechazo se resolvió, el cajero lo ve
      // en el momento en vez de esperar al próximo intervalo.
      await get().syncPendingSales();
      await get().loadRejectedSales();
    },

    discardRejectedSale: async (clientSaleId) => {
      await offlineQueue.removePendingSale(clientSaleId);
      await get().loadRejectedSales();
      await get().refreshPendingSales();
    },

    refreshPendingSales: async () => {
      try {
        const context = get().executionContext;
        if (!context) return;
        const [pendingSales, rejectedSales] = await Promise.all([
          offlineQueue.countPendingSales(context),
          offlineQueue.countRejectedSales(context),
        ]);
        set({ pendingSales, rejectedSales });
      } catch {
        // Sin cola disponible el POS sigue cobrando online; el contador es
        // informativo y no puede tumbar la pantalla.
      }
    },

    syncPendingSales: async () => {
      if (get().syncing) return;
      if (!offlineQueue.isOfflineQueueSupported()) return;

      let context: WorkspaceExecutionContext;
      try {
        context = await getWorkspaceExecutionContext();
      } catch {
        return;
      }
      // Sin sesión, drenar registraría las ventas bajo quien esté logueado
      // ahora. Se esperan: la cola no vence.
      let pendientes: offlineQueue.PendingSale[];
      try {
        pendientes = await offlineQueue.listPendingSales(context);
      } catch {
        return;
      }
      if (pendientes.length === 0) {
        await get().refreshPendingSales();
        return;
      }

      set({ syncing: true });
      let enviadaAlguna = false;

      try {
        // EN SERIE y de la más vieja a la más nueva: el stock se descuenta en
        // el orden en que se cobró. En paralelo, dos ventas del mismo producto
        // se pisarían y el sobregiro quedaría escondido.
        for (const venta of pendientes) {
          if (
            venta.workspaceId !== context.workspaceId ||
            venta.membershipId !== context.membershipId ||
            venta.authUserId !== context.authUserId
          ) {
            continue;
          }
          try {
            const saleId = await posService.createSale(venta.input);

            // El domicilio se crea acá porque recién ahora existe el sale_id.
            // Si falla, la VENTA ya entró: no se puede reintentar el conjunto
            // (el RPC devolvería la misma venta, pero se duplicaría el envío).
            if (venta.delivery) {
              try {
                await deliveryService.createDelivery({
                  sale_id: saleId,
                  delivery_person_id: venta.delivery.personId,
                  address: venta.delivery.address,
                  fee: venta.delivery.fee,
                  notes: venta.delivery.notes || undefined,
                });
              } catch {
                // Se pierde el domicilio, no la venta. Queda para cargarlo a
                // mano; sacar la venta de la cola es lo correcto igual.
              }
            }

            await offlineQueue.removePendingSale(venta.clientSaleId);
            enviadaAlguna = true;
          } catch (e) {
            // Volvió a cortarse: las que siguen van a fallar igual. Se corta
            // acá para no gastar intentos ni romper el orden.
            if (isNetworkError(e)) break;

            if (isBusinessRejection(e)) {
              await offlineQueue.markRejected(venta.clientSaleId, e);
              continue;
            }

            // Ni red ni rechazo claro (un 5xx, un JWT vencido que no refrescó).
            // Puede andar en el próximo intento, así que se reintenta — pero
            // con tope, para que una venta rota no deje el contador arriba
            // para siempre.
            await offlineQueue.recordFailedAttempt(venta.clientSaleId, e);
            if (venta.attempts + 1 >= offlineQueue.MAX_SYNC_ATTEMPTS) {
              await offlineQueue.markRejected(venta.clientSaleId, e);
            }
          }
        }
      } finally {
        set({ syncing: false });
        await get().refreshPendingSales();
      }

      // El catálogo en memoria arrastra los descuentos optimistas del modo sin
      // conexión. Ahora que hay red, la verdad la tiene el servidor.
      if (enviadaAlguna) {
        try {
          set({ catalog: await posService.fetchCatalog() });
        } catch {
          // Se volvió a caer justo acá: el catálogo se corrige en el próximo init.
        }
      }
    },

    clearStockAlert: () => set({ stockAlert: null }),
    clearPlanLimit: () => set({ planLimitHit: false }),
  };
});
