"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePosStore } from "@/stores/pos.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useShiftsStore } from "@/stores/shifts.store";
import { useProfile } from "@/components/ProfileProvider";
import { OpenShiftModal } from "@/components/shift/OpenShiftModal";
import { CloseShiftModal } from "@/components/shift/CloseShiftModal";
import { WithdrawalModal } from "@/components/shift/WithdrawalModal";
import {
  computeTotals,
  lineKey,
  linePrice,
  type PaymentMethod,
  type CartLine,
  type CatalogItem,
  type CustomerOption,
  type SaleTotals,
} from "@/services/pos.service";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { CustomerModal } from "@/components/CustomerModal";
import { PosReceipt } from "@/components/PosReceipt";
import { RecentSalesModal } from "@/components/RecentSalesModal";
import { DiscountModal } from "@/components/DiscountModal";
import { SaleConfigModal } from "@/components/SaleConfigModal";
import { notifySuccess, notifyWarning, notifyError } from "@/lib/notifications";
import { useOfflineSync } from "@/lib/useOfflineSync";
import { PosCatalog } from "./components/PosCatalog";
import { looksLikeScannerCode, resolveCatalogCode } from "./components/catalog-code";
import { PosTodayAppointments } from "./components/PosTodayAppointments";
import { useAppointmentsStore } from "@/stores/appointments.store";
import type { BillableAppointment } from "@/services/appointments.service";
import { toISODate } from "@/lib/date";
import { PosCartPanel } from "./components/PosCartPanel";
import { CheckoutModal } from "./components/CheckoutModal";
import { DeliveryModal } from "./components/DeliveryModal";
import { PosTabsBar } from "./components/PosTabsBar";
import { SuccessModal } from "./components/SuccessModal";
import { saleChangeSummary } from "./components/sale-change";
import { usePromosStore } from "@/stores/promos.store";
import { useLoyaltyStore } from "@/stores/loyalty.store";
import {
  maxRedeemablePoints,
  loyaltyRedemptionMatches,
} from "@/services/loyalty.service";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useCashDrawerStore } from "@/stores/cash-drawer.store";
import { canKickWith } from "@/lib/cash-drawer";
import {
  fetchCustomerPromoTarget,
  availableReward,
  renderPromoMessage,
  whatsappLink as buildWhatsappLink,
  businessDisplayName,
  promoDiscountFor,
  redeemPromo,
  renderRedeemMessage,
} from "@/services/promos.service";
import { TabRenameModal } from "./components/TabRenameModal";
import { AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PlanLimitModal } from "./components/PlanLimitModal";
import { OfflineQueueBadge } from "./components/OfflineQueueBadge";
import { RejectedSalesModal } from "./components/RejectedSalesModal";
import { formatMoney } from "@/lib/money";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Dat\u00f3fono" },
  { value: "transferencia", label: "Transferencia" },
  { value: "credito", label: "Cr\u00e9dito / Fiado" },
];

interface ReceiptData {
  items: { name: string; sku: string | null; quantity: number; price: number; total: number; packageLabel?: string | null }[];
  customer: CustomerOption | null;
  totals: SaleTotals;
  paymentMethod: PaymentMethod;
  date: Date;
  businessName?: string | null;
  logoUrl?: string | null;
  municipality?: string | null;
  phone?: string | null;
  taxResponsibility?: string | null;
  includeTax: boolean;
}

