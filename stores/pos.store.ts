import { create } from "zustand";
import { toMessage, isNetworkError, isBusinessRejection } from "@/lib/errors";
import * as posService from "@/services/pos.service";
import * as settingsService from "@/services/settings.service";
import * as deliveryService from "@/services/delivery.service";
import * as offlineQueue from "@/services/offline-queue.service";
import * as offersService from "@/services/offers.service";
import * as salesService from "@/services/sales.service";
import type { SaleListItem, SaleDetail, SaleReceiptExtras } from "@/services/sales.service";
import { loyaltyDiscountsToRestore, loyaltyLineDiscounts, loyaltyRedemptionMatches, pointsDiscountAmount } from "@/services/loyalty.service";
import type { AppliedLoyaltyPoints } from "@/services/loyalty.service";
import type { ProductOffer } from "@/services/offers.service";
import { useShiftsStore } from "@/stores/shifts.store";
import { lineKey, cartLineKey as keyOf } from "@/services/pos.service";
import { checkoutDiscounts, nextManualDiscount, tenderedForSale, type DiscountSource } from "@/lib/sale-discounts";
import { heldTabsKey, restoreHeldTabs, snapshotHeldTabs, type HeldTabsSnapshot } from "@/lib/pos-held-tabs";
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
type CheckoutOutcome = "sold" | "queued" | "failed";

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
  /**
   * Líneas donde el cajero apretó "Quitar" sobre una oferta automática, PARA
   * ESTA VENTA (T5). Sin esto, el siguiente cambio de carrito —sumar otra
   * unidad, tocar otro ítem— volvería a aplicarla, porque nada más distingue
   * "nunca calificó" de "calificó y se sacó a propósito". Se limpia sola
   * cuando la línea desaparece del carrito (`removeFromCart`) o cuando el
   * carrito se vacía: en la venta siguiente la oferta vuelve a ofrecerse.
   */
  removedOfferKeys: string[];
  loyaltyApplied: AppliedLoyaltyPoints | null;
}

interface PosState {
  /** Id de la última venta registrada en el servidor. null si se encoló offline. */
  lastSaleId: string | null;
  /**
   * Número consecutivo de `lastSaleId`, para el comprobante. Llega DESPUÉS del
   * cobro (se lee sin bloquear el `sold`); null mientras tanto.
   */
  lastSaleNumber: number | null;
  /**
   * Algo que falló DESPUÉS de que la venta quedó registrada (domicilio,
   * refresco del catálogo). La venta no se toca: es un aviso para el cajero.
   */
  postSaleWarning: string | null;
  clearPostSaleWarning: () => void;
  /**
   * Último "Vaciar venta", para poder deshacerlo (C5). Se guarda la pestaña
   * entera —cliente, pagos, domicilio, puntos— y no solo el carrito.
   */
  lastClearedTab: { tabId: string; snapshot: SaleTab } | null;
  /** true = se restauró; false = ya no se puede (la pestaña tiene ítems nuevos o se cerró). */
  undoClearCart: () => boolean;

  /** Las últimas ventas del negocio, para el panel "Últimas ventas" del POS. */
  recentSales: SaleListItem[];
  recentSalesLoading: boolean;
  fetchRecentSales: () => Promise<void>;
  /** Todo lo que hace falta para reimprimir el comprobante de una venta guardada. */
  fetchSaleReceipt: (saleId: string) => Promise<{ sale: SaleDetail; extras: SaleReceiptExtras }>;
  /** Contexto de autoridad congelado al inicializar este POS. */
  executionContext: WorkspaceExecutionContext | null;
  // Datos del catálogo (vienen de services)
  catalog: CatalogItem[];
  customers: CustomerOption[];
  staff: StaffOption[];
  /**
   * Ofertas de producto activas (T2-T4). Se traen para todo negocio, igual
   * que la config de promociones de salón: sin filas no hay nada que aplicar,
   * así que es gratis para el resto de los rubros.
   */
  offers: ProductOffer[];
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
  /**
   * Relee tasa de IVA, desglose y sobreventa de `settings`. `init()` las lee
   * una sola vez; si el dueño las cambia desde otro equipo, el POS abierto
   * mostraría un total distinto al que cobra `create_sale`. Lo llama la página
   * al volver el foco, y `checkout()` antes de cobrar. Sin red no cambia nada.
   */
  refreshPosConfig: () => Promise<void>;
  defaultPaymentMethod: PaymentMethod;
  setDefaultPaymentMethod: (method: PaymentMethod) => void;
  defaultStaffId: string | null;
  setDefaultStaffId: (id: string | null) => void;
  defaultCustomerId: string | null;
  setDefaultCustomerId: (id: string | null) => void;

