"use client";

import React, { useState } from "react";
import { useShiftsStore } from "@/stores/shifts.store";
import type { CurrentShift, ShiftSummary } from "@/services/shifts.service";
import { notifySuccess } from "@/lib/notifications";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

function SummaryRows({
  byMethod,
  salesCount,
  salesTotal,
  openingCash,
  expectedCash,
}: {
  byMethod: Record<string, number>;
  salesCount: number;
  salesTotal: number;
  openingCash: number;
  expectedCash: number;
}) {
  return (
    <div className="rounded-2xl bg-surface-container-low border border-outline-variant/10 divide-y divide-outline-variant/10 text-sm">
      <div className="flex justify-between px-4 py-2.5">
        <span className="text-on-surface-variant">Ventas del turno</span>
        <span className="font-semibold text-on-surface tabular-nums">
          {salesCount} · {money(salesTotal)}
        </span>
      </div>
      {Object.entries(byMethod).map(([method, total]) => (
        <div key={method} className="flex justify-between px-4 py-2.5">
          <span className="text-on-surface-variant">{METHOD_LABEL[method] ?? method}</span>
          <span className="font-semibold text-on-surface tabular-nums">{money(total)}</span>
        </div>
      ))}
      <div className="flex justify-between px-4 py-2.5">
        <span className="text-on-surface-variant">Base de caja</span>
        <span className="font-semibold text-on-surface tabular-nums">{money(openingCash)}</span>
      </div>
      <div className="flex justify-between px-4 py-2.5">
        <span className="font-semibold text-on-surface">Efectivo esperado en caja</span>
        <span className="font-bold text-on-surface tabular-nums">{money(expectedCash)}</span>
      </div>
    </div>
  );
}

/**
 * Cierre de turno con arqueo. Para el empleado muestra el resumen en vivo
 * (`live`); para el dueño (`shiftId`) solo pide el efectivo contado. Tras
 * cerrar, muestra la diferencia del arqueo.
 */
export function CloseShiftModal({
  live,
  shiftId,
  onClose,
}: {
  live?: CurrentShift | null;
  shiftId?: string;
  onClose: () => void;
}) {
  const closeShift = useShiftsStore((s) => s.closeShift);
  const submitting = useShiftsStore((s) => s.submitting);
  const error = useShiftsStore((s) => s.error);

  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState<ShiftSummary | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(closingCash);
    if (Number.isNaN(amount) || amount < 0) return;
    const result = await closeShift(amount, notes || undefined, shiftId);
    if (result) {
      setSummary(result);
      notifySuccess("Turno cerrado", "El arqueo de caja quedó registrado.");
    }
  };

  // Vista posterior al cierre: resultado del arqueo.
  if (summary) {
    const ok = summary.difference >= 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="p-6 border-b border-outline-variant/10">
            <h2 className="text-lg font-bold text-on-surface">Arqueo de caja</h2>
            <p className="text-sm text-on-surface-variant mt-1">Resumen del turno cerrado.</p>
          </div>
          <div className="p-6 space-y-4">
            <SummaryRows
              byMethod={summary.totals_by_method ?? {}}
              salesCount={summary.sales_count}
              salesTotal={summary.sales_total}
              openingCash={summary.opening_cash}
              expectedCash={summary.expected_cash}
            />
            <div className="rounded-2xl bg-surface-container-low border border-outline-variant/10 divide-y divide-outline-variant/10 text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-on-surface-variant">Efectivo contado</span>
                <span className="font-semibold text-on-surface tabular-nums">{money(summary.closing_cash)}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="font-bold text-on-surface">Diferencia</span>
                <span className={`font-bold tabular-nums ${ok ? "text-[#10b981]" : "text-error"}`}>
                  {summary.difference > 0 ? "+" : ""}
                  {money(summary.difference)}
                </span>
              </div>
            </div>
            {!ok && (
              <p className="text-xs text-error">Falta efectivo respecto a lo esperado en caja.</p>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors"
            >
              Finalizar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Cerrar turno</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Cuenta el efectivo de la caja y regístralo para el arqueo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          {live && (
            <SummaryRows
              byMethod={live.totals_by_method ?? {}}
              salesCount={live.sales_count}
              salesTotal={live.sales_total}
              openingCash={live.opening_cash}
              expectedCash={live.expected_cash}
            />
          )}

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Efectivo contado</label>
            <input
              type="number"
              required
              min={0}
              step="any"
              inputMode="decimal"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 text-lg font-semibold tabular-nums"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-on-surface mb-1.5">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: se pagó domicilio en efectivo"
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
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50"
            >
              {submitting ? "Cerrando…" : "Cerrar turno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