export default function POSPage() {
  const catalog = usePosStore((s) => s.catalog);
  const customers = usePosStore((s) => s.customers);
  const staff = usePosStore((s) => s.staff);
  const taxRate = usePosStore((s) => s.taxRate);
  const loading = usePosStore((s) => s.loading);
  const error = usePosStore((s) => s.error);
  const tabs = usePosStore((s) => s.tabs);
  const activeTabId = usePosStore((s) => s.activeTabId);
  const submitting = usePosStore((s) => s.submitting);
  const includeTax = usePosStore((s) => s.includeTax);
  const allowOversell = usePosStore((s) => s.allowOversell);
  const stockAlert = usePosStore((s) => s.stockAlert);
  const clearStockAlert = usePosStore((s) => s.clearStockAlert);
  const planLimitHit = usePosStore((s) => s.planLimitHit);
  const clearPlanLimit = usePosStore((s) => s.clearPlanLimit);

  const businessProfile = useSettingsStore((s) => s.settings?.business_profile);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const transferMethodsEnabled = useSettingsStore((s) => s.settings?.transfer_methods_enabled);
  const cardMethodsEnabled = useSettingsStore((s) => s.settings?.card_methods_enabled);
  const acceptsCard = useSettingsStore((s) => s.settings?.accepts_card) ?? true;
  const acceptsTransfer = useSettingsStore((s) => s.settings?.accepts_transfer) ?? true;

  useEffect(() => {
    void fetchSettings();
    const refresh = () => { if (document.visibilityState === "visible") void fetchSettings(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchSettings]);

  const profile = useProfile();
  const isWorker = profile?.isWorker ?? false;
  const requireActiveShift = useSettingsStore((s) => s.loading || (s.settings?.require_active_shift ?? true));
  const currentShift = useShiftsStore((s) => s.currentShift);
  const salesBlocked = isWorker && requireActiveShift && !currentShift;
  const fetchCurrentShift = useShiftsStore((s) => s.fetchCurrentShift);
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);
  const [isOpenShiftOpen, setIsOpenShiftOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isWorker) fetchCurrentShift();
  }, [isWorker, fetchCurrentShift]);

  const openCloseShift = () => {
    fetchCurrentShift();
    setIsCloseShiftOpen(true);
  };

  // ---- Citas de hoy por cobrar ----
  // Solo para rubros con agenda: una tienda no tiene citas y la consulta
  // sobraría en cada apertura del POS.
  const hasAppointments = Boolean(profile?.modules?.appointments);
  const billable = useAppointmentsStore((s) => s.billable);
  const fetchBillable = useAppointmentsStore((s) => s.fetchBillable);
  const linkAppointmentSale = useAppointmentsStore((s) => s.linkSale);
  /**
   * Cita cargada desde la franja, y en QUÉ pestaña. Al cobrar esa pestaña se ata
   * la venta a la cita: el trigger de la base ya lo hace cuando la cita tiene
   * cliente, pero una cita sin cliente solo la conoce esta pantalla.
   */
  const [citaEnCobro, setCitaEnCobro] = useState<{ id: string; forTab: string } | null>(null);

  useEffect(() => {
    if (hasAppointments) fetchBillable(toISODate());
  }, [hasAppointments, fetchBillable]);

  const requireShift = (action: () => void): void => {
    if (isWorker && requireActiveShift && !currentShift) {
      pendingActionRef.current = action;
      setIsOpenShiftOpen(true);
      return;
    }
    action();
  };

  useEffect(() => {
    if (stockAlert) {
      if (allowOversell) {
        notifyWarning("Vendiendo sin stock", stockAlert);
      } else {
        notifyError("Sin stock", stockAlert);
      }
      clearStockAlert();
    }
  }, [stockAlert, clearStockAlert, allowOversell]);

  const init = usePosStore((s) => s.init);
  const addTab = usePosStore((s) => s.addTab);
  const setActiveTab = usePosStore((s) => s.setActiveTab);
  const removeTab = usePosStore((s) => s.removeTab);
  const renameTab = usePosStore((s) => s.renameTab);
  const addToCart = usePosStore((s) => s.addToCart);
  const increment = usePosStore((s) => s.increment);
  const decrement = usePosStore((s) => s.decrement);
  const setQuantity = usePosStore((s) => s.setQuantity);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const removeOffer = usePosStore((s) => s.removeOffer);
  const setLineKind = usePosStore((s) => s.setLineKind);
  const setLineDiscounts = usePosStore((s) => s.setLineDiscounts);
  const applyLoyaltyPoints = usePosStore((s) => s.applyLoyaltyPoints);
  const removeLoyaltyPoints = usePosStore((s) => s.removeLoyaltyPoints);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const setStaff = usePosStore((s) => s.setStaff);
  const setPaymentMethod = usePosStore((s) => s.setPaymentMethod);
  const setTransferMethod = usePosStore((s) => s.setTransferMethod);
  const setCardMethod = usePosStore((s) => s.setCardMethod);
  const setLineStaff = usePosStore((s) => s.setLineStaff);
  const setLinePrice = usePosStore((s) => s.setLinePrice);
  const clearCart = usePosStore((s) => s.clearCart);
  const checkout = usePosStore((s) => s.checkout);
  const addSplit = usePosStore((s) => s.addSplit);
  const removeSplit = usePosStore((s) => s.removeSplit);
  const updateSplitAmount = usePosStore((s) => s.updateSplitAmount);
  const updateSplitMethod = usePosStore((s) => s.updateSplitMethod);
  const setDelivery = usePosStore((s) => s.setDelivery);
  const setDeliveryData = usePosStore((s) => s.setDeliveryData);

  const paymentOptions = useMemo(
    () =>
      PAYMENT_METHODS.filter(
        (m) =>
          (m.value !== "tarjeta" || acceptsCard) &&
          (m.value !== "transferencia" || acceptsTransfer),
      ),
    [acceptsCard, acceptsTransfer],
  );

  const asksCardMethod = (cardMethodsEnabled?.length ?? 0) > 1;
  const asksTransferMethod = (transferMethodsEnabled?.length ?? 0) > 1;

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  /** Mensaje listo para mandarle al cliente que se acaba de cortar. */
  const [promoSend, setPromoSend] = useState<{ link: string; name: string } | null>(null);
  /** Premio ganado por el cliente elegido, ya resuelto contra su progreso. */
  const [promoGanadoRaw, setPromoGanado] = useState<
    { progress: number; milestoneId: string; forCustomer: string } | null
  >(null);
  /** Descuento del premio ya aplicado a una línea de ESTE carrito. */
  const [promoAplicadoRaw, setPromoAplicado] = useState<
    { key: string; amount: number; forCustomer: string; forTab: string } | null
  >(null);
  const promoConfig = usePromosStore((s) => s.config);
  const promoMilestones = usePromosStore((s) => s.milestones);
  const fetchPromos = usePromosStore((s) => s.fetchAll);

  const isTienda = profile?.businessType === "tienda";
  const loyaltyConfig = useLoyaltyStore((s) => s.config);
  const fetchLoyaltyConfig = useLoyaltyStore((s) => s.fetchConfig);
  const fetchLoyaltyBalance = useLoyaltyStore((s) => s.fetchBalance);
  const redeemLoyaltyPoints = useLoyaltyStore((s) => s.redeemPoints);
  const isOnline = useOnlineStatus();
  /** Saldo de puntos del cliente elegido, recién leído de la base. */
  const [loyaltyBalanceRaw, setLoyaltyBalance] = useState<
    { balance: number; forCustomer: string } | null
  >(null);
  const [redeemPointsInput, setRedeemPointsInput] = useState("");
  /** La última venta quedó en la cola del dispositivo, no en el servidor. */
  const [lastSaleQueued, setLastSaleQueued] = useState(false);
  const [isRejectedModalOpen, setIsRejectedModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isRecentSalesModalOpen, setIsRecentSalesModalOpen] = useState(false);
  const [isSaleConfigModalOpen, setIsSaleConfigModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [tabMenuId, setTabMenuId] = useState<string | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [amountTendered, setAmountTendered] = useState("");
  /**
   * Por qué falló el último intento de cobro, mostrado DENTRO del modal de
   * cobro. La caja de error del catálogo queda tapada por el carrito en el
   * celular, y el cajero confirmaba sin enterarse de que no se cobró.
   */
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  /**
   * Lo que el cajero necesita ver DESPUÉS de cobrar: total, recibido y cambio.
   * Se fija antes de que el store limpie el carrito, porque ahí el total ya
   * vale cero.
   */
  const [lastSaleSummary, setLastSaleSummary] = useState<
    { total: number; tendered: number | null; change: number } | null
  >(null);
  /** El buscador del catálogo: a donde vuelve el foco para el próximo escaneo. */
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Devuelve el foco al buscador para que la próxima lectura del escáner caiga
   * ahí y no en una tarjeta (donde el Enter final del lector la agregaría dos
   * veces).
   *
   * No roba el foco si el cajero está escribiendo en otro campo (cliente,
   * cantidad, puntos…), y solo actúa con puntero fino: en el celular enfocar el
   * buscador abre el teclado en pantalla y tapa medio catálogo.
   */
  const focusSearch = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    requestAnimationFrame(() => {
      const input = searchRef.current;
      if (!input) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active !== input &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
      ) {
        return;
      }
      input.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => { init(); }, [init]);
  // Reenvía solo las ventas que quedaron cobradas sin conexión.
  useOfflineSync();
  useEffect(() => {
    // Con un mensaje para mandar, el modal NO se cierra solo: cinco segundos no
    // alcanzan para leer, decidir y tocar el botón, y que se evapore en la mano
    // es peor que no ofrecerlo.
    // Tampoco con cambio por entregar: el número tiene que seguir en pantalla
    // hasta que el cajero lo cuente y cierre él.
    if (isSuccessModalOpen && !promoSend && !(lastSaleSummary && lastSaleSummary.change > 0)) {
      const timer = setTimeout(() => setIsSuccessModalOpen(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isSuccessModalOpen, promoSend, lastSaleSummary]);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);
  useEffect(() => { fetchLoyaltyConfig(); }, [fetchLoyaltyConfig]);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);
  const { cart, customerId, staffId, paymentMethod, transferMethod, cardMethod, splits, isDelivery, deliveryData } = activeTab;

  useEffect(() => {
    if (!acceptsCard && paymentMethod === "tarjeta") {
      setPaymentMethod("efectivo");
      setCardMethod(null);
    }
    if (!acceptsTransfer && paymentMethod === "transferencia") {
      setPaymentMethod("efectivo");
      setTransferMethod(null);
    }
  }, [acceptsCard, acceptsTransfer, paymentMethod, setPaymentMethod, setCardMethod, setTransferMethod]);

  interface KeyboardSnapshot {
    cart: CartLine[];
    submitting: boolean;
    paymentMethod: PaymentMethod;
    isDelivery: boolean;
    anyModalOpen: boolean;
    requireShift: (action: () => void) => void;
    checkout: () => void;
    /**
     * Enter sin campo enfocado, o Enter con el buscador vacío.
     * true = se abrió el cobro (o el turno que lo precede).
     */
    openCheckoutFromKeyboard: () => boolean;
  }

  const latest = useRef<KeyboardSnapshot>(null!);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atajos globales solo cuando el cajero NO está escribiendo en un campo:
      // un Enter en la búsqueda global (o en cualquier input) busca, no vende.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        setCheckoutError(null);
        setIsCustomerModalOpen(false);
        setIsDiscountModalOpen(false);
        setIsRecentSalesModalOpen(false);
        setIsSaleConfigModalOpen(false);
        setIsSuccessModalOpen(false);
        setIsCheckoutModalOpen(false);
        setIsDeliveryModalOpen(false);
        setIsOpenShiftOpen(false);
        setIsScannerOpen(false);
        setIsCartOpen(false);
        setTabMenuId(null);
        setRenamingTabId(null);
        setClosingTabId(null);
      }
      // Con foco en un botón (una tarjeta del catálogo, por ejemplo) el Enter
      // es de ESE botón: el navegador ya lo "clickea". Abrir además el cobro
      // hacía que el Enter final del lector agregara el producto y saltara a
      // cobrar en el mismo golpe.
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && target?.tagName !== "BUTTON") {
        latest.current?.openCheckoutFromKeyboard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const p of catalog) if (p.category_name) names.add(p.category_name);
    return ["Todos", ...Array.from(names).sort()];
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((p) => {
        const matchesCategory = activeCategory === "Todos" || p.category_name === activeCategory;
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (a.kind === "service" && b.kind !== "service") return -1;
        if (a.kind !== "service" && b.kind === "service") return 1;
        return 0;
      });
  }, [catalog, search, activeCategory]);

  const cartQty = useMemo(() => {
    const byId = new Map<string, number>();
    for (const line of cart) {
      byId.set(line.item.id, (byId.get(line.item.id) ?? 0) + line.quantity);
    }
    return byId;
  }, [cart]);

  const handleScannedCode = useCallback(
    (code: string, source: "camera" | "input" = "camera") => {
      if (salesBlocked) return true;
      const match = resolveCatalogCode(catalog, code);
      if (!match) {
        const query = code.trim().toLowerCase();
        const scannerCode = looksLikeScannerCode(code) &&
          !catalog.some((item) => item.name.toLowerCase().includes(query));
        if (source === "camera" || scannerCode) {
          notifyError("C\u00f3digo no encontrado", `Ning\u00fan \u00edtem tiene el c\u00f3digo ${code}.`);
        }
        return source === "input" && scannerCode;
      }
      // `stock_level` en null = el ítem no lleva inventario (servicio): no hay
      // unidades que puedan faltar. Ver `CatalogItem`.
      const unitQty = cart.find((line) => line.item.id === match.id && (line.unitKind ?? "unit") === "unit")?.quantity ?? 0;
      if (!allowOversell && match.stock_level != null && unitQty + 1 > match.stock_level) {
        notifyError("Sin stock", `${match.name} no tiene unidades disponibles.`);
        return source === "input";
      }
      addToCart(match);
      notifySuccess("Agregado a la venta", match.name);
      return true;
    },
    [catalog, addToCart, allowOversell, cart, salesBlocked],
  );

  const cartUnits = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const isTaxExempt = selectedCustomer?.tax_exempt ?? false;

  /**
   * El premio del cliente elegido. Se relee de la base y no del listado del POS:
   * `CustomerOption` no trae el progreso, y ese número cambia con cada venta.
   */
  useEffect(() => {
    // Sin cliente o con el contador apagado no hay nada que leer. No se limpia
    // el estado acá —eso sería un setState en el cuerpo del efecto—: el premio
    // se DERIVA abajo contra el cliente actual, así que uno viejo no aplica.
    if (!promoConfig.enabled || !customerId) return;
    let cancel = false;
    fetchCustomerPromoTarget(customerId)
      .then(({ progress }) => {
        if (cancel) return;
        const hito = availableReward(progress, promoMilestones);
        setPromoGanado(hito ? { progress, milestoneId: hito.id, forCustomer: customerId } : null);
      })
      .catch(() => { if (!cancel) setPromoGanado(null); });
    return () => { cancel = true; };
  }, [customerId, promoConfig.enabled, promoMilestones]);

  /**
   * Saldo de puntos del cliente elegido. Se relee de la base por el mismo
   * motivo que el premio de cortes: `CustomerOption` no trae el saldo, y ese
   * número cambia con cada venta.
   */
  useEffect(() => {
    if (!isTienda || !loyaltyConfig.enabled || !customerId) return;
    let cancel = false;
    fetchLoyaltyBalance(customerId)
      .then((balance) => { if (!cancel) setLoyaltyBalance({ balance, forCustomer: customerId }); })
      .catch(() => { if (!cancel) setLoyaltyBalance(null); });
    return () => { cancel = true; };
  }, [customerId, isTienda, loyaltyConfig.enabled, fetchLoyaltyBalance]);

  /**
   * Lo aplicado vale solo para el cliente y el carrito en los que se aplicó.
   *
   * Se DERIVA en vez de limpiarse desde un efecto: un `setState` en el cuerpo
   * de un efecto dispara renders en cascada, y acá además llegaría tarde — por
   * un instante el banner mostraría el descuento de otro cliente.
   */
  const promoAplicado =
    promoAplicadoRaw &&
    promoAplicadoRaw.forCustomer === customerId &&
    promoAplicadoRaw.forTab === activeTabId
      ? promoAplicadoRaw
      : null;

  /** Vale solo para el cliente que está elegido ahora. */
  const promoGanado =
    promoConfig.enabled && promoGanadoRaw && promoGanadoRaw.forCustomer === customerId
      ? promoGanadoRaw
      : null;

  const hitoGanado = promoGanado
    ? promoMilestones.find((m) => m.id === promoGanado.milestoneId) ?? null
    : null;

  /** Qué descontaría el premio sobre el carrito de ahora. null = nada aplicable. */
  const promoSugerido = useMemo(() => {
    if (!hitoGanado || promoAplicado) return null;
    return promoDiscountFor(
      hitoGanado,
      cart.map((l) => ({
        key: lineKey(l.item.id),
        itemId: l.item.id,
        isService: l.item.kind === "service",
        unitPrice: linePrice(l),
        quantity: l.quantity,
      })),
      promoConfig.serviceIds,
    );
  }, [hitoGanado, promoAplicado, cart, promoConfig.serviceIds]);

  const totals = useMemo(
    () => computeTotals(cart, taxRate, isTaxExempt, includeTax),
    [cart, taxRate, includeTax, isTaxExempt],
  );

  const loyaltyApplied = activeTab.loyaltyApplied;
  const loyaltyValid = !loyaltyApplied ||
    loyaltyRedemptionMatches(cart, customerId, loyaltyApplied);

  /** Vale solo para el cliente que está elegido ahora. */
  const loyaltyBalance =
    loyaltyBalanceRaw && loyaltyBalanceRaw.forCustomer === customerId
      ? loyaltyBalanceRaw.balance
      : null;

  /**
   * Tope de puntos canjeables en ESTA venta. Ya en cero si hay un canje
   * aplicado: cambiar de cantidad exige quitar el anterior primero, para no
   * tener que reconciliar dos reparto simultáneos sobre las mismas líneas.
   */
  const maxLoyaltyPoints = loyaltyApplied
    ? 0
    : maxRedeemablePoints(loyaltyBalance ?? 0, totals.total, loyaltyConfig.pointsValue);

  const handleApplyLoyaltyPoints = () => {
    if (!customerId) return;
    const points = parseInt(redeemPointsInput, 10);
    if (!Number.isFinite(points) || points <= 0) {
      notifyError("Cantidad inválida", "Ingresá cuántos puntos querés canjear.");
      return;
    }
    if (loyaltyConfig.minRedeem > 0 && points < loyaltyConfig.minRedeem) {
      notifyError(
        "Por debajo del mínimo",
        `Este negocio canjea desde ${loyaltyConfig.minRedeem} puntos.`,
      );
      return;
    }
    if (points > maxLoyaltyPoints) {
      notifyError(
        "Supera lo disponible",
        `Como máximo se pueden canjear ${maxLoyaltyPoints} puntos en esta venta.`,
      );
      return;
    }

    if (!applyLoyaltyPoints(points, loyaltyConfig.pointsValue ?? 0)) {
      notifyError("No se aplicaron los puntos", "Revisá el carrito y volvé a intentarlo.");
      return;
    }
    setRedeemPointsInput("");
  };

  const handleRemoveLoyaltyPoints = () => {
    removeLoyaltyPoints();
  };

  /** Cita de la franja que está cargada en ESTA pestaña. */
  const citaActiva = citaEnCobro && citaEnCobro.forTab === activeTabId ? citaEnCobro.id : null;

  const handlePickCita = (cita: BillableAppointment) => {
    if (salesBlocked) { setIsOpenShiftOpen(true); return; }
    const item = catalog.find((c) => c.kind === "service" && c.id === cita.service_id);
    if (!item) {
      notifyError(
        "No se puede cobrar desde acá",
        `El servicio de esta cita ya no está activo. Cóbralo eligiendo otro servicio del catálogo.`,
      );
      return;
    }
    // Volver a tocar la cita que ya está cargada solo abre el carrito.
    if (citaActiva === cita.id) {
      setIsCartOpen(true);
      return;
    }
    // Una pestaña, una cita: cargar otra con el carrito ocupado la mezclaría con
    // lo que el cajero ya venía armando. Se abre en una pestaña nueva.
    if (cart.length > 0) addTab();
    setCustomer(cita.customer_id);
    setStaff(cita.staff_id);
    addToCart(item);
    setCitaEnCobro({ id: cita.id, forTab: usePosStore.getState().activeTabId });
    setIsCartOpen(true);
  };

  /** true = la venta quedó (cobrada o encolada); false = NO se cobró. */
  const handleCheckout = async (): Promise<boolean> => {
    // Se fija ANTES de cobrar: al terminar, el carrito se limpia y la pestaña
    // activa puede cambiar.
    const citaCobrada = citaActiva;
    if (!loyaltyValid || (loyaltyApplied && !isOnline)) {
      const msg = "Quitá los puntos y volvé a aplicarlos antes de cobrar en línea.";
      setCheckoutError(msg);
      notifyError("Revisá el canje", msg);
      return false;
    }
    setCheckoutError(null);
    // Mismo criterio que el modal de cobro: solo hay vuelto en efectivo sin
    // pago dividido. Se calcula acá porque después del cobro el total es cero.
    const summary = saleChangeSummary(totals.total, paymentMethod, splits.length, amountTendered);
    const data: ReceiptData = {
      items: cart.map((l) => ({
        name: l.item.name,
        sku: l.item.sku,
        quantity: l.quantity,
        packageLabel:
          l.unitKind === "package" ? `Caja x${l.item.units_per_package} u.` : null,
        price: linePrice(l),
        total: linePrice(l) * l.quantity,
      })),
      customer: selectedCustomer,
      totals,
      paymentMethod,
      date: new Date(),
      businessName: businessProfile?.businessName ?? null,
      logoUrl: businessProfile?.logoUrl ?? null,
      municipality: businessProfile?.municipality ?? null,
      phone: businessProfile?.phone ?? null,
      taxResponsibility: businessProfile?.taxResponsibility ?? null,
      includeTax,
    };
    setReceiptData(data);
    const outcome = await checkout();
    if (outcome === "failed") {
      // El store deja el motivo en `error` (stock insuficiente, cupo de
      // crédito, precio faltante…). Un tope de plan NO deja error: lo muestra
      // su propio modal, y un toast encima sería ruido.
      const { error: reason, planLimitHit: limit } = usePosStore.getState();
      if (limit) {
        setIsCheckoutModalOpen(false);
      } else {
        const msg = reason ?? "La venta no se registró. Revisa el carrito y vuelve a intentarlo.";
        setCheckoutError(msg);
        notifyError("No se pudo cobrar", msg);
      }
      return false;
    }
    // "queued" es un cobro bueno: la venta est\u00e1 guardada en el dispositivo y se
    // env\u00eda sola cuando vuelva la red. Se limpia la pantalla igual que en una
    // venta normal, pero el aviso no puede prometer que ya qued\u00f3 registrada.
    if (outcome === "sold" || outcome === "queued") {
      setLastSaleQueued(outcome === "queued");
      setLastSaleSummary(summary);
      setIsCheckoutModalOpen(false);

      // El cajón, PRIMERO y sin await.
      //
      // Antes se abría de rebote: el driver metía el pulso al arrancar el
      // trabajo de impresión, así que el cajón no respondía a que se cobrara
      // sino a que alguien apretara "Imprimir". Cobrar sin imprimir dejaba la
      // plata afuera. Acá el disparo cuelga del cobro, que es lo que de verdad
      // significa "abrí el cajón".
      //
      // Va antes de las idas a la base por promociones: el cliente está con el
      // billete en la mano y esperar una consulta de red para abrir el cajón se
      // siente roto. Y va sin `await` para que un puerto lento no frene la
      // pantalla — `kick()` no lanza nunca.
      //
      // `ready` es la condición que evita el ruido: una terminal sin cajón
      // configurado no tiene por qué comerse un cartel de error en cada venta.
      openCashDrawerOnSale();

      // La cita queda COMPLETADA. Si tenía cliente ya lo hizo el trigger de la
      // base; esto cubre la que no lo tenía. En "queued" no hay venta todavía:
      // al enviarse, el trigger se encarga de las que tienen cliente.
      if (hasAppointments) {
        const saleId = usePosStore.getState().lastSaleId;
        if (outcome === "sold" && citaCobrada && saleId) {
          void linkAppointmentSale(citaCobrada, saleId).then(() => fetchBillable(toISODate()));
        } else {
          void fetchBillable(toISODate());
        }
        if (citaCobrada) setCitaEnCobro(null);
      }

      if (outcome === "sold") {
        notifySuccess(
          "\u00a1Venta realizada con \u00e9xito! \ud83c\udf89",
          "El comprobante de la transacci\u00f3n est\u00e1 listo."
        );
      } else {
        notifyWarning(
          "Venta cobrada sin conexi\u00f3n",
          "Qued\u00f3 guardada en este dispositivo y se enviar\u00e1 sola cuando vuelva internet. No cierres sesi\u00f3n."
        );
      }
      setSearch("");
      setActiveCategory("Todos");
      setAmountTendered("");
      setIsCartOpen(false);

      // El mensaje del contador. Se arma DESPUÉS de cobrar y leyendo la base,
      // porque el trigger ya sumó allá y la copia en memoria quedó vieja.
      //
      // `!queued` es la condición que más importa: una venta cobrada sin
      // conexión todavía no llegó al servidor, así que el contador no subió y
      // el mensaje diría un número que no corresponde.
      // El canje va DESPUÉS de que la venta quedó registrada, nunca antes: si
      // fallara el cobro, un canje adelantado le habría quemado el premio al
      // cliente por una venta que no existió. Al revés el peor caso es que
      // conserve el premio, y el cajero se entera.

      // Qué premio se entregó en ESTA venta, si se entregó alguno. Solo el POS
      // lo sabe con nombre y apellido, y por eso su mensaje puede nombrarlo:
      // desde Clientes o Promociones el contador en cero dice que hubo un canje
      // pero no cuál.
      let premioEntregado: string | null = null;

      if (outcome === "sold" && promoAplicado && selectedCustomer) {
        try {
          // El id de la venta ata el canje a ella: sin eso, anularla dejaría al
          // cliente sin premio y sin progreso por una venta que no existió.
          const r = await redeemPromo(
            selectedCustomer.id,
            promoAplicado.amount,
            usePosStore.getState().lastSaleId,
          );
          premioEntregado = r.reward;
          // El número lo dice la base, no una promesa fija: "vuelve a cero" era
          // mentira cuando el cliente había pagado un corte de más antes de
          // canjear, y el cajero se enteraba recién en la ficha del cliente.
          notifySuccess(
            "Premio canjeado",
            r.progress_after === 0
              ? `${r.reward}. El contador arranca de cero.`
              : `${r.reward}. El contador arranca en ${r.progress_after}.`,
          );
        } catch (e) {
          notifyError(
            "La venta quedó, pero el premio NO se canjeó",
            e instanceof Error ? e.message : "Canjealo a mano desde Promociones.",
          );
        }
      }
      setPromoAplicado(null);

      // Mismo orden que el premio de cortes: el canje corre DESPUÉS de que la
      // venta quedó registrada, atado a su `sale_id`. Si la venta se encoló
      // sin conexión (`outcome === "queued"`) todavía no hay un `sale_id` del
      // servidor con qué canjear — el control ya viene deshabilitado offline
      // (`isOnline`), así que en la práctica no debería llegar acá con
      // `loyaltyApplied` puesto, pero por las dudas no se intenta.
      if (outcome === "sold" && loyaltyApplied && selectedCustomer) {
        const saleId = usePosStore.getState().lastSaleId;
        try {
          if (!saleId) throw new Error("No se encontró el id de la venta.");
          const newBalance = await redeemLoyaltyPoints(saleId, loyaltyApplied.points);
          notifySuccess(
            "Puntos canjeados",
            `Se descontaron ${loyaltyApplied.points} puntos. Saldo: ${newBalance}.`,
          );
        } catch (e) {
          // La venta ya está cobrada y el descuento ya se aplicó al cliente;
          // lo único que puede fallar es la resta del saldo. Se avisa en vez
          // de reintentar solo, mismo trato que el premio de cortes.
          notifyError(
            "La venta quedó, pero los puntos NO se descontaron del saldo",
            e instanceof Error ? e.message : "Reportalo si vuelve a pasar.",
          );
        }
      }
      // Fuerza a releer el saldo la próxima vez que se elija este cliente: la
      // copia en memoria quedó vieja apenas se ganaron o canjearon puntos.
      setLoyaltyBalance(null);

      setPromoSend(null);
      const cobroCortes =
        outcome === "sold" &&
        promoConfig.enabled &&
        promoConfig.serviceIds.length > 0 &&
        Boolean(selectedCustomer) &&
        cart.some((l) => l.item.kind === "service" && promoConfig.serviceIds.includes(l.item.id));

      // El canje también manda mensaje aunque el premio no haya sido un corte:
      // lo que se le cuenta al cliente es que lo canjeó, no qué se descontó.
      if ((cobroCortes || premioEntregado) && selectedCustomer) {
        try {
          const { count, progress, phone } = await fetchCustomerPromoTarget(selectedCustomer.id);
          const nombre = selectedCustomer.full_name.split(" ")[0];
          const negocio = businessDisplayName(businessProfile?.businessName, profile?.businessName);
          // Dos mensajes distintos para dos momentos distintos. En la visita del
          // canje el contador quedó en 0 y contarlo sería mandarle "Ya llevás 0
          // cortes" a quien se acaba de llevar el premio; el contador vuelve a
          // ser noticia en la visita siguiente.
          const texto = premioEntregado
            ? renderRedeemMessage(null, {
                cliente: nombre,
                negocio,
                premio: premioEntregado,
                total: count,
              })
            : renderPromoMessage(promoConfig.message, {
                cliente: nombre,
                // El premio sale del PROGRESO; el histórico va como `{total}`.
                cortes: progress,
                total: count,
                negocio,
                premio: availableReward(progress, promoMilestones)?.reward ?? null,
              });
          const link = buildWhatsappLink(phone, texto);
          if (link) setPromoSend({ link, name: selectedCustomer.full_name.split(" ")[0] });
        } catch {
          // Que falle leer el contador no puede ensuciar una venta que ya se
          // cobró: se pierde el botón, no la venta.
        }
      }

      setIsSuccessModalOpen(true);
    }
    return true;
  };

  // Se lee una vez al montar: la config del cajón vive en localStorage (es de
  // este dispositivo) y el permiso del puerto lo recuerda el navegador.
  const initCashDrawer = useCashDrawerStore((s) => s.init);
  useEffect(() => {
    initCashDrawer();
  }, [initCashDrawer]);

  // Decide si el botón manual existe: en una terminal sin cajón sería un botón
  // que no puede funcionar nunca. Se recalcula con lo que cambia la respuesta:
  // la config elegida y los dispositivos autorizados.
  const drawerConfig = useCashDrawerStore((s) => s.config);
  const drawerAuthorized = useCashDrawerStore((s) => s.authorized);
  const drawerHydrated = useCashDrawerStore((s) => s.hydrated);
  const drawerCaps = useCashDrawerStore((s) => s.caps);
  const drawerReady =
    drawerHydrated && drawerCaps !== null && canKickWith(drawerConfig, drawerCaps, drawerAuthorized);

  const handleOpenDrawerManually = useCallback(() => {
    void useCashDrawerStore
      .getState()
      .kick()
      .then((ok) => {
        if (!ok) {
          notifyError(
            "El cajón no se abrió",
            useCashDrawerStore.getState().error ?? "Revisá la conexión de la impresora.",
          );
        }
      });
  }, []);

  const openCashDrawerOnSale = useCallback(() => {
    const state = useCashDrawerStore.getState();
    if (!state.config.autoOpenOnSale || !state.canKick()) return;
    void state.kick().then((worked) => {
      if (worked) return;
      // La venta ya se cobró: esto es un aviso, no una falla del cobro. El
      // cajero necesita saber que tiene que abrirlo con la llave.
      notifyWarning(
        "El cajón no se abrió",
        useCashDrawerStore.getState().error ?? "Revisá la conexión de la impresora.",
      );
    });
  }, []);

  const handleCheckoutClick = (): boolean => {
    if (!loyaltyValid || (loyaltyApplied && !isOnline)) {
      notifyError("Revisá el canje", "Quitá los puntos y volvé a aplicarlos antes de cobrar en línea.");
      return false;
    }
    requireShift(() => {
      setAmountTendered("");
      setCheckoutError(null);
      if (isDelivery) {
        setIsDeliveryModalOpen(true);
      } else {
        setIsCheckoutModalOpen(true);
      }
    });
    return true;
  };

  const anyModalOpen =
    isCustomerModalOpen ||
    isDiscountModalOpen ||
    isRecentSalesModalOpen ||
    isSaleConfigModalOpen ||
    isSuccessModalOpen ||
    isCheckoutModalOpen ||
    isDeliveryModalOpen ||
    isOpenShiftOpen ||
    isCloseShiftOpen ||
    isWithdrawalOpen ||
    isRejectedModalOpen ||
    isScannerOpen ||
    planLimitHit ||
    renamingTabId !== null ||
    closingTabId !== null;

  useEffect(() => {
    latest.current = {
      cart,
      submitting,
      paymentMethod,
      isDelivery,
      anyModalOpen,
      requireShift,
      checkout: handleCheckoutClick,
      openCheckoutFromKeyboard: () => {
        if (anyModalOpen || cart.length === 0 || submitting) return false;
        return handleCheckoutClick();
      },
    };
  });

  // Al cerrarse el último modal (cobro, éxito, cliente, descuento…) el foco
  // vuelve al buscador: el siguiente cliente suele empezar con el escáner.
  const wasModalOpen = useRef(false);
  useEffect(() => {
    if (wasModalOpen.current && !anyModalOpen) focusSearch();
    wasModalOpen.current = anyModalOpen;
  }, [anyModalOpen, focusSearch]);

  /** Agregar con clic deja el foco en la tarjeta; se devuelve al buscador. */
  const addToCartFromClick = useCallback(
    (item: CatalogItem) => {
      addToCart(item);
      focusSearch();
    },
    [addToCart, focusSearch],
  );

  const closingTab = closingTabId ? tabs.find((t) => t.id === closingTabId) : null;

  return (
    <>
      <div className="-m-6 lg:-m-10 bg-background print:hidden flex flex-col lg:h-[calc(100vh-5rem)]">
        <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0">

          <PosCatalog
            search={search}
            setSearch={setSearch}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            categories={categories}
            filtered={filtered}
            catalog={catalog}
            viewMode={viewMode}
            setViewMode={setViewMode}
            loading={loading}
            error={error}
            cartQty={cartQty}
            allowOversell={allowOversell}
            isWorker={isWorker}
            currentShift={currentShift}
            requireActiveShift={requireActiveShift}
            addToCart={addToCartFromClick}
            increment={increment}
            decrement={decrement}
            lineKey={lineKey}
            onOpenScanner={() => setIsScannerOpen(true)}
            onSubmitCode={(code) => handleScannedCode(code, "input")}
            onSubmitEmpty={() => latest.current?.openCheckoutFromKeyboard() ?? false}
            searchRef={searchRef}
            onOpenShift={() => setIsOpenShiftOpen(true)}
            onOpenWithdrawal={() => setIsWithdrawalOpen(true)}
            openCloseShift={openCloseShift}
            topSlot={
              hasAppointments ? (
                <PosTodayAppointments
                  items={billable}
                  selectedId={citaActiva}
                  onPick={handlePickCita}
                />
              ) : null
            }
          />

          <div className={`lg:hidden fixed bottom-[calc(2.75rem+env(safe-area-inset-bottom))] inset-x-0 z-40 px-3 pt-3 pb-2 bg-gradient-to-t from-background via-background to-transparent transition-opacity duration-200 ${
            isCartOpen ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              disabled={cart.length === 0}
              aria-label={cart.length === 0 ? "Agregá ítems para cobrar" : `Ver venta actual: ${cart.length} ítems, total ${formatMoney(totals.total)}`}
              className="w-full min-h-12 flex items-center justify-between gap-3 rounded-xl bg-primary text-on-primary px-3.5 shadow-lg shadow-primary/25 active:bg-primary-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors disabled:opacity-40"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="relative shrink-0">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  {cartUnits > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-surface-container-lowest text-primary text-xs font-bold flex items-center justify-center">
                      {cartUnits}
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-semibold truncate">
                  {cart.length === 0
                    ? "Agreg\u00e1 \u00edtems para cobrar"
                    : `${cart.length} \u00edtem${cart.length !== 1 ? "s" : ""} \u00b7 cobrar`}
                </span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm font-bold tabular-nums">{formatMoney(totals.total)}</span>
                <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          </div>

          <PosCartPanel
            promoSlot={
              isTienda ? (
                (loyaltyConfig.enabled && customerId) || loyaltyApplied ? (
                  <div className="mx-4 mt-3 rounded-xl border border-[#6063ee]/30 bg-[#6063ee]/10 px-4 py-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {customerId && <p className="text-sm font-bold text-on-surface">
                          {loyaltyBalance ?? "—"} punto{loyaltyBalance === 1 ? "" : "s"} disponible
                          {loyaltyBalance === 1 ? "" : "s"}
                        </p>}
                        {loyaltyApplied && (
                          <p className="text-xs text-on-surface-variant">
                            Canjeados: {loyaltyApplied.points} (−{formatMoney(loyaltyApplied.amount)}). Se descuentan del saldo al cobrar.
                          </p>
                        )}
                      </div>
                      {loyaltyApplied && (
                        <button
                          type="button"
                          onClick={handleRemoveLoyaltyPoints}
                          className="shrink-0 text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    {loyaltyApplied && !loyaltyValid && (
                      <p role="alert" className="text-xs font-semibold text-error">
                        El cliente o carrito cambió. Quitá los puntos y volvé a aplicarlos antes de cobrar.
                      </p>
                    )}
                    {loyaltyApplied && !isOnline && loyaltyValid && (
                      <p role="alert" className="text-xs font-semibold text-error">
                        Sin conexión no se pueden canjear puntos. Quitalos antes de cobrar.
                      </p>
                    )}

                    {!loyaltyApplied && (
                      !isOnline ? (
                        <p className="text-xs text-on-surface-variant">
                          Sin conexión: los puntos no se pueden canjear en esta venta.
                        </p>
                      ) : loyaltyConfig.pointsValue == null ? (
                        <p className="text-xs text-on-surface-variant">
                          Configurá cuánto vale un punto en Ajustes → Promociones para poder canjear.
                        </p>
                      ) : maxLoyaltyPoints <= 0 ? (
                        <p className="text-xs text-on-surface-variant">
                          {(loyaltyBalance ?? 0) > 0
                            ? "El total de la venta no alcanza para canjear puntos."
                            : "Este cliente todavía no tiene puntos."}
                        </p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={loyaltyConfig.minRedeem || 1}
                            max={maxLoyaltyPoints}
                            value={redeemPointsInput}
                            onChange={(e) => setRedeemPointsInput(e.target.value)}
                            placeholder={`Hasta ${maxLoyaltyPoints}`}
                            aria-label="Puntos a canjear"
                            className="w-24 bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-1.5 px-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                          <button
                            type="button"
                            onClick={handleApplyLoyaltyPoints}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-[#6063ee] text-white text-[11px] font-bold hover:bg-[#4f52d1] transition-colors"
                          >
                            Canjear
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ) : null
              ) : (promoSugerido || promoAplicado) && hitoGanado ? (
            <div className="mx-4 mt-3 rounded-xl border border-[#10b981]/30 bg-[#10b981]/10 px-4 py-3 flex items-center gap-3">
              <span className="text-xl shrink-0">🎁</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-on-surface truncate">{hitoGanado.reward}</p>
                <p className="text-xs text-on-surface-variant">
                  {promoAplicado
                    ? `Aplicado: −${formatMoney(promoAplicado.amount)}. Se canjea al cobrar.`
                    : `Ganado con ${promoGanado?.progress} cortes`}
                </p>
              </div>
              {promoAplicado ? (
                <button
                  onClick={() => {
                    setLineDiscounts([{ key: promoAplicado.key, discountAmount: 0 }]);
                    setPromoAplicado(null);
                  }}
                  className="shrink-0 text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
                >
                  Quitar
                </button>
              ) : (
                <button
                  onClick={() => {
                    setLineDiscounts([promoSugerido!]);
                    setPromoAplicado({
                      key: promoSugerido!.key,
                      amount: promoSugerido!.discountAmount,
                      forCustomer: customerId!,
                      forTab: activeTabId,
                    });
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-[#10b981] text-white text-[11px] font-bold hover:bg-[#059669] transition-colors"
                >
                  Aplicar −{formatMoney(promoSugerido!.discountAmount)}
                </button>
              )}
            </div>
                        ) : null
            }
            cart={cart}
            totals={totals}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            customerId={customerId}
            setCustomer={setCustomer}
            staffId={staffId}
            setStaff={setStaff}
            customers={customers}
            staff={staff}
            taxRate={taxRate}
            includeTax={includeTax}
            isTaxExempt={isTaxExempt}
            submitting={submitting}
            salesBlocked={salesBlocked}
            allowOversell={allowOversell}
            transferMethod={transferMethod ?? null}
            setTransferMethod={setTransferMethod}
            cardMethod={cardMethod ?? null}
            setCardMethod={setCardMethod}
            transferMethodsEnabled={transferMethodsEnabled}
            cardMethodsEnabled={cardMethodsEnabled}
            paymentOptions={paymentOptions}
            asksCardMethod={asksCardMethod}
            asksTransferMethod={asksTransferMethod}
            cartUnits={cartUnits}
            isCartOpen={isCartOpen}
            setIsCartOpen={setIsCartOpen}
            setLineKind={setLineKind}
            setLineStaff={setLineStaff}
            setLinePrice={setLinePrice}
            increment={increment}
            decrement={decrement}
            setQuantity={setQuantity}
            removeFromCart={removeFromCart}
            removeOffer={removeOffer}
            clearCart={clearCart}
            onCheckout={handleCheckoutClick}
            onOpenDiscountModal={() => setIsDiscountModalOpen(true)}
            onOpenSaleConfigModal={() => setIsSaleConfigModalOpen(true)}
            onOpenRecentSalesModal={() => setIsRecentSalesModalOpen(true)}
            onOpenCustomerModal={() => setIsCustomerModalOpen(true)}
            requireShift={requireShift}
            splitsCount={splits.length}
            isDelivery={isDelivery}
            setDelivery={setDelivery}
          />
        </div>

        <PosTabsBar
          tabs={tabs}
          activeTabId={activeTabId}
          tabMenuId={tabMenuId}
          setTabMenuId={setTabMenuId}
          setActiveTab={setActiveTab}
          addTab={addTab}
          removeTab={removeTab}
          onRename={(id) => {
            const target = tabs.find((t) => t.id === id);
            setRenameValue(target?.name ?? "");
            setRenamingTabId(id);
          }}
          onCloseTab={(id) => setClosingTabId(id)}
        />

        {/* Pegado a la barra de pestañas: es donde el cajero mira entre venta
            y venta. Solo se dibuja si hay algo pendiente o sin registrar. */}
        <div className="px-3 pb-2 empty:hidden">
          <OfflineQueueBadge onVerRechazadas={() => setIsRejectedModalOpen(true)} />
        </div>
      </div>

      {renamingTabId && (
        <TabRenameModal
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onSubmit={() => {
            renameTab(renamingTabId, renameValue);
            setRenamingTabId(null);
          }}
          onClose={() => setRenamingTabId(null)}
        />
      )}

      {closingTab && (() => {
        const units = closingTab.cart.reduce((s, l) => s + l.quantity, 0);
        return (
          <ConfirmDialog
            open
            title="Eliminar esta venta"
            description={`«${closingTab.name}» tiene ${units} unidad${units !== 1 ? "es" : ""} cargada${units !== 1 ? "s" : ""}. Se pierden al eliminarla.`}
            confirmLabel="Eliminar"
            tone="danger"
            icon={<AlertTriangle className="w-6 h-6" />}
            onConfirm={() => {
              removeTab(closingTab.id);
              setClosingTabId(null);
            }}
            onCancel={() => setClosingTabId(null)}
          />
        );
      })()}

      {isScannerOpen && (
        <BarcodeScannerModal
          continuous
          title="Escanear producto"
          hint="Se agrega solo a la venta."
          onDetected={handleScannedCode}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
      {isCustomerModalOpen && <CustomerModal onClose={() => setIsCustomerModalOpen(false)} />}
      {isDiscountModalOpen && <DiscountModal onClose={() => setIsDiscountModalOpen(false)} />}
      {isRecentSalesModalOpen && <RecentSalesModal onClose={() => setIsRecentSalesModalOpen(false)} />}

      {isWorker && isWithdrawalOpen && <WithdrawalModal onClose={() => setIsWithdrawalOpen(false)} />}
      {isWorker && isOpenShiftOpen && (
        <OpenShiftModal
          onClose={() => {
            pendingActionRef.current = null;
            setIsOpenShiftOpen(false);
          }}
          onOpened={() => {
            const action = pendingActionRef.current;
            pendingActionRef.current = null;
            action?.();
          }}
        />
      )}
      {isWorker && isCloseShiftOpen && (
        <CloseShiftModal live={currentShift} onClose={() => setIsCloseShiftOpen(false)} />
      )}
      {isSaleConfigModalOpen && <SaleConfigModal onClose={() => setIsSaleConfigModalOpen(false)} />}

      {isDeliveryModalOpen && (
        <DeliveryModal
          totals={totals}
          deliveryData={deliveryData}
          setDeliveryData={setDeliveryData}
          onConfirm={() => {
            setIsDeliveryModalOpen(false);
            setIsCheckoutModalOpen(true);
          }}
          onClose={() => setIsDeliveryModalOpen(false)}
        />
      )}

      {isCheckoutModalOpen && (
        <CheckoutModal
          totals={totals}
          cart={cart}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          transferMethod={transferMethod ?? null}
          cardMethod={cardMethod ?? null}
          setTransferMethod={setTransferMethod}
          setCardMethod={setCardMethod}
          paymentOptions={paymentOptions}
          splits={splits}
          addSplit={addSplit}
          removeSplit={removeSplit}
          updateSplitAmount={updateSplitAmount}
          updateSplitMethod={updateSplitMethod}
          transferMethodsEnabled={transferMethodsEnabled}
          cardMethodsEnabled={cardMethodsEnabled}
          asksCardMethod={asksCardMethod}
          asksTransferMethod={asksTransferMethod}
          submitting={submitting}
          amountTendered={amountTendered}
          setAmountTendered={setAmountTendered}
          error={checkoutError}
          // El modal queda abierto MIENTRAS se cobra: si el cobro falla, el
          // motivo aparece acá, donde el cajero está mirando, y puede corregir
          // el pago sin volver a armar nada. Se cierra solo si la venta quedó.
          onConfirm={() => {
            if (submitting) return;
            void handleCheckout();
          }}
          onClose={() => {
            setCheckoutError(null);
            setIsCheckoutModalOpen(false);
          }}
        />
      )}

      {isSuccessModalOpen && (
        <SuccessModal
          onPrint={() => {
            window.print();
            setIsSuccessModalOpen(false);
          }}
          onClose={() => { setIsSuccessModalOpen(false); setPromoSend(null); }}
          offline={lastSaleQueued}
          total={lastSaleSummary?.total ?? null}
          tendered={lastSaleSummary?.tendered ?? null}
          change={lastSaleSummary?.change ?? 0}
          whatsappLink={promoSend?.link ?? null}
          customerName={promoSend?.name ?? null}
          onOpenDrawer={drawerReady ? handleOpenDrawerManually : null}
        />
      )}

      {isRejectedModalOpen && (
        <RejectedSalesModal onClose={() => setIsRejectedModalOpen(false)} />
      )}

      {/* El servidor rechazó la venta por tope del plan: la caja no puede
          seguir hasta que suban de plan, así que se corta con un modal. */}
      {planLimitHit && <PlanLimitModal onClose={clearPlanLimit} />}

      <PosReceipt data={receiptData} />
    </>
  );
}
