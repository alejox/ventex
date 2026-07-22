"use client";

import React, { useState } from "react";
import { useShiftsStore } from "@/stores/shifts.store";
import { notifySuccess } from "@/lib/notifications";

/**
 * Apertura de turno para empleados. No bloquea la entrada al POS: se pide solo
 * cuando el empleado intenta cobrar o imprimir, que es lo que de verdad exige
 * un turno abierto (`create_sale` lo rechaza sin él). Armar el carrito, buscar
 * productos o consultar precios no lo necesitan.
 */
export function OpenShiftModal({
  onClose,
  onOpened,
}: {
  onClose: () => void;
  /** Se llama tras abrir el turno, para retomar lo que el empleado iba a hacer. */
  onOpened?: () => void;
}) {
  const openShift = useShiftsStore((s) => s.openShift);
  const submitting = useShiftsStore((s) => s.submitting);
  const error = useShiftsStore((s) => s.error);

  const [openingCash, setOpeningCash] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(openingCash);
    if (Number.isNaN(amount) || amount < 0) return;
    const ok = await openShift(amount);
    if (ok) {
      notifySuccess("Turno abierto", "Ya puedes empezar a cobrar. ¡Buen turno!");
      onClose();
      onOpened?.();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Abrir turno</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Antes de cobrar, declara el efectivo con el que inicia la caja.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">
              Base de caja (efectivo inicial)
            </label>
            <input
              type="number"
              required
              min={0}
              step="any"
              inputMode="decimal"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 text-lg font-semibold tabular-nums"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Si la caja inicia vacía, escribe 0.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl border border-outline-variant/20 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
            >
              Ahora no
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50"
            >
              {submitting ? "Abriendo…" : "Abrir turno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