  init: () => Promise<void>;
  syncShiftStaff: () => void;

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
  /**
   * `source` dice de qué canal viene el descuento, para separar lo MANUAL
   * (lo que a un trabajador le pide `pos_discount` en `create_sale`):
   * "manual" = DiscountModal, "auto" = premio de cortes (reemplaza),
   * "layer" (default) = puntos, que se suman/restauran sobre lo que había.
   */
  setLineDiscounts: (discounts: { key: string; discountAmount: number }[], source?: DiscountSource) => void;
  applyLoyaltyPoints: (points: number, pointsValue: number) => boolean;
  removeLoyaltyPoints: () => void;
  /**
   * Recalcula las ofertas automáticas de la pestaña activa contra
   * `state.offers`. Se llama SIEMPRE desde acciones del store que ya mutaron
   * el carrito (nunca desde un efecto de React) — es la forma de tener
   * "aplica solo, en cada cambio" sin el riesgo de `react-hooks/set-state-in-effect`.
   */
  recomputeOffers: () => void;
  /** El cajero saca una oferta aplicada para ESTA venta (T5). */
  removeOffer: (key: string) => void;
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
  /**
   * `amountTendered`: el efectivo que entregó el cliente (lo anota el modal
   * de cobro). Se guarda con la venta para reimprimir recibido y cambio; solo
   * cuenta en efectivo sin pago dividido (ver `tenderedForSale`).
   */
  /**
   * `rewardApplied`: la pantalla aplicó el premio de cortes en este carrito.
   * Ese canje vive en la página (no en la pestaña), así que se avisa acá para
   * no encolar la venta: encolada, `redeem_promo` nunca corre y el cliente se
   * queda con el premio. Mismo trato que los puntos (`loyaltyApplied`).
   */
  checkout: (options?: { amountTendered?: number | null; rewardApplied?: boolean }) => Promise<CheckoutOutcome>;

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
    removedOfferKeys: [],
    loyaltyApplied: null,
  };
};

const tabDefaults = (get: () => PosState) => ({
  paymentMethod: get().defaultPaymentMethod,
  staffId: get().defaultStaffId,
  customerId: get().defaultCustomerId,
});

/**
 * La pestaña lista para la próxima venta: mismo id y nombre, todo lo demás a
 * los valores por defecto del POS. Una sola versión para "Vaciar venta" y para
 * los dos finales de un cobro (vendida y encolada) — antes eran tres copias.
 */
export function resetTabForNextSale(
  tab: SaleTab,
  defaults: { paymentMethod: PaymentMethod; staffId: string | null; customerId: string | null },
): SaleTab {
  return {
    ...tab,
    cart: [],
    customerId: defaults.customerId,
    staffId: defaults.staffId,
    paymentMethod: defaults.paymentMethod,
    transferMethod: null,
    cardMethod: null,
    splits: [],
    isDelivery: false,
    deliveryData: { personId: null, address: "", fee: 0, notes: "" },
    checkoutId: null,
    removedOfferKeys: [],
    loyaltyApplied: null,
  };
}

/**
 * Deshace un "Vaciar venta". Solo si la pestaña sigue existiendo y sigue vacía:
 * si el cajero ya empezó otra venta ahí, pisarla con la anterior le borraría lo
 * nuevo sin avisar. Devuelve null cuando no corresponde restaurar.
 */
export function restoreClearedTab(
  tabs: SaleTab[],
  cleared: { tabId: string; snapshot: SaleTab } | null,
): SaleTab[] | null {
  if (!cleared) return null;
  const current = tabs.find((t) => t.id === cleared.tabId);
  if (!current || current.cart.length > 0) return null;
  return tabs.map((t) =>
    t.id === cleared.tabId ? { ...cleared.snapshot, id: t.id, name: t.name } : t,
  );
}

