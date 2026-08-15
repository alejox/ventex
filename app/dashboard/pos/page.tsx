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
import { PosCartPanel } from "./components/PosCartPanel";
import { CheckoutModal } from "./components/CheckoutModal";
import { DeliveryModal } from "./components/DeliveryModal";
import { PosTabsBar } from "./components/PosTabsBar";
import { SuccessModal } from "./components/SuccessModal";
import { usePromosStore } from "@/stores/promos.store";
import {
  fetchCustomerPromoTarget,
  milestoneFor,
  renderPromoMessage,
  whatsappLink as buildWhatsappLink,
  businessDisplayName,
} from "@/services/promos.service";
import { TabRenameModal } from "./components/TabRenameModal";
import { TabCloseConfirmModal } from "./components/TabCloseConfirmModal";
import { PlanLimitModal } from "./components/PlanLimitModal";
import { OfflineQueueBadge } from "./components/OfflineQueueBadge";
import { RejectedSalesModal } from "./components/RejectedSalesModal";

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

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const profile = useProfile();
  const isWorker = profile?.isWorker ?? false;
  const currentShift = useShiftsStore((s) => s.currentShift);
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

  const requireShift = (action: () => void): void => {
    if (isWorker && !currentShift) {
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
  const setLineKind = usePosStore((s) => s.setLineKind);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const setStaff = usePosStore((s) => s.setStaff);
  const setPaymentMethod = usePosStore((s) => s.setPaymentMethod);
  const setTransferMethod = usePosStore((s) => s.setTransferMethod);
  const setCardMethod = usePosStore((s) => s.setCardMethod);
  const setLineStaff = usePosStore((s) => s.setLineStaff);
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
  const promoConfig = usePromosStore((s) => s.config);
  const promoMilestones = usePromosStore((s) => s.milestones);
  const fetchPromos = usePromosStore((s) => s.fetchAll);
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

  useEffect(() => { init(); }, [init]);
  // Reenvía solo las ventas que quedaron cobradas sin conexión.
  useOfflineSync();
  useEffect(() => {
    // Con un mensaje para mandar, el modal NO se cierra solo: cinco segundos no
    // alcanzan para leer, decidir y tocar el botón, y que se evapore en la mano
    // es peor que no ofrecerlo.
    if (isSuccessModalOpen && !promoSend) {
      const timer = setTimeout(() => setIsSuccessModalOpen(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isSuccessModalOpen, promoSend]);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

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
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
        const snapshot = latest.current;
        if (!snapshot) return;
        if (!snapshot.anyModalOpen && snapshot.cart.length > 0 && !snapshot.submitting) {
          snapshot.requireShift(() => {
            setAmountTendered("");
            if (snapshot.isDelivery) {
              setIsDeliveryModalOpen(true);
            } else {
              setIsCheckoutModalOpen(true);
            }
          });
        }
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

  const handleScannedCode = useCallback(
    (code: string) => {
      const q = code.trim().toLowerCase();
      const match =
        catalog.find((p) => p.barcode?.toLowerCase() === q) ??
        catalog.find((p) => p.sku?.toLowerCase() === q);
      if (!match) {
        notifyError("C\u00f3digo no encontrado", `Ning\u00fan \u00edtem tiene el c\u00f3digo ${code}.`);
        return;
      }
      // `stock_level` en null = el ítem no lleva inventario (servicio): no hay
      // unidades que puedan faltar. Ver `CatalogItem`.
      if (!allowOversell && match.stock_level != null && match.stock_level <= 0) {
        notifyError("Sin stock", `${match.name} no tiene unidades disponibles.`);
        return;
      }
      addToCart(match);
      notifySuccess("Agregado a la venta", match.name);
    },
    [catalog, addToCart, allowOversell],
  );

  const cartUnits = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);

  const cartQty = useMemo(() => {
    const byId = new Map<string, number>();
    for (const line of cart) {
      byId.set(line.item.id, (byId.get(line.item.id) ?? 0) + line.quantity);
    }
    return byId;
  }, [cart]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const isTaxExempt = selectedCustomer?.tax_exempt ?? false;

  const totals = useMemo(
    () => computeTotals(cart, taxRate, isTaxExempt, includeTax),
    [cart, taxRate, includeTax, isTaxExempt],
  );

  const handleCheckout = async () => {
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
    // "queued" es un cobro bueno: la venta est\u00e1 guardada en el dispositivo y se
    // env\u00eda sola cuando vuelva la red. Se limpia la pantalla igual que en una
    // venta normal, pero el aviso no puede prometer que ya qued\u00f3 registrada.
    if (outcome === "sold" || outcome === "queued") {
      setLastSaleQueued(outcome === "queued");
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
      setPromoSend(null);
      const cobroCortes =
        outcome === "sold" &&
        promoConfig.enabled &&
        promoConfig.serviceIds.length > 0 &&
        Boolean(selectedCustomer) &&
        cart.some((l) => l.item.kind === "service" && promoConfig.serviceIds.includes(l.item.id));

      if (cobroCortes && selectedCustomer) {
        try {
          const { count, phone } = await fetchCustomerPromoTarget(selectedCustomer.id);
          const hito = milestoneFor(count, promoMilestones);
          const texto = renderPromoMessage(promoConfig.message, {
            cliente: selectedCustomer.full_name.split(" ")[0],
            cortes: count,
            negocio: businessDisplayName(businessProfile?.businessName, profile?.businessName),
            premio: hito?.reward ?? null,
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
  };

  const handleCheckoutClick = () => {
    requireShift(() => {
      setAmountTendered("");
      if (isDelivery) {
        setIsDeliveryModalOpen(true);
      } else {
        setIsCheckoutModalOpen(true);
      }
    });
  };

  useEffect(() => {
    latest.current = {
      cart,
      submitting,
      paymentMethod,
      isDelivery,
      anyModalOpen:
        isCustomerModalOpen ||
        isDiscountModalOpen ||
        isRecentSalesModalOpen ||
        isSaleConfigModalOpen ||
        isSuccessModalOpen ||
        isCheckoutModalOpen ||
        isDeliveryModalOpen ||
        isOpenShiftOpen ||
        isScannerOpen ||
        renamingTabId !== null ||
        closingTabId !== null,
      requireShift,
      checkout: handleCheckoutClick,
    };
  });

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
            addToCart={addToCart}
            increment={increment}
            decrement={decrement}
            lineKey={lineKey}
            onOpenScanner={() => setIsScannerOpen(true)}
            onOpenShift={() => setIsOpenShiftOpen(true)}
            onOpenWithdrawal={() => setIsWithdrawalOpen(true)}
            openCloseShift={openCloseShift}
          />

          <div className={`lg:hidden fixed bottom-[calc(2.75rem+env(safe-area-inset-bottom))] inset-x-0 z-40 px-3 pt-3 pb-2 bg-gradient-to-t from-background via-background to-transparent transition-opacity duration-200 ${
            isCartOpen ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              disabled={cart.length === 0}
              className="w-full h-12 flex items-center justify-between gap-3 rounded-xl bg-primary text-white px-3.5 shadow-lg shadow-primary/25 active:bg-primary-dim transition-colors disabled:opacity-40"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="relative shrink-0">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  {cartUnits > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-white text-primary text-[10px] font-bold flex items-center justify-center">
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
                <span className="text-sm font-bold tabular-nums">${(totals.total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          </div>

          <PosCartPanel
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
            increment={increment}
            decrement={decrement}
            setQuantity={setQuantity}
            removeFromCart={removeFromCart}
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

      {closingTab && (
        <TabCloseConfirmModal
          tabName={closingTab.name}
          tabCartUnits={closingTab.cart.reduce((s, l) => s + l.quantity, 0)}
          onConfirm={() => {
            removeTab(closingTab.id);
            setClosingTabId(null);
          }}
          onClose={() => setClosingTabId(null)}
        />
      )}

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
          onConfirm={() => {
            setIsCheckoutModalOpen(false);
            handleCheckout();
          }}
          onClose={() => setIsCheckoutModalOpen(false)}
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
          whatsappLink={promoSend?.link ?? null}
          customerName={promoSend?.name ?? null}
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
