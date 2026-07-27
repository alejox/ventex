import { AlertTriangle } from "lucide-react";
import { IconThunder, IconTrash, IconReceipt } from "@/app/assets/icons/DashboardIcons";
import { Select } from "@/components/ui/Select";
import { TransferMethodSelector } from "@/components/TransferMethodSelector";
import { CardMethodSelector } from "@/components/CardMethodSelector";
import {
  cartLineKey,
  linePrice,
  lineUnits,
  type PaymentMethod,
  type CartLine,
  type CustomerOption,
  type SaleTotals,
  type StaffOption,
} from "@/services/pos.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PosCartPanelProps {
  cart: CartLine[];
  totals: SaleTotals;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  customerId: string | null;
  setCustomer: (id: string | null) => void;
  staffId: string | null;
  setStaff: (id: string | null) => void;
  customers: CustomerOption[];
  staff: StaffOption[];
  taxRate: number;
  includeTax: boolean;
  isTaxExempt: boolean;
  submitting: boolean;
  allowOversell: boolean;
  transferMethod: string | null;
  setTransferMethod: (id: string | null) => void;
  cardMethod: string | null;
  setCardMethod: (id: string | null) => void;
  transferMethodsEnabled: string[] | undefined;
  cardMethodsEnabled: string[] | undefined;
  paymentOptions: { value: PaymentMethod; label: string }[];
  asksCardMethod: boolean;
  asksTransferMethod: boolean;
  cartUnits: number;
  isCartOpen: boolean;
  setIsCartOpen: (v: boolean) => void;
  setLineKind: (key: string, kind: "unit" | "package") => void;
  setLineStaff: (key: string, staffId: string | null) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  setQuantity: (key: string, v: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  onCheckout: () => void;
  onOpenDiscountModal: () => void;
  onOpenSaleConfigModal: () => void;
  onOpenRecentSalesModal: () => void;
  onOpenCustomerModal: () => void;
  requireShift: (action: () => void) => void;
  splitsCount: number;
  isDelivery: boolean;
  setDelivery: (enabled: boolean) => void;
}

