"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { IconSearch } from "@/app/assets/icons/DashboardIcons";
import { usePosStore } from "@/stores/pos.store";
import {
  computeTotals,
  type PaymentMethod,
  type CartLine,
  type CustomerOption,
  type SaleTotals,
} from "@/services/pos.service";
import { ProductModal } from "@/components/ProductModal";
import { CustomerModal } from "@/components/CustomerModal";
import { PosReceipt } from "@/components/PosReceipt";
import { RecentSalesModal } from "@/components/RecentSalesModal";
import { DiscountModal } from "@/components/DiscountModal";
import { SaleConfigModal } from "@/components/SaleConfigModal";

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

  const init = usePosStore((s) => s.init);
  const addTab = usePosStore((s) => s.addTab);
  const setActiveTab = usePosStore((s) => s.setActiveTab);
  const removeTab = usePosStore((s) => s.removeTab);

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
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isRecentSalesModalOpen, setIsRecentSalesModalOpen] = useState(false);
  const [isSaleConfigModalOpen, setIsSaleConfigModalOpen] = useState(false);
  const [isCashConfirmOpen, setIsCashConfirmOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [amountTendered, setAmountTendered] = useState("");
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

  // Use refs for keyboard handler to avoid stale closures
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;
  const paymentMethodRef = useRef(paymentMethod);
  paymentMethodRef.current = paymentMethod;
  const amountTenderedRef = useRef(amountTendered);
  amountTenderedRef.current = amountTendered;
  const isProductModalOpenRef = useRef(isProductModalOpen);
  isProductModalOpenRef.current = isProductModalOpen;
  const isCustomerModalOpenRef = useRef(isCustomerModalOpen);
  isCustomerModalOpenRef.current = isCustomerModalOpen;
  const isDiscountModalOpenRef = useRef(isDiscountModalOpen);
  isDiscountModalOpenRef.current = isDiscountModalOpen;
  const isRecentSalesModalOpenRef = useRef(isRecentSalesModalOpen);
  isRecentSalesModalOpenRef.current = isRecentSalesModalOpen;
  const isSaleConfigModalOpenRef = useRef(isSaleConfigModalOpen);
  isSaleConfigModalOpenRef.current = isSaleConfigModalOpen;
  const isSuccessModalOpenRef = useRef(isSuccessModalOpen);
  isSuccessModalOpenRef.current = isSuccessModalOpen;
  const isCashConfirmOpenRef = useRef(isCashConfirmOpen);
  isCashConfirmOpenRef.current = isCashConfirmOpen;
  const totalsRef = useRef<SaleTotals>(null!);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsProductModalOpen(false);
        setIsCustomerModalOpen(false);
        setIsDiscountModalOpen(false);
        setIsRecentSalesModalOpen(false);
        setIsSaleConfigModalOpen(false);
        setIsSuccessModalOpen(false);
        setIsCashConfirmOpen(false);
      }
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
        const anyModal = isProductModalOpenRef.current || isCustomerModalOpenRef.current || isDiscountModalOpenRef.current || isRecentSalesModalOpenRef.current || isSaleConfigModalOpenRef.current || isSuccessModalOpenRef.current || isCashConfirmOpenRef.current;
        if (!anyModal && cartRef.current.length > 0 && !submittingRef.current) {
          if (paymentMethodRef.current === "efectivo") {
            setAmountTendered("");
            setIsCashConfirmOpen(true);
          } else {
            handleCheckout();
          }
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

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const totals = useMemo(
    () => computeTotals(cart, includeTax ? taxRate : 0, selectedCustomer?.tax_exempt ?? false),
    [cart, taxRate, includeTax, selectedCustomer],
  );
  totalsRef.current = totals;

  const handleCheckout = async () => {
    const realTotals = computeTotals(cart, taxRate, selectedCustomer?.tax_exempt ?? false);
    const data: ReceiptData = {
      items: cart.map((l) => ({
        name: l.item.name,
        sku: l.item.sku,
        quantity: l.quantity,
        price: l.item.price,
        total: l.item.price * l.quantity,
      })),
      customer: selectedCustomer,
      totals: realTotals,
      paymentMethod,
      date: new Date(),
    };
    setReceiptData(data);
    const ok = await checkout();
    if (ok) {
      setSearch("");
      setActiveCategory("Todos");
      setAmountTendered("");
      setIsSuccessModalOpen(true);
    }
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row h-[calc(100vh-5rem)] -m-6 lg:-m-10 bg-background relative overflow-hidden print:hidden">
      
      {/* Columna Izquierda: Catálogo + Tabs */}
      <div className="flex-1 flex flex-col min-w-0 px-6 lg:pl-10 lg:pr-6 border-r border-outline-variant/10">
        
        <div className="flex items-center gap-3 mb-6 pt-4">
          <div className="relative flex-1">
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-primary rounded-l-2xl flex items-center justify-center">
              <IconSearch className="w-5 h-5 text-white" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar productos"
              ref={(el) => { if (el) searchRef.current = el; }}
              className="w-full bg-surface-container-lowest rounded-2xl py-3.5 pl-14 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant border border-outline-variant/30 shadow-sm"
            />
          </div>
          <button
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            className="w-12 h-12 rounded-2xl border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-center shrink-0"
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
          <button
            onClick={() => setIsProductModalOpen(true)}
            className="whitespace-nowrap px-5 py-3.5 rounded-2xl bg-transparent border border-primary/50 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center gap-2"
          >
            Nuevo producto
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
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
        <div className="flex-1 overflow-y-auto pb-6 pr-2">
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
          ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={item.kind === "product" && (item.stock_level ?? 0) <= 0}
                    className={`text-left rounded-2xl p-3 border flex flex-col transition-colors group shadow-sm disabled:opacity-50 disabled:cursor-not-allowed relative ${
                      item.kind === "service"
                        ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-400/40 disabled:hover:border-emerald-500/20"
                        : "bg-surface-container border-outline-variant/10 hover:border-primary/30 disabled:hover:border-outline-variant/10"
                    }`}
                  >
                    {item.kind === "product" && (item.stock_level ?? 0) <= 0 && (
                      <div className="absolute inset-0 rounded-2xl bg-surface-container-lowest/60 flex items-center justify-center z-10">
                        <span className="bg-error/10 text-error-dim text-xs font-bold px-3 py-1.5 rounded-lg border border-error/20">
                          Sin Stock
                        </span>
                      </div>
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
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-on-surface font-bold">${money(item.price)}</span>
                      {item.kind === "service" ? (
                        <span className="text-[10px] font-bold text-on-surface-variant">Servicio</span>
                      ) : (
                        <span
                          className={`text-[10px] font-bold ${
                            (item.stock_level ?? 0) <= 0
                              ? "text-error"
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
                    disabled={item.kind === "product" && (item.stock_level ?? 0) <= 0}
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
                              ? "text-error"
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

        {/* Tab Bar Inferior (Nuevas Vistas/Ventas Concurrentes) */}
        <div className="bg-surface-container-low mt-auto -mx-6 lg:-ml-10 lg:-mr-6 px-6 lg:pl-10 lg:pr-6 py-2 flex items-end gap-1 border-t border-outline-variant/20 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`group flex items-center gap-3 px-4 py-2.5 min-w-[140px] max-w-[200px] cursor-pointer transition-all border-b-2 ${
                t.id === activeTabId 
                  ? "bg-surface-container-lowest border-primary text-primary font-semibold" 
                  : "bg-transparent border-transparent text-on-surface-variant hover:bg-surface-container-high/50"
              }`}
            >
              <div className="w-5 h-5 rounded bg-surface-container flex items-center justify-center shrink-0">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <span className="text-xs truncate flex-1">{t.name}</span>
              {tabs.length > 1 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); removeTab(t.id); }}
                  className="w-4 h-4 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:text-error transition-all"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={addTab}
            className="w-10 h-10 ml-2 flex flex-col items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Orden actual / Factura de Venta */}
      <div className="w-full lg:w-[420px] bg-surface-container-lowest flex flex-col h-full shrink-0 border-l border-outline-variant/10">
        
        {/* Top bar de Factura */}
        <div className="p-5 border-b border-outline-variant/10 space-y-4 pt-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
              Factura de venta
              <div className="w-6 h-6 rounded-full bg-[#6063ee]/10 flex items-center justify-center text-[#6063ee]">
                <IconThunder className="w-3.5 h-3.5" />
              </div>
            </h2>
            <div className="flex items-center gap-3 text-on-surface-variant">
               {/* Iconos visuales superiores */}
               <button onClick={() => setIsDiscountModalOpen(true)} className="hover:text-primary" title="Descuentos globales"><IconDiscount className="w-5 h-5" /></button>
               <button onClick={() => window.print()} className="hover:text-primary" title="Imprimir"><svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
               <button onClick={() => setIsSaleConfigModalOpen(true)} className="hover:text-primary" title="Configuración"><svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></button>
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
                {line.item.kind === "service" && staff.length > 0 && (
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
                      max={line.item.stock_level ?? undefined}
                      value={line.quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v)) setQuantity(line.item.id, v);
                      }}
                      className="w-12 text-center text-xs font-medium text-on-surface bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => increment(line.item.id)}
                      disabled={
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
        <div className="p-4 bg-surface-container-lowest mt-auto">
          {/* Contador de productos */}
          {cart.length > 0 && (
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-semibold text-on-surface-variant">
                {cart.length} ítem{cart.length !== 1 ? "s" : ""} · {cart.reduce((s, l) => s + l.quantity, 0)} unidad{cart.reduce((s, l) => s + l.quantity, 0) !== 1 ? "es" : ""}
              </span>
            </div>
          )}

          {/* Resumen de totales */}
          {cart.length > 0 && (
            <div className="space-y-2 mb-4 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/10">
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>Subtotal (base)</span>
                <span className="font-semibold text-on-surface">${money(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>IVA ({includeTax ? (taxRate * 100).toFixed(0) : 0}%)</span>
                <span className="font-semibold text-on-surface">${money(totals.taxAmount)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm text-on-surface-variant">
                  <span>Descuento</span>
                  <span className="font-semibold">-${money(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-on-surface-variant border-t border-outline-variant/20 pt-2">
                <span>Total</span>
                <span className="font-bold text-on-surface">${money(totals.total)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (paymentMethod === "efectivo") {
                  setAmountTendered("");
                  setIsCashConfirmOpen(true);
                } else {
                  handleCheckout();
                }
              }}
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
              onClick={clearCart}
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

      {/* Modales */}
      {isProductModalOpen && <ProductModal onClose={() => setIsProductModalOpen(false)} />}
      {isCustomerModalOpen && <CustomerModal onClose={() => setIsCustomerModalOpen(false)} />}
      {isDiscountModalOpen && <DiscountModal onClose={() => setIsDiscountModalOpen(false)} />}
      {isRecentSalesModalOpen && <RecentSalesModal onClose={() => setIsRecentSalesModalOpen(false)} />}
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
                {[20000, 50000, 100000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setAmountTendered(String(amount))}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      parseFloat(amountTendered) === amount
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface"
                    }`}
                  >
                    ${money(amount)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmountTendered(String(Math.ceil(totals.total / 1000) * 1000))}
                  className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
                >
                  Exacto
                </button>
                <button
                  type="button"
                  onClick={() => setAmountTendered(String(Math.ceil((totals.total + 1000) / 1000) * 1000))}
                  className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
                >
                  + $1k
                </button>
                <button
                  type="button"
                  onClick={() => setAmountTendered(String(Math.ceil((totals.total + 5000) / 1000) * 1000))}
                  className="py-2.5 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
                >
                  + $5k
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