/**
 * Lo que se hace DESPUÉS de que `create_sale` respondió OK (C14).
 *
 * Nada de esto puede convertir la venta en fallida ni encolarla: la venta YA
 * existe en el servidor. Si algo falla, se devuelve el aviso y la venta queda
 * como está. Las dependencias se inyectan para poder probarlo sin red
 * (`tests/pos-post-sale.test.ts`).
 */
export async function runPostSaleFollowUps(deps: {
  saleId: string;
  delivery: { personId: string; address: string; fee: number; notes?: string } | null;
  createDelivery: (input: {
    sale_id: string;
    delivery_person_id: string;
    address: string;
    fee: number;
    notes?: string;
  }) => Promise<unknown>;
  fetchCatalog: () => Promise<CatalogItem[]>;
  fetchSaleNumber: (saleId: string) => Promise<number>;
}): Promise<{ warnings: string[]; catalog: CatalogItem[] | null; saleNumber: number | null }> {
  const deliveryJob: Promise<string | null> = deps.delivery
    ? deps
        .createDelivery({
          sale_id: deps.saleId,
          delivery_person_id: deps.delivery.personId,
          address: deps.delivery.address,
          fee: deps.delivery.fee,
          notes: deps.delivery.notes || undefined,
        })
        .then(() => null)
        .catch(
          (e: unknown) =>
            `La venta quedó registrada, pero no se pudo crear el domicilio: ${toMessage(e)}. Cárgalo a mano desde Domicilios.`,
        )
    : Promise.resolve(null);

  const catalogJob: Promise<CatalogItem[] | null> = deps.fetchCatalog().catch(() => null);
  // Sin número el comprobante sale igual, solo sin el consecutivo.
  const numberJob: Promise<number | null> = deps.fetchSaleNumber(deps.saleId).catch(() => null);

  const [deliveryWarning, catalog, saleNumber] = await Promise.all([deliveryJob, catalogJob, numberJob]);

  const warnings: string[] = [];
  if (deliveryWarning) warnings.push(deliveryWarning);
  if (!catalog) {
    warnings.push(
      "La venta quedó registrada, pero no se pudo actualizar el stock en pantalla. Recarga el POS si ves cantidades raras.",
    );
  }
  return { warnings, catalog, saleNumber };
}

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
    offers: [],
    taxRate: 0.19,
    loading: false,
    error: null,

    tabs: [createDefaultTab(0)], // temporal hasta que se monte el store y sobrescriba si aplica
    activeTabId: "", // se inicializará luego o en la primera tab
    submitting: false,
    stockAlert: null,
    lastSaleId: null,
    lastSaleNumber: null,
    postSaleWarning: null,
    clearPostSaleWarning: () => set({ postSaleWarning: null }),
    lastClearedTab: null,
    undoClearCart: () => {
      const restored = restoreClearedTab(get().tabs, get().lastClearedTab);
      if (!restored) {
        set({ lastClearedTab: null });
        return false;
      }
      set({ tabs: restored, lastClearedTab: null });
      return true;
    },
    recentSales: [],
    recentSalesLoading: false,
    fetchRecentSales: async () => {
      set({ recentSalesLoading: true });
      try {
        // Sin rango y con página de 5: el panel no necesita más.
        const page = await salesService.fetchSales({ from: null, to: null }, 0, 5);
        set({ recentSales: page.items, recentSalesLoading: false });
      } catch (e) {
        console.error(e);
        set({ recentSalesLoading: false });
      }
    },
    fetchSaleReceipt: (saleId) => salesService.fetchSaleForReceipt(saleId),
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
    refreshPosConfig: async () => {
      try {
        const { taxRate, includeTax, allowOversell } = await posService.fetchPosConfig();
        const s = get();
        if (s.taxRate !== taxRate || s.includeTax !== includeTax || s.allowOversell !== allowOversell) {
          set({ taxRate, includeTax, allowOversell });
        }
      } catch {
        // Sin red se sigue con lo último leído: la venta se encola igual.
      }
    },
    defaultPaymentMethod: "efectivo",
    setDefaultPaymentMethod: (method) => set({ defaultPaymentMethod: method }),
    defaultStaffId: null,
    setDefaultStaffId: (id) => set({ defaultStaffId: id }),
    defaultCustomerId: null,
    setDefaultCustomerId: (id) => set({ defaultCustomerId: id }),

    init: async () => {
      set({ loading: true, error: null });
      try {
        const [catalog, customers, staff, config, executionContext, offers] = await Promise.all([
          posService.fetchCatalog(),
          posService.fetchCustomers(),
          posService.fetchStaff(),
          posService.fetchPosConfig(),
          getWorkspaceExecutionContext(),
          // Sin filas para este negocio (todo lo que no sea tienda) esto
          // vuelve `[]` y no cambia nada; que falle no puede tumbar el POS
          // entero por una función que la mayoría de los rubros ni usa.
          offersService.fetchActiveOffers().catch(() => []),
        ]);
        // Desglose de IVA y sobreventa son política del negocio y viven en
        // `settings`. El toggle del POS escribe `include_tax` (ver
        // `setIncludeTax`); `allowOversell` solo se configura en Ajustes.
        const { taxRate, includeTax, allowOversell } = config;
        const state = get();
        const heldKey = heldTabsKey(executionContext);
        if (state.activeTabId === "") {
          // Primera carga de la página: vuelven las ventas en espera que
          // quedaron guardadas en este equipo (C16), reconciliadas contra el
          // catálogo de hoy. Si no hay nada (o falla la lectura), una pestaña
          // nueva como siempre.
          const snapshot = await posService
            .loadHeldTabs<HeldTabsSnapshot<SaleTab>>(heldKey)
            .catch(() => null);
          const restored = restoreHeldTabs(snapshot, {
            catalog,
            customerIds: new Set(customers.map((c) => c.id)),
            staffIds: new Set(staff.map((m) => m.id)),
            now: new Date(),
          });
          if (restored) {
            set({ catalog, customers, staff, offers, taxRate, includeTax, allowOversell, executionContext, loading: false, tabs: restored.tabs, activeTabId: restored.activeTabId });
          } else {
            const firstTab = createDefaultTab(0, get);
            set({ catalog, customers, staff, offers, taxRate, includeTax, allowOversell, executionContext, loading: false, tabs: [firstTab], activeTabId: firstTab.id });
          }
        } else {
          set({ catalog, customers, staff, offers, taxRate, includeTax, allowOversell, executionContext, loading: false });
        }
        // Desde acá cada cambio de pestañas se guarda bajo ESTA clave. Antes
        // de restaurar no se guarda nada: la pestaña vacía por defecto pisaría
        // la foto que todavía no se leyó.
        heldTabsActiveKey = heldKey;
        await useShiftsStore.getState().fetchCurrentShift();
        get().syncShiftStaff();
        get().recomputeOffers();
      } catch (e) {
        set({ error: toMessage(e), loading: false });
      }
    },

    // También corre al abrir/cerrar turno con el POS ya montado.
    syncShiftStaff: () => {
      const state = get();
      const shift = useShiftsStore.getState().currentShift;
      const context = state.executionContext;
      const responsible = shift && context &&
        shift.workspace_id === context.workspaceId &&
        shift.membership_id === context.membershipId &&
        state.staff.some((person) => person.id === context.staffId)
        ? context.staffId ?? null
        : null;
      if (state.defaultStaffId === responsible) return;
      set({
        defaultStaffId: responsible,
        tabs: state.tabs.map((tab) => tab.staffId === null ? {
          ...tab,
          staffId: responsible,
          cart: tab.cart.map((line) => ({ ...line, staffId: line.staffId ?? responsible })),
        } : tab),
      });
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
      get().recomputeOffers();
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
      get().recomputeOffers();
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
      get().recomputeOffers();
    },

    decrement: (key) => {
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
      }));
      get().recomputeOffers();
    },

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
      get().recomputeOffers();
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
      get().recomputeOffers();
    },

    // Se limpia también de `removedOfferKeys`: si la línea vuelve a
    // agregarse más tarde, es una línea nueva y merece que se le vuelva a
    // ofrecer la oferta, no que cargue con un "quitado" de la vez anterior.
    removeFromCart: (key) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === s.activeTabId
            ? {
                ...t,
                cart: t.cart.filter((l) => keyOf(l) !== key),
                removedOfferKeys: t.removedOfferKeys.filter((k) => k !== key),
              }
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

    /**
     * Descuento MANUAL sobre una línea (DiscountModal, o el premio de cortes
     * en salón). Limpia `offerId`/`offerName` si la línea traía una oferta
     * automática puesta: son dos canales del mismo campo y no se pisan al
     * revés — un descuento a mano siempre gana, nunca se suma a una oferta
     * (ver `offerDiscountsFor`).
     */
    setLineDiscounts: (discounts, source = "layer") => {
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            cart: t.cart.map((line) => {
              const d = discounts.find((x) => x.key === keyOf(line));
              return d
                ? {
                    ...line,
                    discountAmount: d.discountAmount,
                    manualDiscount: nextManualDiscount(line.manualDiscount, d.discountAmount, source),
                    offerId: undefined,
                    offerName: undefined,
                  }
                : line;
            }),
          };
        }),
      }));
      get().recomputeOffers();
    },

    applyLoyaltyPoints: (points, pointsValue) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab?.customerId || tab.loyaltyApplied || !Number.isInteger(points) || points <= 0) return false;
      const discounts = loyaltyLineDiscounts(tab.cart, pointsValue, points);
      const amount = pointsDiscountAmount(points, pointsValue);
      const previous = discounts.map(({ key }) => ({
        key,
        discountAmount: tab.cart.find((line) => keyOf(line) === key)?.discountAmount ?? 0,
      }));
      if (!discounts.length || Math.round(discounts.reduce((sum, d) => sum + d.discountAmount - (previous.find((p) => p.key === d.key)?.discountAmount ?? 0), 0) * 100) !== Math.round(amount * 100)) return false;
      get().setLineDiscounts(discounts);
      const current = get().tabs.find((t) => t.id === tab.id);
      if (!current) return false;
      const applied = discounts.map(({ key }) => {
        const line = current.cart.find((candidate) => keyOf(candidate) === key)!;
        return { key, quantity: line.quantity, unitPrice: posService.linePrice(line), discountAmount: line.discountAmount ?? 0 };
      });
      set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id
        ? { ...t, loyaltyApplied: { points, amount, customerId: tab.customerId!, previous, applied } }
        : t) }));
      return true;
    },

    removeLoyaltyPoints: () => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab?.loyaltyApplied) return;
      get().setLineDiscounts(loyaltyDiscountsToRestore(tab.cart, tab.loyaltyApplied));
      set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id ? { ...t, loyaltyApplied: null } : t) }));
    },

    // Recalcula TODAS las pestañas y no solo la activa: `addToTab` agrega a
    // una pestaña puntual (no necesariamente la activa), y una venta en
    // segundo plano tiene el mismo derecho a sus ofertas que la que se está
    // mirando. El costo es despreciable — son carritos de POS, no miles de
    // filas.
    recomputeOffers: () =>
      set((s) => ({
        tabs: s.tabs.map((t) => ({
          ...t,
          cart: offersService.applyOfferDiscounts(
            t.cart,
            s.offers,
            t.removedOfferKeys,
            offersService.todayLocal(),
          ),
        })),
      })),

    removeOffer: (key) => {
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== s.activeTabId) return t;
          return {
            ...t,
            removedOfferKeys: t.removedOfferKeys.includes(key)
              ? t.removedOfferKeys
              : [...t.removedOfferKeys, key],
            cart: t.cart.map((line) =>
              keyOf(line) === key
                ? { ...line, discountAmount: 0, offerId: undefined, offerName: undefined }
                : line,
            ),
          };
        }),
      }));
    },

    // Un precio abierto cambia lo que vale la línea, así que una oferta por
    // monto/porcentaje sobre ese mismo ítem tiene que recalcularse.
    setLinePrice: (key, price) => {
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
      }));
      get().recomputeOffers();
    },

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
        const current = s.tabs.find((t) => t.id === s.activeTabId);
        if (!current) return {};
        return {
          // La foto ANTES de vaciar: es lo que restaura "Deshacer".
          lastClearedTab: current.cart.length > 0 ? { tabId: current.id, snapshot: current } : s.lastClearedTab,
          tabs: s.tabs.map((t) => (t.id === current.id ? resetTabForNextSale(t, tabDefaults(get)) : t)),
        };
      }),

    checkout: async (options) => {
      const state = get();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!activeTab || activeTab.cart.length === 0) return "failed";
      if (activeTab.loyaltyApplied && !loyaltyRedemptionMatches(activeTab.cart, activeTab.customerId, activeTab.loyaltyApplied)) {
        set({ error: "El carrito o cliente cambió después de aplicar puntos. Quita los puntos y vuelve a aplicarlos antes de cobrar." });
        return "failed";
      }
      if (!state.executionContext) {
        set({
          error: "No hay un negocio activo. Vuelve a elegir el negocio antes de cobrar.",
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

      // IVA fresco antes de cobrar: si el dueño cambió la tasa o el desglose
      // desde otro equipo, el total en pantalla ya no es el que cobra
      // `create_sale`. Si con la config nueva el total cambia, se corta acá
      // para que el cajero lo vea (y rehaga un pago dividido) antes de cobrar.
      set({ submitting: true, error: null });
      {
        const before = get();
        const exempt = before.customers.find((c) => c.id === customerId)?.tax_exempt ?? false;
        const shownTotal = posService.computeTotals(cart, before.taxRate, exempt, before.includeTax).total;
        await get().refreshPosConfig();
        const after = get();
        const freshTotal = posService.computeTotals(cart, after.taxRate, exempt, after.includeTax).total;
        if (freshTotal !== shownTotal) {
          set({
            submitting: false,
            error: "La configuración de IVA del negocio cambió y el total de la venta se actualizó. Revísalo y vuelve a cobrar.",
          });
          return "failed";
        }
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
      //
      // El descuento sale desglosado: el total (como siempre), la parte
      // MANUAL —la única que a un trabajador le pide `pos_discount` en la
      // base— y el de cada línea, redondeado a centavos sin perder la suma.
      const discounts = checkoutDiscounts(cart, (l) => posService.linePrice(l) * l.quantity);
      const input: posService.CheckoutInput = {
        workspaceId: state.executionContext.workspaceId,
        membershipId: state.executionContext.membershipId,
        shiftId: useShiftsStore.getState().currentShift?.id ?? null,
        customerId,
        staffId,
        paymentMethod,
        transferMethod,
        cardMethod,
        discount: discounts.total,
        manualDiscount: discounts.manual,
        amountTendered: tenderedForSale(options?.amountTendered, paymentMethod, splits.length),
        items: cart.map((l, index) => {
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
            ...(discounts.lines ? { discount_amount: discounts.lines[index] } : {}),
          };
        }),
        splits: splits.length > 0 ? splits : undefined,
        clientSaleId,
      };

      let saleId: string;
      try {
        saleId = await posService.createSale(input);
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
          if (activeTab.loyaltyApplied) {
            set({ error: "No se pudo confirmar la venta en línea. No se encoló porque tenía puntos canjeados; comprueba la venta antes de reintentar.", submitting: false });
            return "failed";
          }
          if (options?.rewardApplied) {
            set({ error: "No se pudo confirmar la venta en línea. No se encoló porque tenía el premio de cortes aplicado; comprueba la venta antes de reintentar.", submitting: false });
            return "failed";
          }
          // El total tal cual se lo dijo al cliente, con la misma cuenta que
          // muestra el POS. Es contra este número que se cuadra la caja si la
          // venta después no entra.
          const cliente = state.customers.find((c) => c.id === customerId);
          const { taxRate, includeTax } = get();
          const { total } = posService.computeTotals(
            cart,
            taxRate,
            cliente?.tax_exempt ?? false,
            includeTax,
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
              return {
                submitting: false,
                error: null,
                pendingSales: s.pendingSales + 1,
                // Sin red no se puede releer el catálogo, así que el stock se
                // descuenta acá. Si no, durante la caída el cajero ve las
                // mismas unidades disponibles y vende cinco veces la última.
                catalog: applySoldUnits(s.catalog, cart),
                tabs: s.tabs.map((t) =>
                  t.id === activeTab.id ? resetTabForNextSale(t, tabDefaults(get)) : t,
                ),
              };
            });
            return "queued";
          }

          // No se pudo guardar en el dispositivo. Es el único caso peor que no
          // tener cola: decirle al cajero que la venta quedó cuando no quedó en
          // ningún lado. Se reporta como fallo y el carrito NO se limpia.
          set({
            error: "No hay conexión y tampoco pudimos guardar la venta en este dispositivo. No cierres el POS y vuelve a intentar.",
            submitting: false,
          });
          return "failed";
        }

        set({ error: message, submitting: false });
        return "failed";
      }

      // A partir de acá la venta EXISTE en el servidor (C14). Nada de lo que
      // sigue puede devolverla como fallida ni encolarla: antes, si el
      // domicilio o el refresco del catálogo fallaban, el catch la guardaba
      // como "cobrada sin conexión" o dejaba el carrito intacto para volver a
      // cobrar — y el cajero cobraba dos veces.
      //
      // Se limpia la pestaña que se COBRÓ (no la activa: el cajero pudo
      // cambiar de pestaña mientras esperaba la respuesta). El stock se
      // descuenta en memoria ya, y el refresco real corre después.
      set((s) => ({
        submitting: false,
        // Se guarda para que el canje del premio pueda atarse a ESTA venta: sin
        // el vínculo, anularla dejaría al cliente sin premio y sin progreso.
        lastSaleId: saleId,
        lastSaleNumber: null,
        catalog: applySoldUnits(s.catalog, cart),
        tabs: s.tabs.map((t) => (t.id === activeTab.id ? resetTabForNextSale(t, tabDefaults(get)) : t)),
      }));

      void runPostSaleFollowUps({
        saleId,
        delivery:
          isDelivery && deliveryData.personId
            ? {
                personId: deliveryData.personId,
                address: deliveryData.address,
                fee: deliveryData.fee,
                notes: deliveryData.notes || undefined,
              }
            : null,
        createDelivery: deliveryService.createDelivery,
        fetchCatalog: posService.fetchCatalog,
        fetchSaleNumber: async (id) => (await salesService.fetchSaleReceiptExtras(id)).saleNumber,
      }).then(({ warnings, catalog, saleNumber }) => {
        set((s) => ({
          ...(catalog ? { catalog } : {}),
          // Solo si sigue siendo la última: una venta más nueva ya pisó el id.
          ...(s.lastSaleId === saleId ? { lastSaleNumber: saleNumber } : {}),
          ...(warnings.length > 0 ? { postSaleWarning: warnings.join("\n") } : {}),
        }));
      });

      return "sold";
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

