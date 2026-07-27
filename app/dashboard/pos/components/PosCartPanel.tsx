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
  type PaymentSplit,
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
  splits: PaymentSplit[];
  addSplit: () => void;
  removeSplit: (index: number) => void;
  updateSplitAmount: (index: number, amount: number) => void;
  updateSplitMethod: (index: number, method: PaymentMethod, transferMethod?: string | null, cardMethod?: string | null) => void;
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
  splits,
  addSplit,
  removeSplit,
  updateSplitAmount,
  updateSplitMethod,
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
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[420px] shadow-2xl transition-transform duration-300 ease-out
          lg:static lg:z-auto lg:w-[420px] lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none
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
              <Select label="Lista de precio" size="sm" defaultValue="general">
                <option value="general">General</option>
              </Select>
              <Select label="Numeración" size="sm" defaultValue="principal">
                <option value="principal">Principal</option>
              </Select>
            </div>

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

            {/* Split payment */}
            <div className="space-y-2">
              {splits.length === 0 && totals.total > 0 && (
                <button
                  type="button"
                  onClick={addSplit}
                  className="w-full py-2 rounded-lg text-xs font-semibold border border-dashed border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:border-outline-variant hover:bg-surface-container transition-colors"
                >
                  + Dividir pago en varios métodos
                </button>
              )}

              {splits.length > 0 && (
                <div className="space-y-2 p-3 rounded-xl bg-surface-container border border-outline-variant/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface">Pago dividido</span>
                    <button
                      type="button"
                      onClick={addSplit}
                      className="text-xs text-primary hover:text-primary-dim transition-colors font-medium"
                    >
                      + Agregar
                    </button>
                  </div>

                  {splits.map((sp, i) => {
                    const isLast = i === splits.length - 1;
                    const othersSum = splits.reduce((s, x, j) => s + (j !== i ? x.amount : 0), 0);
                    const remaining = Math.max(0, totals.total - othersSum);

                    return (
                      <div key={i} className="flex items-center gap-2">
                        <Select
                          size="sm"
                          containerClassName="w-[110px] shrink-0"
                          value={sp.payment_method}
                          onChange={(e) => {
                            const method = e.target.value as PaymentMethod;
                            let tm: string | null = null;
                            let cm: string | null = null;
                            if (method === "transferencia") tm = transferMethodsEnabled?.[0] ?? null;
                            if (method === "tarjeta") cm = cardMethodsEnabled?.[0] ?? null;
                            updateSplitMethod(i, method, tm, cm);
                          }}
                        >
                          {paymentOptions.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </Select>

                        <div className="relative flex-1 min-w-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={sp.amount || ""}
                            onChange={(e) => updateSplitAmount(i, parseFloat(e.target.value) || 0)}
                            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-1.5 pl-5 pr-2 text-xs text-on-surface focus:outline-none focus:border-primary transition-all"
                            placeholder={isLast && remaining > 0 ? remaining.toFixed(0) : "0"}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeSplit(i)}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-on-surface-variant/60 hover:text-error transition-colors"
                        >
                          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}

                  {(() => {
                    const paid = splits.reduce((s, sp) => s + sp.amount, 0);
                    const remaining = totals.total - paid;
                    return (
                      <div className="flex justify-between items-center pt-1 border-t border-outline-variant/10">
                        <span className="text-[11px] text-on-surface-variant">
                          Pagado: ${money(paid)} / ${money(totals.total)}
                        </span>
                        {remaining > 0.01 && (
                          <span className="text-[11px] font-semibold text-error">
                            Restan ${money(remaining)}
                          </span>
                        )}
                        {Math.abs(remaining) <= 0.01 && (
                          <span className="text-[11px] font-semibold text-success">Completo ✓</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

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
              </button>            </div>

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
              cart.map((line) => (
                <div key={cartLineKey(line)} className={`flex flex-col gap-2 rounded-xl p-2 ${line.item.kind === "service" ? "bg-emerald-500/5 border border-emerald-500/10" : ""}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-medium text-on-surface line-clamp-1">{line.item.name}</h4>
                        <p className="text-[10px] mt-0.5 uppercase tracking-wide font-semibold">
                          {line.item.kind === "service" ? (
                            <span className="text-emerald-500">Servicio</span>
                          ) : line.unitKind === "package" ? (
                            <span className="text-primary">
                              {line.quantity * lineUnits(line)} unidades en total
                            </span>
                          ) : (
                            <span className="text-on-surface-variant">SKU: {line.item.sku}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-on-surface">
                          ${money(linePrice(line) * line.quantity)}
                        </p>
                        {(line.discountAmount ?? 0) > 0 && (
                          <p className="text-xs font-medium text-error">
                            -{money(line.discountAmount!)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {line.item.kind === "product" && line.item.package_price != null && (
                    <div className="flex gap-1 p-0.5 rounded-lg bg-surface-container-lowest border border-outline-variant/15">
                      {([
                        { kind: "unit" as const, label: "Unidad", price: line.item.price },
                        { kind: "package" as const, label: `Caja ×${line.item.units_per_package}`, price: line.item.package_price },
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
                            {opt.label} &middot; ${money(opt.price)}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {line.item.kind === "product" &&
                    line.item.stock_level != null &&
                    line.quantity * lineUnits(line) > line.item.stock_level && (
                      <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Sin stock: quedan {line.item.stock_level} y se venden{" "}
                        {line.quantity * lineUnits(line)}.
                      </p>
                    )}

                  {(line.item.kind === "service" || line.item.has_commission) && staff.length > 0 && (
                    <Select
                      size="sm"
                      value={line.staffId ?? ""}
                      onChange={(e) => setLineStaff(cartLineKey(line), e.target.value || null)}
                    >
                      <option value="">Atendido por &mdash;</option>
                      {staff.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name}</option>
                      ))}
                    </Select>
                  )}

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center border border-outline-variant/20 rounded-lg overflow-hidden bg-surface-container-lowest">
                      <button
                        onClick={() => decrement(cartLineKey(line))}
                        className="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-lg"
                      >
                        &minus;
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
                        className="w-12 text-center text-xs font-medium text-on-surface bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => increment(cartLineKey(line))}
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
                      onClick={() => removeFromCart(cartLineKey(line))}
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
