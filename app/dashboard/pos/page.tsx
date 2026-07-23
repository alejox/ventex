"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { IconSearch } from "@/app/assets/icons/DashboardIcons";
import { usePosStore } from "@/stores/pos.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useShiftsStore } from "@/stores/shifts.store";
import { useProfile } from "@/components/ProfileProvider";
import { OpenShiftModal } from "@/components/shift/OpenShiftModal";
import { CloseShiftModal } from "@/components/shift/CloseShiftModal";
import { WithdrawalModal } from "@/components/shift/WithdrawalModal";
import {
  computeTotals,
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
import { AlertTriangle } from "lucide-react";
import { notifySuccess, notifyWarning, notifyError } from "@/lib/notifications";

function IconDiscount(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function IconTrash(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="20" height="20" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconImagePlaceholder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="24" height="24" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function IconUserPlus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function IconThunder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconReceipt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <line x1="16" y1="8" x2="8" y2="8" />
      <line x1="16" y1="12" x2="8" y2="12" />
      <line x1="10" y1="16" x2="8" y2="16" />
    </svg>
  );
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
];

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ReceiptData {
  items: { name: string; sku: string | null; quantity: number; price: number; total: number }[];
  customer: CustomerOption | null;
  totals: SaleTotals;
  paymentMethod: PaymentMethod;
  date: Date;
  businessName?: string | null;
  logoUrl?: string | null;
  includeTax: boolean;
}

export default function POSPage() {
  // Datos y acciones desde el store
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

  const businessProfile = useSettingsStore((s) => s.settings?.business_profile);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Turno de caja: los empleados no pueden cobrar sin turno abierto.
  const profile = useProfile();
  const isWorker = profile?.isWorker ?? false;
  const currentShift = useShiftsStore((s) => s.currentShift);
  const fetchCurrentShift = useShiftsStore((s) => s.fetchCurrentShift);
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);
  const [isOpenShiftOpen, setIsOpenShiftOpen] = useState(false);
  // Lo que el empleado quiso hacer sin turno: se reintenta al abrirlo.
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isWorker) fetchCurrentShift();
  }, [isWorker, fetchCurrentShift]);

  const openCloseShift = () => {
    // Refresca los acumulados antes de calcular el arqueo.
    fetchCurrentShift();
    setIsCloseShiftOpen(true);
  };

  /**
   * Cobrar e imprimir sí exigen turno abierto (`create_sale` lo rechaza sin él),
   * así que el modal se pide aquí y no al entrar al POS: armar el carrito o
   * consultar precios no lo necesita.
   */
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
      // Ámbar si la venta se hizo igual (aviso de inventario); rojo si el
      // negocio no permite sobrevender, porque ahí la acción no ocurrió.
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
  const setCustomer = usePosStore((s) => s.setCustomer);
  const setStaff = usePosStore((s) => s.setStaff);
  const setPaymentMethod = usePosStore((s) => s.setPaymentMethod);
  const setLineStaff = usePosStore((s) => s.setLineStaff);
  const clearCart = usePosStore((s) => s.clearCart);
  const checkout = usePosStore((s) => s.checkout);

  // Estado local
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isRecentSalesModalOpen, setIsRecentSalesModalOpen] = useState(false);
  const [isSaleConfigModalOpen, setIsSaleConfigModalOpen] = useState(false);
  const [isCashConfirmOpen, setIsCashConfirmOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  // Menú ⋮ de la pestaña activa, y los dos flujos que abre.
  const [tabMenuId, setTabMenuId] = useState<string | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  // En móvil la factura no cabe al lado del catálogo: se abre como panel lateral.
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [amountTendered, setAmountTendered] = useState("");
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isSuccessModalOpen) {
      const timer = setTimeout(() => setIsSuccessModalOpen(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isSuccessModalOpen]);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);

  const { cart, customerId, staffId, paymentMethod } = activeTab;

  /** Lo único que el atajo de teclado necesita saber del render actual. */
  interface KeyboardSnapshot {
    cart: CartLine[];
    submitting: boolean;
    paymentMethod: PaymentMethod;
    anyModalOpen: boolean;
    requireShift: (action: () => void) => void;
    checkout: () => void;
  }

  // El listener de teclado se registra una sola vez al montar, así que no puede
  // cerrar sobre el estado. En vez de un ref espejo por cada valor (que había
  // que asignar durante el render), se mantiene UN snapshot que se sincroniza
  // en un efecto: después del render, y mucho antes de que alguien teclee.
  // El efecto que lo llena vive más abajo, junto a `handleCheckout`.
  const latest = useRef<KeyboardSnapshot>(null!);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsCustomerModalOpen(false);
        setIsDiscountModalOpen(false);
        setIsRecentSalesModalOpen(false);
        setIsSaleConfigModalOpen(false);
        setIsSuccessModalOpen(false);
        setIsCashConfirmOpen(false);
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
            if (snapshot.paymentMethod === "efectivo") {
              setAmountTendered("");
              setIsCashConfirmOpen(true);
            } else {
              snapshot.checkout();
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
          !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (a.kind === "service" && b.kind !== "service") return -1;
        if (a.kind !== "service" && b.kind === "service") return 1;
        return 0;
      });
  }, [catalog, search, activeCategory]);

  /**
   * Un código escaneado es lo mismo que un SKU tecleado: se resuelve contra el
   * catálogo ya cargado, sin ida al servidor, para que el escáner siga siendo
   * instantáneo. El escáner queda abierto (modo continuo) porque escanear varios
   * ítems seguidos es el caso normal en el mostrador.
   */
  const handleScannedCode = useCallback(
    (code: string) => {
      const q = code.trim().toLowerCase();
      const match = catalog.find((p) => p.sku?.toLowerCase() === q);
      if (!match) {
        notifyError("Código no encontrado", `Ningún ítem tiene el SKU ${code}.`);
        return;
      }
      if (!allowOversell && match.kind === "product" && (match.stock_level ?? 0) <= 0) {
        notifyError("Sin stock", `${match.name} no tiene unidades disponibles.`);
        return;
      }
      addToCart(match);
      notifySuccess("Agregado a la venta", match.name);
    },
    [catalog, addToCart, allowOversell],
  );

  const cartUnits = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);

  /** Cantidad en carrito por ítem: la fila del catálogo dibuja su contador. */
  const cartQty = useMemo(() => {
    const byId = new Map<string, number>();
    for (const line of cart) byId.set(line.item.id, line.quantity);
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
        price: l.item.price,
        total: l.item.price * l.quantity,
      })),
      customer: selectedCustomer,
      totals,
      paymentMethod,
      date: new Date(),
      businessName: businessProfile?.businessName ?? null,
      logoUrl: businessProfile?.logoUrl ?? null,
      includeTax,
    };
    setReceiptData(data);
    const ok = await checkout();
    if (ok) {
      notifySuccess(
        "¡Venta realizada con éxito! 🎉",
        "El comprobante de la transacción está listo."
      );
      setSearch("");
      setActiveCategory("Todos");
      setAmountTendered("");
      setIsCartOpen(false);
      setIsSuccessModalOpen(true);
    }
  };

  // Sincroniza el snapshot que lee el atajo de teclado. Va acá, después de
  // `handleCheckout`, porque necesita su versión de este render.
  useEffect(() => {
    latest.current = {
      cart,
      submitting,
      paymentMethod,
      anyModalOpen:
        isCustomerModalOpen ||
        isDiscountModalOpen ||
        isRecentSalesModalOpen ||
        isSaleConfigModalOpen ||
        isSuccessModalOpen ||
        isCashConfirmOpen ||
        isOpenShiftOpen ||
        isScannerOpen ||
        // Enter dentro del campo de renombrar guarda el nombre, no cobra.
        renamingTabId !== null ||
        closingTabId !== null,
      requireShift,
      checkout: handleCheckout,
    };
  });

  return (
    <>
      {/* Alto fijo (con columnas que scrollean por dentro) solo en escritorio: en
          móvil las columnas se apilan, así que la página crece y scrollea normal. */}
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-5rem)] -m-6 lg:-m-10 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0 bg-background relative lg:overflow-hidden print:hidden">
      
      {/* Columna Izquierda: Catálogo + Tabs */}
      <div className="flex-1 flex flex-col min-w-0 px-6 lg:pl-10 lg:pr-6 lg:border-r border-outline-variant/10">
        
        {/* En móvil el buscador ocupa su propia fila y las acciones bajan a la
            siguiente: con el turno abierto los botones dejaban el input en 48px. */}
        <div className="flex flex-wrap items-center gap-2 lg:gap-3 mb-4 lg:mb-6 pt-4">
          {/* min-w-0: sin esto el botón de la derecha aplasta el buscador. */}
          <div className="relative w-full lg:w-auto lg:flex-1 min-w-0 order-1">
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-primary rounded-l-2xl flex items-center justify-center">
              <IconSearch className="w-5 h-5 text-white" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const q = search.trim().toLowerCase();
                  if (q) {
                    const match = catalog.find(
                      (p) => p.sku?.toLowerCase() === q
                    );
                    if (match) {
                      // Sin freno por stock: el escaneo agrega siempre y, si
                      // sobrevende, el store dispara el aviso ámbar.
                      addToCart(match);
                      setSearch("");
                    }
                  }
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              placeholder="Buscar o escanear código"
              ref={(el) => { if (el) searchRef.current = el; }}
              /* text-base en móvil: por debajo de 16px iOS hace zoom al enfocar. */
              className="w-full h-12 bg-surface-container-lowest rounded-2xl pl-14 pr-14 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant border border-outline-variant/30 shadow-sm"
            />
            {/* Escaneo con la cámara: pegado al buscador porque resuelve lo mismo. */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              aria-label="Escanear código de barras"
              title="Escanear código de barras"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
              </svg>
            </button>
          </div>

          {/* Fila de acciones: en móvil va debajo del buscador y scrollea si hace falta. */}
          <div className="order-2 flex items-center gap-2 lg:gap-3 w-full lg:w-auto overflow-x-auto scrollbar-hide">
          {isWorker && !currentShift && (
            <button
              onClick={() => setIsOpenShiftOpen(true)}
              className="h-12 px-4 rounded-2xl border border-outline-variant/30 text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors shrink-0 flex items-center gap-2"
              title="Aún no has abierto la caja de este turno"
            >
              <span className="w-2 h-2 rounded-full bg-on-surface-variant/40" />
              Abrir turno
            </button>
          )}
          {isWorker && currentShift && (
            <>
              <button
                onClick={() => setIsWithdrawalOpen(true)}
                className="h-12 px-4 rounded-2xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors shrink-0"
                title="Registrar un retiro de efectivo de la caja"
              >
                Retiro
              </button>
              <button
                onClick={openCloseShift}
                className="h-12 px-4 rounded-2xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors shrink-0 flex items-center gap-2"
                title={`Turno abierto desde ${new Date(currentShift.opened_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`}
              >
                <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                Cerrar turno
              </button>
            </>
          )}
          <button
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            /* En móvil el catálogo siempre es lista: el conmutador no aplica. */
            className="hidden lg:flex w-12 h-12 rounded-2xl border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors items-center justify-center shrink-0"
            title={viewMode === "grid" ? "Vista lista" : "Vista cuadr\u00edcula"}
          >
            {viewMode === "grid" ? (
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            ) : (
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            )}
          </button>
          {/* En móvil se reduce a "+": el texto completo no cabe junto al buscador. */}
          <button
            onClick={() => router.push("/dashboard/inventory/product?from=/dashboard/pos")}
            aria-label="Nuevo producto"
            title="Nuevo producto"
            className="shrink-0 whitespace-nowrap w-12 h-12 lg:w-auto lg:px-5 ml-auto lg:ml-0 rounded-2xl bg-transparent border border-primary/50 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
          >
            <span className="hidden lg:inline">Nuevo producto</span>
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5 lg:w-4 lg:h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          </div>
        </div>

        {/* Categorías */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                cat === activeCategory
                  ? "bg-[#6063ee] text-white"
                  : "bg-surface-container border border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        <div className="flex-1 lg:overflow-y-auto pb-6 pr-2">
          {error && (
            <div className="mb-4 rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-center text-sm text-on-surface-variant py-12">Cargando catálogo…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-on-surface-variant py-12">
              {catalog.length === 0
                ? "No hay productos ni servicios. Agrégalos en Inventario o Servicios."
                : "Ningún ítem coincide con el filtro."}
            </p>
          ) : (
            <>
            {/* Móvil: fila por ítem con contador en línea. Poder subir y bajar
                cantidades sin abrir la factura es lo que hace que armar una
                venta con una mano sea viable. */}
            <ul className="lg:hidden space-y-1.5">
              {filtered.map((item) => {
                const qty = cartQty.get(item.id) ?? 0;
                const outOfStock = item.kind === "product" && (item.stock_level ?? 0) <= 0;
                const blocked = !allowOversell && outOfStock;
                const atStockCap =
                  !allowOversell &&
                  item.kind === "product" &&
                  item.stock_level != null &&
                  qty >= item.stock_level;
                return (
                  <li key={item.id}>
                    <div
                      className={`flex items-center gap-2.5 p-2 rounded-xl border transition-colors ${
                        qty > 0
                          ? "border-primary bg-primary/5"
                          : item.kind === "service"
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : "border-outline-variant/10 bg-surface-container"
                      } ${blocked && qty === 0 ? "opacity-50" : ""}`}
                    >
                      <div className="w-12 h-12 shrink-0 rounded-lg bg-surface-container-lowest flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
                          <Image src={item.image_url} alt="" width={48} height={48} unoptimized className="w-full h-full object-cover" />
                        ) : (
                          <IconImagePlaceholder className="w-5 h-5 text-on-surface-variant/30" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-on-surface leading-snug line-clamp-2">
                          {item.name}
                        </p>
                        <p className="text-[15px] font-bold text-on-surface tabular-nums">
                          ${money(item.price)}
                        </p>
                        <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                          {item.kind === "service" ? (
                            <span className="text-emerald-500">Servicio</span>
                          ) : outOfStock ? (
                            <span className={allowOversell ? "text-amber-600" : "text-error"}>Sin stock</span>
                          ) : (
                            `Stock: ${item.stock_level}`
                          )}
                        </p>
                      </div>

                      {qty > 0 ? (
                        <div className="flex items-center gap-1 shrink-0 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                          <button
                            onClick={() => decrement(item.id)}
                            aria-label={`Quitar una unidad de ${item.name}`}
                            className="w-10 h-10 flex items-center justify-center text-lg text-on-surface-variant active:bg-on-surface/10 rounded-l-xl"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-on-surface tabular-nums">
                            {qty}
                          </span>
                          <button
                            onClick={() => increment(item.id)}
                            disabled={atStockCap}
                            aria-label={`Agregar una unidad de ${item.name}`}
                            className="w-10 h-10 flex items-center justify-center text-lg text-on-surface-variant active:bg-on-surface/10 rounded-r-xl disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          disabled={blocked}
                          aria-label={`Agregar ${item.name} a la venta`}
                          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-primary text-white active:bg-primary-dim transition-colors disabled:opacity-30"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" className="w-5 h-5">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Escritorio: se mantiene el conmutador grilla/lista. */}
            <div className="hidden lg:block">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={!allowOversell && item.kind === "product" && (item.stock_level ?? 0) <= 0}
                    className={`text-left rounded-2xl p-3 border flex flex-col transition-colors group shadow-sm relative disabled:opacity-50 disabled:cursor-not-allowed ${
                      item.kind === "service"
                        ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-400/40 disabled:hover:border-emerald-500/20"
                        : "bg-surface-container border-outline-variant/10 hover:border-primary/30 disabled:hover:border-outline-variant/10"
                    }`}
                  >
                    {/* Con sobreventa: informa. Sin ella: el botón ya está frenado. */}
                    {item.kind === "product" && (item.stock_level ?? 0) <= 0 && (
                      <span
                        className={`absolute top-2 right-2 z-10 text-[10px] font-bold px-2 py-1 rounded-md border ${
                          allowOversell
                            ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                            : "bg-error/10 text-error-dim border-error/20"
                        }`}
                      >
                        Sin stock
                      </span>
                    )}
                    <div className="aspect-square rounded-xl bg-surface-container-lowest flex items-center justify-center mb-3 group-hover:bg-surface-container-low transition-colors overflow-hidden">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          width={160}
                          height={160}
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <IconImagePlaceholder className="w-8 h-8 text-on-surface-variant/30" />
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      {item.kind === "service" ? "Servicio" : `SKU: ${item.sku}`}
                    </p>
                    <h3 className="text-sm font-medium text-on-surface mb-2 line-clamp-2 leading-tight flex-1 group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    {/* Precio y stock envuelven: en tarjetas angostas no caben en una línea. */}
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 mt-auto">
                      <span className="text-sm sm:text-base text-on-surface font-bold tabular-nums">
                        ${money(item.price)}
                      </span>
                      {item.kind === "service" ? (
                        <span className="text-[10px] font-bold text-on-surface-variant shrink-0">
                          Servicio
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            (item.stock_level ?? 0) <= 0
                              ? "text-amber-600"
                              : (item.stock_level ?? 0) <= 5
                                ? "text-amber-500"
                                : "text-on-surface-variant"
                          }`}
                        >
                          Stock: {item.stock_level}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={!allowOversell && item.kind === "product" && (item.stock_level ?? 0) <= 0}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                      item.kind === "service"
                        ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-400/40"
                        : "bg-surface-container border-outline-variant/10 hover:bg-surface-container-high"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center overflow-hidden shrink-0">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          width={36}
                          height={36}
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-3 h-3 rounded bg-outline-variant/20" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider truncate">
                        {item.kind === "service" ? "Servicio" : item.sku}
                      </p>
                      <h3 className="text-xs font-medium text-on-surface truncate">{item.name}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-on-surface">${money(item.price)}</p>
                      {item.kind !== "service" && (
                        <span
                          className={`text-[9px] font-bold ${
                            (item.stock_level ?? 0) <= 0
                              ? "text-amber-600"
                              : (item.stock_level ?? 0) <= 5
                                ? "text-amber-500"
                                : "text-on-surface-variant"
                          }`}
                        >
                          {item.stock_level} uds.
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            </div>
            </>
          )}
        </div>

        {/* Barra de ventas concurrentes.
            El cierre estaba en una X con `opacity-0 group-hover:opacity-100`:
            en un teléfono no hay hover, así que la ventana NO se podía cerrar.
            Ahora la pestaña activa lleva un menú ⋮ con Renombrar y Eliminar,
            que funciona igual con el dedo que con el mouse. */}
        {/* El wrapper NO scrollea: el menú desplegable vive acá afuera porque
            `overflow-x-auto` recorta también en vertical y se lo comía. */}
        {/* El z-index sube SOLO mientras el menú está abierto.
            El botón de cobro es hermano y también z-40, pero va después en el
            DOM: a igual z gana el último, y le tapaba "Eliminar". Y como esta
            barra tiene z-index propio, el z-50 del menú queda encerrado en su
            contexto de apilamiento y no alcanza para escaparse.
            Permanente no puede ser: el panel de factura es z-50 y la barra
            quedaría pintada encima cuando se abre. */}
        <div className={`fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)] lg:relative lg:z-auto lg:pb-0 lg:mt-auto lg:-ml-10 lg:-mr-6 bg-surface-container-low border-t border-outline-variant/20 ${
          tabMenuId ? "z-[60]" : "z-40"
        }`}>
        <div className="px-2 lg:pl-10 lg:pr-6 flex items-stretch gap-0.5 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => {
            const isActive = t.id === activeTabId;
            return (
            <div key={t.id} className="shrink-0">
              <div
                className={`h-11 flex items-center gap-1.5 pl-2.5 pr-0.5 min-w-[124px] max-w-[190px] transition-all border-b-2 ${
                  isActive
                    ? "bg-surface-container-lowest border-primary text-primary font-semibold"
                    : "bg-transparent border-transparent text-on-surface-variant hover:bg-surface-container-high/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className="flex items-center gap-1.5 min-w-0 flex-1 h-full text-left"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span className="text-xs truncate">{t.name}</span>
                </button>

                {/* Solo en la activa: el menú actúa sobre la venta que se ve. */}
                {isActive && (
                  <button
                    type="button"
                    onClick={() => setTabMenuId(tabMenuId === t.id ? null : t.id)}
                    aria-label={`Opciones de ${t.name}`}
                    aria-haspopup="menu"
                    aria-expanded={tabMenuId === t.id}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  >
                    <svg fill="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                      <circle cx="12" cy="5" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="12" cy="19" r="1.6" />
                    </svg>
                  </button>
                )}
              </div>

            </div>
            );
          })}
          <button
            onClick={addTab}
            aria-label="Nueva venta"
            className="w-10 h-11 ml-0.5 shrink-0 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Menú de la pestaña activa. Uno solo: nunca hay dos abiertos. */}
        {tabMenuId && (
          <>
            {/* Capa de cierre: en móvil no existe el "click afuera" sin esto. */}
            <div className="fixed inset-0 z-40" onClick={() => setTabMenuId(null)} />
            <div
              role="menu"
              className="absolute bottom-full right-4 lg:right-6 mb-1 z-50 min-w-[180px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150"
            >
              <button
                role="menuitem"
                onClick={() => {
                  const target = tabs.find((t) => t.id === tabMenuId);
                  setRenameValue(target?.name ?? "");
                  setRenamingTabId(tabMenuId);
                  setTabMenuId(null);
                }}
                className="w-full text-left px-4 py-3.5 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Renombrar
              </button>
              <button
                role="menuitem"
                disabled={tabs.length === 1}
                onClick={() => {
                  const target = tabs.find((t) => t.id === tabMenuId);
                  setTabMenuId(null);
                  if (!target) return;
                  // Cerrar una venta con ítems cargados es perder trabajo: se
                  // pregunta. Vacía, se cierra sin fricción.
                  if (target.cart.length > 0) setClosingTabId(target.id);
                  else removeTab(target.id);
                }}
                className="w-full text-left px-4 py-3.5 text-sm text-error hover:bg-error/10 transition-colors border-t border-outline-variant/10 disabled:opacity-40 disabled:hover:bg-transparent"
                title={tabs.length === 1 ? "Es la única venta abierta" : undefined}
              >
                Eliminar
              </button>
            </div>
          </>
        )}
        </div>
      </div>

      {/* Barra inferior fija (solo móvil): el acceso al carrito sin scrollear
          toda la grilla, y el total siempre visible mientras se arma la venta. */}
      {/* Botón de cobro. Va JUSTO encima de la barra de ventanas, que es la que
          toca el borde inferior. El desplazamiento (`bottom`) tiene que seguir
          a la altura de esa barra: si cambia el `h-11` de las pestañas, cambia
          acá también. */}
      <div className="lg:hidden fixed bottom-[calc(2.75rem+env(safe-area-inset-bottom))] inset-x-0 z-40 px-3 pt-3 pb-2 bg-gradient-to-t from-background via-background to-transparent">
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
                ? "Agregá ítems para cobrar"
                : `${cart.length} ítem${cart.length !== 1 ? "s" : ""} · cobrar`}
            </span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm font-bold tabular-nums">${money(totals.total)}</span>
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-3.5 h-3.5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>
      </div>

      {/* Backdrop del panel de factura en móvil. */}
      {isCartOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      {/* Orden actual / Factura de Venta.
          Móvil: panel lateral derecho sobre el catálogo. Escritorio: columna fija. */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[420px] shadow-2xl transition-transform duration-300 ease-out
          lg:static lg:z-auto lg:w-[420px] lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none
          bg-surface-container-lowest flex flex-col h-full shrink-0 border-l border-outline-variant/10
          ${isCartOpen ? "translate-x-0" : "translate-x-full"}`}
      >

        {/* Top bar de Factura */}
        <div className="p-5 border-b border-outline-variant/10 space-y-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pt-6">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg font-bold text-on-surface flex items-center gap-2 min-w-0">
              <span className="truncate">Factura de venta</span>
              <div className="w-6 h-6 shrink-0 rounded-full bg-[#6063ee]/10 flex items-center justify-center text-[#6063ee]">
                <IconThunder className="w-3.5 h-3.5" />
              </div>
            </h2>
            <div className="flex items-center gap-3 text-on-surface-variant shrink-0">
               {/* Iconos visuales superiores */}
               <button onClick={() => setIsDiscountModalOpen(true)} className="hover:text-primary" title="Descuentos globales"><IconDiscount className="w-5 h-5" /></button>
               <button onClick={() => requireShift(() => window.print())} className="hover:text-primary" title="Imprimir"><svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
               <button onClick={() => setIsSaleConfigModalOpen(true)} className="hover:text-primary" title="Configuración"><svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></button>
               <button
                 onClick={() => setIsCartOpen(false)}
                 aria-label="Cerrar factura"
                 className="lg:hidden -mr-1.5 w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high hover:text-on-surface transition-colors"
               >
                 <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5"><path d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            </div>
          </div>

          {/* Selectores maqueta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-on-surface-variant">Lista de precio</label>
              <select className="w-full bg-transparent border border-outline-variant/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary appearance-none">
                <option>General</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-on-surface-variant">Numeración</label>
              <select className="w-full bg-transparent border border-outline-variant/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary appearance-none">
                <option>Principal</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-on-surface-variant">Método de pago</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-transparent border border-outline-variant/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary appearance-none"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-[11px] font-semibold text-on-surface-variant">Cliente</label>
              <select
                value={customerId ?? ""}
                onChange={(e) => setCustomer(e.target.value || null)}
                className="w-full bg-transparent border border-outline-variant/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary appearance-none"
              >
                <option value="">Consumidor final (22222222222)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.tax_exempt ? " (exento)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setIsCustomerModalOpen(true)}
              className="h-[30px] w-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <IconUserPlus className="w-4 h-4" />
            </button>
          </div>

          {staff.length > 0 && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-on-surface-variant">Atendido por</label>
              <select
                value={staffId ?? ""}
                onChange={(e) => setStaff(e.target.value || null)}
                className="w-full bg-transparent border border-outline-variant/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary appearance-none"
              >
                <option value="">—</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Líneas */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center text-on-surface-variant/50 mb-3">
                <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <p className="text-sm text-on-surface-variant">
                Aquí verás los ítems que elijas en tu próxima venta
              </p>
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.item.id} className={`flex flex-col gap-2 rounded-xl p-2 ${line.item.kind === "service" ? "bg-emerald-500/5 border border-emerald-500/10" : ""}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-medium text-on-surface line-clamp-1">{line.item.name}</h4>
                      <p className="text-[10px] mt-0.5 uppercase tracking-wide font-semibold">
                        {line.item.kind === "service" ? (
                          <span className="text-emerald-500">Servicio</span>
                        ) : (
                          <span className="text-on-surface-variant">SKU: {line.item.sku}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-on-surface">
                        ${money(line.item.price * line.quantity)}
                      </p>
                      {(line.discountAmount ?? 0) > 0 && (
                        <p className="text-xs font-medium text-error">
                          -{money(line.discountAmount!)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {/* El toast dura 5s; esto queda mientras el ítem esté en el
                    carrito, así el cajero lo ve al momento de cobrar. */}
                {line.item.kind === "product" &&
                  line.item.stock_level != null &&
                  line.quantity > line.item.stock_level && (
                    <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Sin stock: quedan {line.item.stock_level} y se venden {line.quantity}.
                    </p>
                  )}
                {(line.item.kind === "service" || line.item.has_commission) && staff.length > 0 && (
                  <select
                    value={line.staffId ?? ""}
                    onChange={(e) => setLineStaff(line.item.id, e.target.value || null)}
                    className="w-full bg-transparent border border-outline-variant/20 rounded-lg px-2 py-1 text-[10px] text-on-surface focus:outline-none focus:border-primary appearance-none"
                  >
                    <option value="">Atendido por —</option>
                    {staff.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center border border-outline-variant/20 rounded-lg overflow-hidden bg-surface-container-lowest">
                    <button
                      onClick={() => decrement(line.item.id)}
                      className="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-lg"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={allowOversell ? undefined : line.item.stock_level ?? undefined}
                      value={line.quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v)) setQuantity(line.item.id, v);
                      }}
                      className="w-12 text-center text-xs font-medium text-on-surface bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {/* Con sobreventa no hay tope: avisa y sigue. Sin ella, frena. */}
                    <button
                      onClick={() => increment(line.item.id)}
                      disabled={
                        !allowOversell &&
                        line.item.kind === "product" &&
                        line.item.stock_level != null &&
                        line.quantity >= line.item.stock_level
                      }
                      className="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-lg"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(line.item.id)}
                    className="text-error/70 hover:text-error transition-colors p-1"
                    aria-label="Quitar ítem"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

          {/* Area de checkout inferior */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-container-lowest mt-auto shrink-0 border-t border-outline-variant/10 lg:border-t-0">
          {/* Contador de productos */}
          {cart.length > 0 && (
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-semibold text-on-surface-variant">
                {cart.length} ítem{cart.length !== 1 ? "s" : ""} · {cart.reduce((s, l) => s + l.quantity, 0)} unidad{cart.reduce((s, l) => s + l.quantity, 0) !== 1 ? "es" : ""}
              </span>
            </div>
          )}

          {/* Resumen de totales. Los precios son de vitrina (IVA incluido):
              con IVA se desglosa la base, y el exento paga la base. */}
          {cart.length > 0 && (
            <div className="space-y-2 mb-4 bg-surface-container p-4 rounded-2xl border border-outline-variant/10">
              <p className="text-sm font-bold text-on-surface mb-1">Detalle</p>
              {isTaxExempt ? (
                <>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Precio original</span>
                    <span className="font-semibold text-on-surface">${money(totals.gross)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[#10b981]">
                    <span>Descuento por exención de IVA</span>
                    <span className="font-semibold">-${money(totals.exemptionDiscount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Subtotal (base)</span>
                    <span className="font-semibold text-on-surface">${money(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>IVA (exento)</span>
                    <span className="font-semibold text-on-surface">$0.00</span>
                  </div>
                </>
              ) : includeTax ? (
                <>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Subtotal (base)</span>
                    <span className="font-semibold text-on-surface">${money(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>IVA ({(taxRate * 100).toFixed(0)}%)</span>
                    <span className="font-semibold text-on-surface">${money(totals.taxAmount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm text-on-surface-variant">
                  <span>Subtotal</span>
                  <span className="font-semibold text-on-surface">${money(totals.subtotal)}</span>
                </div>
              )}
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm text-on-surface-variant">
                  <span>Descuento</span>
                  <span className="font-semibold">-${money(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline border-t border-outline-variant/20 pt-2.5 mt-1">
                <span className="text-sm font-semibold text-on-surface">Total a pagar</span>
                <span className="text-lg font-bold text-on-surface tabular-nums">${money(totals.total)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() =>
                requireShift(() => {
                  if (paymentMethod === "efectivo") {
                    setAmountTendered("");
                    setIsCashConfirmOpen(true);
                  } else {
                    handleCheckout();
                  }
                })
              }
              disabled={cart.length === 0 || submitting}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition-all ${
                cart.length === 0
                  ? "bg-surface-container-highest cursor-not-allowed opacity-70 text-on-surface-variant/50" 
                  : "bg-primary text-white hover:bg-primary-dim shadow-sm"
              }`}
            >
              {submitting ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>
                  <span>Vender</span>
                  <span>${money(totals.total)}</span>
                </>
              )}
            </button>
            <button
              onClick={() => {
                clearCart();
                // Sin ítems el panel no tiene nada que mostrar: se cierra y
                // devuelve al catálogo, que es donde sigue el trabajo.
                setIsCartOpen(false);
              }}
              disabled={cart.length === 0 || submitting}
              className="w-[52px] flex-shrink-0 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant/10 text-error hover:bg-error/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed py-3"
              aria-label="Limpiar venta"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-6 h-6">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
            <div className="relative group">
              <button
                onClick={() => setIsRecentSalesModalOpen(true)}
                className="w-[52px] flex-shrink-0 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant/10 text-on-surface hover:bg-surface-container-high transition-colors py-3"
                aria-label="Últimas ventas"
              >
                <IconReceipt className="w-6 h-6" />
              </button>
              <div className="absolute bottom-full right-0 mb-2 w-max opacity-0 scale-95 invisible group-hover:opacity-100 group-hover:scale-100 group-hover:visible transition-all duration-150 ease-out bg-inverse-surface text-inverse-on-surface text-xs font-medium py-1.5 px-2.5 rounded shadow-lg pointer-events-none z-50">
                Últimas ventas
                <div className="absolute top-full right-4 -mt-px border-4 border-transparent border-t-inverse-surface"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Renombrar la venta */}
      {renamingTabId && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setRenamingTabId(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              renameTab(renamingTabId, renameValue);
              setRenamingTabId(null);
            }}
            className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
          >
            <h2 className="text-lg font-bold text-on-surface">Renombrar venta</h2>
            <input
              autoFocus
              type="text"
              value={renameValue}
              maxLength={40}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Ej. Mesa 4, Juan, Pedido 12"
              /* text-base: por debajo de 16px iOS hace zoom al enfocar. */
              className="w-full h-12 bg-surface-container border border-outline-variant/20 rounded-xl px-4 text-base text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRenamingTabId(null)}
                className="flex-1 h-12 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!renameValue.trim()}
                className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dim transition-colors disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmación de cierre: la venta tiene ítems cargados. */}
      {closingTabId && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setClosingTabId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
          >
            <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">Eliminar esta venta</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                {(() => {
                  const target = tabs.find((t) => t.id === closingTabId);
                  const units = target?.cart.reduce((s, l) => s + l.quantity, 0) ?? 0;
                  return `«${target?.name}» tiene ${units} unidad${units !== 1 ? "es" : ""} cargada${units !== 1 ? "s" : ""}. Se pierden al eliminarla.`;
                })()}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setClosingTabId(null)}
                className="flex-1 h-12 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  removeTab(closingTabId);
                  setClosingTabId(null);
                }}
                className="flex-1 h-12 rounded-xl bg-error text-white text-sm font-semibold hover:bg-error/90 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
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

      {/* Turno de caja: gate bloqueante para empleados sin turno abierto */}
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

      {/* Modal Confirmación Pago en Efectivo */}
      {isCashConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsCashConfirmOpen(false)}>
          <div
            className="bg-surface-container-lowest rounded-[24px] w-full max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4 flex justify-between items-center border-b border-outline-variant/10">
              <h2 className="text-xl font-bold text-on-surface">Pago en efectivo</h2>
              <button
                onClick={() => setIsCashConfirmOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Total a pagar */}
              <div className="text-center">
                <p className="text-sm text-on-surface-variant mb-1">Total a pagar</p>
                <p className="text-3xl font-bold text-on-surface">${money(totals.total)}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-on-surface">Monto recibido ($)</label>
                <input
                  autoFocus
                  type="number"
                  step="100"
                  min="0"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-lg text-on-surface font-bold text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Botones de montos rápidos */}
              <div className="grid grid-cols-3 gap-2">
                {[2000, 5000, 10000, 20000, 50000, 100000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setAmountTendered((prev) => String((parseFloat(prev) || 0) + amount))}
                    className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
                  >
                    ${money(amount)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAmountTendered(String(totals.total))}
                  className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
                >
                  Valor exacto
                </button>
                <button
                  type="button"
                  onClick={() => setAmountTendered("")}
                  disabled={!amountTendered}
                  className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-error/30 hover:text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-outline-variant/20 disabled:hover:text-on-surface-variant"
                >
                  Limpiar
                </button>
              </div>

              {/* Cambio */}
              {(() => {
                const tendered = parseFloat(amountTendered) || 0;
                const change = tendered - totals.total;
                if (tendered > 0) {
                  return (
                    <div className={`flex justify-between items-center p-3 rounded-xl ${change >= 0 ? "bg-[#10b981]/5 border border-[#10b981]/20" : "bg-error/5 border border-error/20"}`}>
                      <span className="font-semibold text-sm text-on-surface-variant">Cambio</span>
                      <span className={`text-xl font-bold ${change >= 0 ? "text-[#10b981]" : "text-error"}`}>
                        {change >= 0 ? `$${money(change)}` : `Faltan $${money(Math.abs(change))}`}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsCashConfirmOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setIsCashConfirmOpen(false);
                    handleCheckout();
                  }}
                  disabled={(parseFloat(amountTendered) || 0) < totals.total || submitting}
                  className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    "Confirmar pago"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Venta Exitosa */}
      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsSuccessModalOpen(false)}>
          <div
            className="bg-surface-container-lowest rounded-[24px] w-full max-w-sm border border-outline-variant/10 shadow-2xl p-8 text-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-[#10b981]/10 text-[#10b981] rounded-full flex items-center justify-center mx-auto mb-6">
              <svg fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-on-surface mb-2">¡Venta exitosa!</h2>
            <p className="text-sm text-on-surface-variant mb-8">
              El pago se ha procesado correctamente. ¿Deseas imprimir el recibo de esta venta?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  window.print();
                  setIsSuccessModalOpen(false);
                }}
                className="w-full py-3 rounded-xl bg-[#6063ee] hover:bg-[#4f51c7] text-white font-bold transition-colors shadow-lg shadow-[#6063ee]/20 flex justify-center items-center gap-2"
              >
                <IconReceipt className="w-5 h-5" />
                Imprimir Recibo
              </button>
              <button
                onClick={() => setIsSuccessModalOpen(false)}
                className="w-full py-3 rounded-xl border border-outline-variant/30 hover:bg-surface-container-low text-on-surface font-semibold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      <PosReceipt data={receiptData} />
    </>
  );
}
