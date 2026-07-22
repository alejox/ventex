"use client";

import React, { useState } from "react";
import { useShiftsStore } from "@/stores/shifts.store";
import { notifySuccess } from "@/lib/notifications";

/**
 * Retiro de caja (sangría) durante el turno. Registrarlo es lo que evita que
 * el dinero sacado de la caja aparezca como faltante en el arqueo, así que el
 * motivo es obligatorio: es el rastro de a dónde fue.
 */
export function WithdrawalModal({ onClose }: { onClose: () => void }) {
  const registerWithdrawal = useShiftsStore((s) => s.registerWithdrawal);
  const submitting = useShiftsStore((s) => s.submitting);
  const error = useShiftsStore((s) => s.error);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const parsed = parseFloat(amount);
  const valid = !Number.isNaN(parsed) && parsed > 0 && reason.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await registerWithdrawal(parsed, reason.trim());
    if (ok) {
      notifySuccess("Retiro registrado", "Se descontó del efectivo esperado en caja.");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Retiro de caja</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Registra el dinero que sacas de la caja para que no aparezca como faltante al cerrar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Monto retirado</label>
            <input
              type="number"
              required
              min={0}
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 text-lg font-semibold tabular-nums"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">
              Motivo <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: pago de domicilio, compra de insumos"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !valid}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Registrando…" : "Registrar retiro"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
