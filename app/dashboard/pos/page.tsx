"use client";

import { useEffect, useMemo, useState } from "react";
import { IconSearch } from "@/app/assets/icons/DashboardIcons";
import { usePosStore } from "@/stores/pos.store";
import { computeTotals, type PaymentMethod } from "@/services/pos.service";

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

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
];

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function POSPage() {
  // Datos y acciones desde el store (component → store → services).
  const catalog = usePosStore((s) => s.catalog);
  const customers = usePosStore((s) => s.customers);
  const taxRate = usePosStore((s) => s.taxRate);
  const loading = usePosStore((s) => s.loading);
  const error = usePosStore((s) => s.error);
  const cart = usePosStore((s) => s.cart);
  const customerId = usePosStore((s) => s.customerId);
  const discount = usePosStore((s) => s.discount);
  const paymentMethod = usePosStore((s) => s.paymentMethod);
  const submitting = usePosStore((s) => s.submitting);

  const init = usePosStore((s) => s.init);
  const addToCart = usePosStore((s) => s.addToCart);
  const increment = usePosStore((s) => s.increment);
  const decrement = usePosStore((s) => s.decrement);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const setDiscount = usePosStore((s) => s.setDiscount);
  const setPaymentMethod = usePosStore((s) => s.setPaymentMethod);
  const clearCart = usePosStore((s) => s.clearCart);
  const checkout = usePosStore((s) => s.checkout);

  // Estado solo-UI (filtros) en local.
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");

  useEffect(() => {
    init();
  }, [init]);

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const p of catalog) if (p.category_name) names.add(p.category_name);
    return ["Todos", ...Array.from(names).sort()];
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((p) => {
      const matchesCategory = activeCategory === "Todos" || p.category_name === activeCategory;
      const matchesSearch =
        !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [catalog, search, activeCategory]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const totals = useMemo(
    () => computeTotals(cart, taxRate, selectedCustomer?.tax_exempt ?? false, discount),
    [cart, taxRate, selectedCustomer, discount],
  );

  const effectiveRatePct = Math.round((selectedCustomer?.tax_exempt ? 0 : taxRate) * 100);

  const handleCheckout = async () => {
    const ok = await checkout();
    if (ok) {
      setSearch("");
      setActiveCategory("Todos");
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)] -mt-4">
      {/* Catálogo */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative mb-6">
          <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full bg-surface-container rounded-2xl py-3.5 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 border border-outline-variant/10 shadow-sm"
          />
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
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="text-left bg-surface-container rounded-2xl p-3 border border-outline-variant/10 flex flex-col hover:border-primary/30 transition-colors group shadow-sm"
                >
                  <div className="aspect-square rounded-xl bg-surface-container-lowest flex items-center justify-center mb-3 group-hover:bg-surface-container-low transition-colors">
                    <IconImagePlaceholder className="w-8 h-8 text-on-surface-variant/30" />
                  </div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    {item.kind === "service" ? "Servicio" : `SKU: ${item.sku}`}
                  </p>
                  <h3 className="text-sm font-medium text-on-surface mb-2 line-clamp-2 leading-tight flex-1 group-hover:text-primary transition-colors">
                    {item.name}
                  </h3>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-[#6063ee] font-bold">${money(item.price)}</span>
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
          )}
        </div>
      </div>

      {/* Orden actual */}
      <div className="w-full lg:w-[380px] bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm flex flex-col h-full overflow-hidden shrink-0">
        <div className="p-5 border-b border-outline-variant/10 space-y-3">
          <h2 className="text-lg font-bold text-on-surface">Orden Actual</h2>
          <select
            value={customerId ?? ""}
            onChange={(e) => setCustomer(e.target.value || null)}
            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary appearance-none"
          >
            <option value="">Cliente: De Paso</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.tax_exempt ? " (exento)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Líneas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {cart.length === 0 ? (
            <p className="text-center text-sm text-on-surface-variant py-8">
              Toca un producto o servicio para agregarlo a la orden.
            </p>
          ) : (
            cart.map((line) => (
              <div key={line.item.id} className="flex flex-col gap-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="text-sm font-medium text-on-surface line-clamp-1">{line.item.name}</h4>
                    <p className="text-[10px] text-on-surface-variant mt-0.5 uppercase tracking-wide">
                      {line.item.kind === "service" ? "Servicio" : `SKU: ${line.item.sku}`}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-on-surface shrink-0">
                    ${money(line.item.price * line.quantity)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center border border-outline-variant/20 rounded-lg overflow-hidden bg-surface-container-lowest">
                    <button
                      onClick={() => decrement(line.item.id)}
                      className="w-8 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-xs font-medium text-on-surface">{line.quantity}</span>
                    <button
                      onClick={() => increment(line.item.id)}
                      className="w-8 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
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

        {/* Resumen */}
        <div className="p-5 border-t border-outline-variant/10 bg-surface-container-lowest mt-auto">
          <div className="flex items-center gap-2 mb-4">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPaymentMethod(m.value)}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors border ${
                  paymentMethod === m.value
                    ? "bg-[#6063ee] text-white border-transparent"
                    : "bg-surface-container border-outline-variant/20 text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="text-on-surface font-medium">${money(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Impuesto ({effectiveRatePct}%)</span>
              <span className="text-on-surface font-medium">${money(totals.taxAmount)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-on-surface-variant">Descuento</span>
              <div className="flex items-center gap-1">
                <span className="text-on-surface-variant">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount || ""}
                  onChange={(e) => setDiscount(parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="w-20 bg-surface-container border border-outline-variant/20 rounded-lg px-2 py-1 text-right text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mb-6 pt-4 border-t border-outline-variant/10">
            <span className="text-lg font-bold text-on-surface">Total</span>
            <span className="text-3xl font-black text-[#6063ee]">${money(totals.total)}</span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || submitting}
            className="w-full bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] font-bold rounded-xl py-3.5 mb-3 transition-colors shadow-lg shadow-[#6063ee]/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Procesando…" : "Proceder al Pago"}
          </button>

          <button
            onClick={clearCart}
            disabled={cart.length === 0 || submitting}
            className="w-full bg-error-container/20 border border-error-container/30 hover:bg-error-container/40 text-error-dim text-sm font-semibold rounded-xl py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar Orden
          </button>
        </div>
      </div>
    </div>
  );
}