export function PosCartPanel({
  cart,
  totals,
  paymentMethod,
  setPaymentMethod,
  customerId,
  setCustomer,
  staffId,
  setStaff,
  customers,
  staff,
  taxRate,
  includeTax,
  isTaxExempt,
  submitting,
  allowOversell,
  transferMethod,
  setTransferMethod,
  cardMethod,
  setCardMethod,
  transferMethodsEnabled,
  cardMethodsEnabled,
  paymentOptions,
  asksCardMethod,
  asksTransferMethod,
  cartUnits,
  isCartOpen,
  setIsCartOpen,
  setLineKind,
  setLineStaff,
  increment,
  decrement,
  setQuantity,
  removeFromCart,
  clearCart,
  onCheckout,
  onOpenDiscountModal,
  onOpenSaleConfigModal,
  onOpenRecentSalesModal,
  onOpenCustomerModal,
  requireShift,
  splitsCount,
  isDelivery,
  setDelivery,
}: PosCartPanelProps) {
  return (
    <>
      {isCartOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[480px] shadow-2xl transition-transform duration-300 ease-out
          lg:static lg:z-auto lg:w-[480px] lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none
          bg-surface-container-lowest flex flex-col h-full shrink-0 border-l border-outline-variant/10
          ${isCartOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden lg:flex lg:flex-col">

          <div className="shrink-0 p-5 border-b border-outline-variant/10 space-y-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pt-6">
            <div className="flex justify-between items-center gap-2">
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2 min-w-0">
                <span className="truncate">Factura de venta</span>
                <div className="w-6 h-6 shrink-0 rounded-full bg-[#6063ee]/10 flex items-center justify-center text-[#6063ee]">
                  <IconThunder className="w-3.5 h-3.5" />
                </div>
              </h2>
              <div className="flex items-center gap-3 text-on-surface-variant shrink-0">
                <button onClick={onOpenDiscountModal} className="hover:text-primary" title="Descuentos globales">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </button>
                <button onClick={() => requireShift(() => window.print())} className="hover:text-primary" title="Imprimir">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                </button>
                <button onClick={onOpenSaleConfigModal} className="hover:text-primary" title="Configuración">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                    <line x1="4" y1="21" x2="4" y2="14"/>
                    <line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/>
                    <line x1="20" y1="12" x2="20" y2="3"/>
                    <line x1="1" y1="14" x2="7" y2="14"/>
                    <line x1="9" y1="8" x2="15" y2="8"/>
                    <line x1="17" y1="16" x2="23" y2="16"/>
                  </svg>
                </button>
                <button
                  onClick={() => setIsCartOpen(false)}
                  aria-label="Cerrar factura"
                  className="lg:hidden -mr-1.5 w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high hover:text-on-surface transition-colors"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Método de pago"
                size="sm"
                value={paymentMethod}
                onChange={(e) => {
                  const newMethod = e.target.value as PaymentMethod;
                  setPaymentMethod(newMethod);
                  if (newMethod === "transferencia" && !transferMethod) {
                    setTransferMethod(transferMethodsEnabled?.[0] ?? null);
                  }
                  if (newMethod === "tarjeta" && !cardMethod) {
                    setCardMethod(cardMethodsEnabled?.[0] ?? null);
                  }
                }}
              >
                {paymentOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>

              <div className="flex gap-2 items-end">
                <Select
                  label="Cliente"
                  size="sm"
                  containerClassName="flex-1 min-w-0"
                  value={customerId ?? ""}
                  onChange={(e) => setCustomer(e.target.value || null)}
                >
                  <option value="">Consumidor final (22222222222)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                      {c.tax_exempt ? " (exento)" : ""}
                    </option>
                  ))}
                </Select>
                <button
                  onClick={onOpenCustomerModal}
                  aria-label="Nuevo cliente"
                  className="h-9 w-10 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </button>
              </div>
            </div>

            {paymentMethod === "transferencia" && asksTransferMethod && (
              <TransferMethodSelector
                enabledMethods={transferMethodsEnabled}
                selectedMethod={transferMethod ?? transferMethodsEnabled?.[0] ?? "nequi"}
                onSelect={(id) => setTransferMethod(id)}
              />
            )}

            {paymentMethod === "tarjeta" && asksCardMethod && (
              <CardMethodSelector
                enabledMethods={cardMethodsEnabled}
                selectedMethod={cardMethod ?? cardMethodsEnabled?.[0] ?? "bold"}
                onSelect={(id) => setCardMethod(id)}
              />
            )}

            {/* Domicilio toggle */}
            {totals.total > 0 && (
              <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDelivery}
                  onClick={() => setDelivery(!isDelivery)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    isDelivery ? "bg-[#6063ee]" : "bg-outline-variant/30"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isDelivery ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
                <span className="text-sm text-on-surface">Es domicilio</span>
              </label>
            )}

            {/* Split payment indicator */}
            {splitsCount > 0 && totals.total > 0 && (
              <div className="flex items-center gap-2 py-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20" />
                  </svg>
                  Pago dividido ({splitsCount} método{splitsCount !== 1 ? "s" : ""})
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  Se configura al confirmar la venta
                </span>
              </div>
            )}

            {staff.length > 0 && (
              <Select
                label="Atendido por"
                size="sm"
                value={staffId ?? ""}
                onChange={(e) => setStaff(e.target.value || null)}
              >
                <option value="">&mdash;</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </Select>
            )}
          </div>

          <div className="min-h-[9rem] lg:flex-1 lg:min-h-0 lg:overflow-y-auto p-5 space-y-4">
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
              <>
                <div className="space-y-1">
                {cart.map((line) => (
                  <div key={cartLineKey(line)} className={`group flex items-center gap-2 py-1.5 px-1.5 -mx-1 rounded-lg hover:bg-surface-container-low transition-colors ${line.item.kind === "service" ? "border-l-2 border-emerald-500/60 pl-2.5" : ""}`}>
                    <div className="flex items-center shrink-0">
                      <button
                        onClick={() => decrement(cartLineKey(line))}
                        className="w-5 h-5 flex items-center justify-center rounded text-on-surface-variant/60 hover:text-on-surface transition-colors text-xs"
                      >
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" d="M5 12h14" /></svg>
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={allowOversell ? undefined : line.item.stock_level ?? undefined}
                        value={line.quantity}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) setQuantity(cartLineKey(line), v);
                        }}
                        className="w-8 text-center text-xs font-semibold text-on-surface bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => increment(cartLineKey(line))}
                        disabled={
                          !allowOversell &&
                          line.item.kind === "product" &&
                          line.item.stock_level != null &&
                          line.quantity >= line.item.stock_level
                        }
                        className="w-5 h-5 flex items-center justify-center rounded text-on-surface-variant/60 hover:text-on-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                      >
                        <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-on-surface truncate block">{line.item.name}</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        {line.item.kind === "service" ? (
                          <span className="text-[9px] text-emerald-500 font-medium">Servicio</span>
                        ) : line.unitKind === "package" ? (
                          <span className="text-[9px] text-primary font-medium">Caja &times;{line.item.units_per_package}</span>
                        ) : (
                          <span className="text-[9px] text-on-surface-variant/50">{line.item.sku}</span>
                        )}
                        {(line.discountAmount ?? 0) > 0 && (
                          <span className="text-[9px] text-error font-medium">-{money(line.discountAmount!)}</span>
                        )}
                        {line.item.kind === "product" &&
                          line.item.stock_level != null &&
                          line.quantity * lineUnits(line) > line.item.stock_level && (
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                      </div>
                    </div>

                    <span className="text-xs font-bold text-on-surface tabular-nums shrink-0">${money(linePrice(line) * line.quantity)}</span>

                    <button
                      onClick={() => removeFromCart(cartLineKey(line))}
                      className="shrink-0 w-4 h-4 flex items-center justify-center text-on-surface-variant/30 hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Quitar &iacute;tem"
                    >
                      <IconTrash className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {cart.some((l) => l.item.kind === "product" && l.item.package_price != null) && (
                <div className="space-y-1.5 pt-1 border-t border-outline-variant/10">
                  {cart
                    .filter((l) => l.item.kind === "product" && l.item.package_price != null)
                    .map((line) => (
                      <div key={`pkg-${cartLineKey(line)}`} className="flex gap-1 p-0.5 rounded-lg bg-surface-container-lowest border border-outline-variant/15">
                        {([
                          { kind: "unit" as const, label: "Unidad", price: line.item.price },
                          { kind: "package" as const, label: `Caja &times;${line.item.units_per_package}`, price: line.item.package_price },
                        ]).map((opt) => {
                          const active = (line.unitKind ?? "unit") === opt.kind;
                          return (
                            <button
                              key={opt.kind}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setLineKind(cartLineKey(line), opt.kind)}
                              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition-colors ${
                                active
                                  ? "bg-primary text-on-primary"
                                  : "text-on-surface-variant hover:bg-surface-container"
                              }`}
                            >
                              {opt.label} &middot; ${money(opt.price ?? 0)}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                </div>
              )}

              {cart.some((l) => (l.item.kind === "service" || l.item.has_commission) && staff.length > 0) && (
                <div className="space-y-1.5 pt-1 border-t border-outline-variant/10">
                  {cart
                    .filter((l) => (l.item.kind === "service" || l.item.has_commission) && staff.length > 0)
                    .map((line) => (
                      <div key={`stf-${cartLineKey(line)}`} className="flex items-center gap-2">
                        <span className="text-[10px] text-on-surface-variant shrink-0 truncate max-w-[80px]">{line.item.name}</span>
                        <Select
                          size="sm"
                          value={line.staffId ?? ""}
                          onChange={(e) => setLineStaff(cartLineKey(line), e.target.value || null)}
                        >
                          <option value="">&mdash;</option>
                          {staff.map((m) => (
                            <option key={m.id} value={m.id}>{m.full_name}</option>
                          ))}
                        </Select>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-container-lowest mt-auto shrink-0 border-t border-outline-variant/10 lg:border-t-0">
          {cart.length > 0 && (
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-semibold text-on-surface-variant">
                {cart.length} ítem{cart.length !== 1 ? "s" : ""} &middot; {cartUnits} unidad{cartUnits !== 1 ? "es" : ""}
              </span>
            </div>
          )}

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
              onClick={onCheckout}
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
                onClick={onOpenRecentSalesModal}
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
    </>
  );
}
