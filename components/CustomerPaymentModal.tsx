"use client";

import { useState } from "react";
import { useCustomersStore } from "@/stores/customers.store";
import { paymentAmountOf, creditAvailable } from "@/lib/credits";
import type { Customer } from "@/services/customers.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface CustomerPaymentModalProps {
  customer: Customer;
  onClose: () => void;
  /**
   * Quién registra el abono. Por defecto, el store de Clientes.
   *
   * Lo recibe como prop para que Créditos —que tiene su propio store y su
   * propia lista que actualizar— use ESTE modal y no una copia. Dos modales de
   * cobro es lo mismo que dos validaciones distintas del mismo monto, y la
   * segunda siempre nace más floja.
   */
  onConfirm?: (amount: number, notes?: string) => Promise<boolean>;
  submitting?: boolean;
}

export function CustomerPaymentModal({
  customer,
  onClose,
  onConfirm,
  submitting: submittingProp,
}: CustomerPaymentModalProps) {
  const registerPayment = useCustomersStore((s) => s.registerPayment);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const submitting = submittingProp ?? localSubmitting;
  const debt = customer.credit_balance;
  const parsed = paymentAmountOf(amount, debt);
  const available = creditAvailable(debt, customer.credit_limit);

  // El campo escrito es un monto, pero NO uno cobrable: se avisa por qué en vez
  // de dejar el botón apagado sin explicación. El caso frecuente es cobrar de
  // más, y ahí el error del RPC llegaría recién después de apretar.
  const excede = parsed == null && amount.trim() !== "" && Number(amount.replace(",", ".")) > debt;

  const handleSubmit = async () => {
    if (parsed == null) return;
    const run = onConfirm ?? ((a: number, n?: string) => registerPayment(customer.id, a, n));
    if (!onConfirm) setLocalSubmitting(true);
    const ok = await run(parsed, notes || undefined);
    if (!onConfirm) setLocalSubmitting(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-t-[24px] sm:rounded-[24px] w-full max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-6 pb-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Registrar abono</h2>
            <p className="text-sm text-on-surface-variant">{customer.full_name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 pt-0 space-y-4">
          {debt > 0 && (
            <div className="p-3 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-between gap-3">
              <p className="text-xs text-[#f59e0b] font-semibold">Debe: ${money(debt)}</p>
              {/* Saldar toda la cuenta es el cobro más común y el más fácil de
                  tipear mal: acá el número lo pone el saldo, no los dedos. */}
              <button
                type="button"
                onClick={() => setAmount(String(debt))}
                className="text-[11px] font-bold text-[#f59e0b] hover:underline shrink-0"
              >
                Saldar todo
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Monto del abono <span className="text-primary">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                className={`w-full bg-surface-container-lowest border rounded-xl py-2.5 pl-7 pr-3 text-sm text-on-surface focus:outline-none focus:ring-1 ${
                  excede
                    ? "border-error focus:border-error focus:ring-error"
                    : "border-outline-variant/30 focus:border-primary focus:ring-primary"
                }`}
                placeholder="0.00"
                autoFocus
              />
            </div>
            {excede && (
              <p className="text-xs text-error">
                El abono no puede superar la deuda de ${money(debt)}.
              </p>
            )}
            {!excede && parsed != null && parsed < debt && (
              <p className="text-xs text-on-surface-variant">
                Le quedarían ${money(debt - parsed)} por pagar.
              </p>
            )}
            {!excede && parsed != null && parsed >= debt && available != null && (
              <p className="text-xs text-[#10b981]">
                Queda al día y recupera su cupo de ${money(customer.credit_limit ?? 0)}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Ej. Abono quincenal"
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={parsed == null || submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary-dim text-on-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <span className="inline-block w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
            ) : null}
            Registrar abono
          </button>
        </div>
      </div>
    </div>
  );
}
