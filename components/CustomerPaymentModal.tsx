"use client";

import { useState } from "react";
import { useCustomersStore } from "@/stores/customers.store";
import type { Customer } from "@/services/customers.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface CustomerPaymentModalProps {
  customer: Customer;
  onClose: () => void;
}

export function CustomerPaymentModal({ customer, onClose }: CustomerPaymentModalProps) {
  const registerPayment = useCustomersStore((s) => s.registerPayment);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setSubmitting(true);
    const ok = await registerPayment(customer.id, val, notes || undefined);
    setSubmitting(false);
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
          {customer.credit_balance > 0 && (
            <div className="p-3 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/20">
              <p className="text-xs text-[#f59e0b] font-semibold">Debe: ${money(customer.credit_balance)}</p>
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
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 pl-7 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="0.00"
                autoFocus
              />
            </div>
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
            disabled={!parseFloat(amount) || parseFloat(amount) <= 0 || submitting}
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
