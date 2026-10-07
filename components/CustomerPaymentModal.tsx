"use client";

import { useState } from "react";
import { useCustomersStore } from "@/stores/customers.store";
import {
  abonoMethodOptions,
  paymentAmountOf,
  creditAvailable,
  type AbonoOptions,
  type AbonoPaymentMethod,
} from "@/lib/credits";
import { useSettingsStore } from "@/stores/settings.store";
import type { Customer } from "@/services/customers.service";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";

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
  onConfirm?: (amount: number, notes: string | undefined, options: AbonoOptions) => Promise<boolean>;
  submitting?: boolean;
}

export function CustomerPaymentModal({
  customer,
  onClose,
  onConfirm,
  submitting: submittingProp,
}: CustomerPaymentModalProps) {
  const fmtMoney = useFormatMoney();
  const registerPayment = useCustomersStore((s) => s.registerPayment);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const acceptsCard = useSettingsStore((s) => s.settings?.accepts_card);
  const acceptsTransfer = useSettingsStore((s) => s.settings?.accepts_transfer);
  const methods = abonoMethodOptions({ acceptsCard, acceptsTransfer });
  const [method, setMethod] = useState<AbonoPaymentMethod>("efectivo");
  // UN id por intento de cobro (el modal abierto): si la respuesta se pierde y
  // se vuelve a apretar, la base reconoce el abono y no descuenta dos veces.
  const [clientPaymentId] = useState(() => crypto.randomUUID());

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
    const run =
      onConfirm ?? ((a: number, n: string | undefined, o: AbonoOptions) => registerPayment(customer.id, a, n, o));
    if (!onConfirm) setLocalSubmitting(true);
    const ok = await run(parsed, notes || undefined, { paymentMethod: method, clientPaymentId });
    if (!onConfirm) setLocalSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Registrar abono"
      description={customer.full_name}
      size="sm"
      dismissible={false}
      bodyClassName="px-6 pb-4"
      footerClassName="px-6 pb-6"
      footer={
        <div className="flex gap-3">
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
      }
    >
        <div className="space-y-4">
          {debt > 0 && (
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-between gap-3">
              <p className="text-xs text-warning font-semibold">Debe: {fmtMoney(debt)}</p>
              {/* Saldar toda la cuenta es el cobro más común y el más fácil de
                  tipear mal: acá el número lo pone el saldo, no los dedos. */}
              <button
                type="button"
                onClick={() => setAmount(String(debt))}
                className="text-[11px] font-bold text-warning hover:underline shrink-0"
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
                data-autofocus
              />
            </div>
            {excede && (
              <p className="text-xs text-error">
                El abono no puede superar la deuda de {fmtMoney(debt)}.
              </p>
            )}
            {!excede && parsed != null && parsed < debt && (
              <p className="text-xs text-on-surface-variant">
                Le quedarían {fmtMoney(debt - parsed)} por pagar.
              </p>
            )}
            {!excede && parsed != null && parsed >= debt && available != null && (
              <p className="text-xs text-success">
                Queda al día y recupera su cupo de {fmtMoney(customer.credit_limit ?? 0)}.
              </p>
            )}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-semibold text-on-surface mb-1.5">Medio de pago</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Medio de pago">
              {methods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={method === m.value}
                  onClick={() => setMethod(m.value)}
                  className={`py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    method === m.value
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {method === "efectivo" && (
              <p className="text-xs text-on-surface-variant">
                El efectivo entra al arqueo del turno de caja abierto.
              </p>
            )}
          </fieldset>

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
    </Modal>
  );
}