/**
 * Ventas en espera persistidas (C16). Clave activa = usuario + negocio del
 * último `init`; null hasta que se restauró la foto (ver `init`).
 */
let heldTabsActiveKey: string | null = null;
let heldTabsTimer: ReturnType<typeof setTimeout> | null = null;
const HELD_TABS_SAVE_DELAY_MS = 400;

function flushHeldTabs() {
  if (heldTabsTimer) clearTimeout(heldTabsTimer);
  heldTabsTimer = null;
  const key = heldTabsActiveKey;
  if (!key) return;
  const { tabs, activeTabId } = usePosStore.getState();
  void posService.saveHeldTabs(key, snapshotHeldTabs(tabs, activeTabId, new Date()));
}

if (typeof window !== "undefined") {
  usePosStore.subscribe((state, previous) => {
    if (state.tabs === previous.tabs && state.activeTabId === previous.activeTabId) return;
    if (!heldTabsActiveKey) return;
    // Un carrito que se VACIÓ (venta cobrada, vaciada o pestaña cerrada) se
    // guarda al instante: si la página se recargara dentro del respiro, la
    // venta ya cobrada volvería a aparecer lista para cobrarse otra vez.
    const emptied = previous.tabs.some(
      (p) => p.cart.length > 0 && (state.tabs.find((t) => t.id === p.id)?.cart.length ?? 0) === 0,
    );
    if (emptied) {
      flushHeldTabs();
      return;
    }
    if (heldTabsTimer) clearTimeout(heldTabsTimer);
    // Con un respiro: tipear una cantidad no tiene que escribir en disco por
    // cada tecla. Se guarda lo ÚLTIMO, leído al momento de escribir.
    heldTabsTimer = setTimeout(flushHeldTabs, HELD_TABS_SAVE_DELAY_MS);
  });
  // Cerrar o recargar con un guardado pendiente: se escribe ya.
  window.addEventListener("pagehide", () => {
    if (heldTabsTimer) flushHeldTabs();
  });
}

// Store-to-store synchronization keeps async arrival order out of React effects.
useShiftsStore.subscribe((state, previous) => {
  if (state.currentShift?.id !== previous.currentShift?.id) {
    usePosStore.getState().syncShiftStaff();
  }
});
