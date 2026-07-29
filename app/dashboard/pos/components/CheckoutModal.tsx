"use client";

import { useEffect, useCallback } from "react";
import { Select } from "@/components/ui/Select";
import { COLOMBIA_TRANSFER_METHODS } from "@/config/transferMethods";
import { COLOMBIA_CARD_METHODS } from "@/config/cardMethods";
import type { PaymentMethod, PaymentSplit, SaleTotals, CartLine } from "@/services/pos.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000, 50000, 100000];

/** Chips de canal (Nequi, Bold…) para una línea del pago dividido. */
function SplitChannelChips({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { id: string; shortName: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="pl-[118px] pr-8 -mt-1 space-y-1">
      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const isSelected = selected === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                isSelected
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-surface-container-low border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40 hover:text-on-surface"
              }`}
            >
              {o.shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface CheckoutModalProps {
  totals: SaleTotals;
  cart: CartLine[];
  paymentMethod: PaymentMethod;
  paymentOptions: { value: PaymentMethod; label: string }[];
  splits: PaymentSplit[];
  addSplit: () => void;
  removeSplit: (index: number) => void;
  updateSplitAmount: (index: number, amount: number) => void;
  updateSplitMethod: (index: number, method: PaymentMethod, transferMethod?: string | null, cardMethod?: string | null) => void;
  transferMethodsEnabled: string[] | undefined;
  cardMethodsEnabled: string[] | undefined;
  asksCardMethod: boolean;
  asksTransferMethod: boolean;
  submitting: boolean;
  amountTendered: string;
  setAmountTendered: (v: string | ((prev: string) => string)) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function CheckoutModal({
  totals,
  cart,
  paymentMethod,
  paymentOptions,
  splits,
  addSplit,
  removeSplit,
  updateSplitAmount,
  updateSplitMethod,
  transferMethodsEnabled,
  cardMethodsEnabled,
  asksCardMethod,
  asksTransferMethod,
  submitting,
  amountTendered,
  setAmountTendered,
  onConfirm,
  onClose,
}: CheckoutModalProps) {
  const paymentLabel = (m: PaymentMethod) =>
    paymentOptions.find((p) => p.value === m)?.label ?? m;

  const cartUnits = cart.reduce((sum, l) => sum + l.quantity, 0);

  const hasSplits = splits.length > 0;
  const hasCash = !hasSplits && paymentMethod === "efectivo";

  const transferOptions = COLOMBIA_TRANSFER_METHODS.filter((m) =>
    transferMethodsEnabled ? transferMethodsEnabled.includes(m.id) : true,
  );
  const cardOptions = COLOMBIA_CARD_METHODS.filter((m) =>
    cardMethodsEnabled ? cardMethodsEnabled.includes(m.id) : true,
  );

  const tendered = parseFloat(amountTendered) || 0;
  const change = tendered - totals.total;

  const splitsSum = splits.reduce((s, sp) => s + sp.amount, 0);
  const splitsMatch = Math.abs(splitsSum - totals.total) <= 0.01;

  const canConfirm =
    !submitting &&
    (hasCash ? tendered >= totals.total : true) &&
    (hasSplits ? splitsMatch : true);

  const handleEnter = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && canConfirm) {
        e.preventDefault();
        onConfirm();
      }
    },
    [canConfirm, onConfirm],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [handleEnter]);

  const quickAdd = (amount: number) =>
    setAmountTendered((prev) => String((parseFloat(prev) || 0) + amount));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-t-[24px] sm:rounded-[24px] w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-5 pb-3 flex justify-between items-center border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Confirmar venta</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Sale summary */}
          <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/10">
            <h3 className="text-sm font-semibold text-on-surface mb-3">Resumen de venta</h3>
            <div className="flex justify-between text-sm text-on-surface-variant mb-1">
              <span>
                {cart.length} &iacute;tem{cart.length !== 1 ? "s" : ""} &middot;{" "}
                {cartUnits} unidad{cartUnits !== 1 ? "es" : ""}
              </span>
            </div>
            <div className="flex justify-between items-baseline border-t border-outline-variant/10 pt-2.5 mt-2">
              <span className="text-sm font-semibold text-on-surface">Total</span>
              <span className="text-xl font-bold text-on-surface tabular-nums">
                ${money(totals.total)}
              </span>
            </div>
          </div>

          {/* Payment method — editor */}
          <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-on-surface">
                M&eacute;todo de pago
              </h3>
              {!hasSplits && (
                <button
                  type="button"
                  onClick={addSplit}
                  className="text-xs text-primary hover:text-primary-dim transition-colors font-medium"
                >
                  + Dividir pago
                </button>
              )}
            </div>

            {hasSplits ? (
              <div className="space-y-2">
                {splits.map((sp, i) => {
                  const isLast = i === splits.length - 1;
                  const othersSum = splits.reduce((s, x, j) => s + (j !== i ? x.amount : 0), 0);
                  const remaining = Math.max(0, totals.total - othersSum);

                  return (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center gap-2">
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

                      {sp.payment_method === "transferencia" && asksTransferMethod && (
                        <SplitChannelChips
                          label="Medio de transferencia"
                          options={transferOptions}
                          selected={sp.transfer_method ?? transferOptions[0]?.id ?? null}
                          onSelect={(id) => updateSplitMethod(i, "transferencia", id, null)}
                        />
                      )}

                      {sp.payment_method === "tarjeta" && asksCardMethod && (
                        <SplitChannelChips
                          label="Medio de tarjeta / datáfono"
                          options={cardOptions}
                          selected={sp.card_method ?? cardOptions[0]?.id ?? null}
                          onSelect={(id) => updateSplitMethod(i, "tarjeta", null, id)}
                        />
                      )}
                    </div>
                  );
                })}

                <div className="flex justify-between items-center pt-2 border-t border-outline-variant/10">
                  <span className="text-[11px] text-on-surface-variant">
                    Pagado: ${money(splitsSum)} / ${money(totals.total)}
                  </span>
                  {!splitsMatch && splitsSum < totals.total ? (
                    <span className="text-[11px] font-semibold text-error">
                      Restan ${money(totals.total - splitsSum)}
                    </span>
                  ) : !splitsMatch ? (
                    <span className="text-[11px] font-semibold text-error">
                      Sobran ${money(splitsSum - totals.total)}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-success">Completo &check;</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={addSplit}
                  className="w-full py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  + Agregar m&eacute;todo
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const total = splits.length;
                    for (let j = 0; j < total; j++) removeSplit(0);
                  }}
                  className="w-full py-1.5 rounded-lg text-xs text-on-surface-variant/60 hover:text-error transition-colors"
                >
                  Quitar divisi&oacute;n
                </button>
              </div>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">M&eacute;todo</span>
                <span className="font-semibold text-on-surface">
                  {paymentLabel(paymentMethod)}
                </span>
              </div>
            )}
          </div>

          {/* Cash tender */}
          {hasCash && (
            <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/10 space-y-3">
              <h3 className="text-sm font-semibold text-on-surface">
                Pago en efectivo
              </h3>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">
                  Monto recibido ($)
                </label>
                <input
                  autoFocus
                  type="number"
                  step="100"
                  min="0"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-lg text-on-surface font-bold text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => quickAdd(amount)}
                    className="py-2 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
                  >
                    ${money(amount)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAmountTendered(String(totals.total))}
                  className="py-2 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-primary/30 hover:text-on-surface transition-colors"
                >
                  Valor exacto
                </button>
                <button
                  type="button"
                  onClick={() => setAmountTendered("")}
                  disabled={!amountTendered}
                  className="py-2 rounded-xl text-xs font-bold border border-outline-variant/20 text-on-surface-variant hover:border-error/30 hover:text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Limpiar
                </button>
              </div>

              {tendered > 0 && (
                <div
                  className={`flex justify-between items-center p-3 rounded-xl ${
                    change >= 0
                      ? "bg-[#10b981]/5 border border-[#10b981]/20"
                      : "bg-error/5 border border-error/20"
                  }`}
                >
                  <span className="font-semibold text-sm text-on-surface-variant">
                    Cambio
                  </span>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      change >= 0 ? "text-[#10b981]" : "text-error"
                    }`}
                  >
                    {change >= 0
                      ? `$${money(change)}`
                      : `Faltan $${money(Math.abs(change))}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 pb-5 pt-2 flex gap-3 border-t border-outline-variant/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <>
                <span>Confirmar venta</span>
                <span className="tabular-nums">${money(totals.total)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
