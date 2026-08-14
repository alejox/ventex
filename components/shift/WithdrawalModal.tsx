"use client";

import React, { useEffect, useState } from "react";
import { useShiftsStore } from "@/stores/shifts.store";
import { useExpensesStore } from "@/stores/expenses.store";
import type { WithdrawalKind } from "@/services/shifts.service";
import { notifySuccess } from "@/lib/notifications";

/**
 * Retiro de caja (sangría) durante el turno. Registrarlo es lo que evita que
 * el dinero sacado de la caja aparezca como faltante en el arqueo, así que el
 * motivo es obligatorio: es el rastro de a dónde fue.
 *
 * El destino decide si además se anota como gasto del negocio. Son dos cosas
 * distintas: el retiro SIEMPRE cuadra la caja, pero solo un gasto llega al
 * estado de resultados. Llevar plata a la caja fuerte no es una pérdida.
 */
export function WithdrawalModal({ onClose }: { onClose: () => void }) {
  const registerWithdrawal = useShiftsStore((s) => s.registerWithdrawal);
  const submitting = useShiftsStore((s) => s.submitting);
  const error = useShiftsStore((s) => s.error);

  const categories = useExpensesStore((s) => s.categories);
  const fetchCategories = useExpensesStore((s) => s.fetchCategories);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<WithdrawalKind>("traslado");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    if (categories.length === 0) fetchCategories();
  }, [categories.length, fetchCategories]);

  // "Caja" es la categoría sembrada para lo que sale del mostrador: viene
  // preseleccionada para que el cajero no tenga que pensarlo.
  //
  // Se DERIVA, no se sincroniza con un efecto: el estado guarda solo lo que el
  // cajero eligió a mano, y mientras no elija nada vale el default. Meterlo con
  // un setState dentro de un useEffect es un render en cascada, y el compilador
  // de React lo marca.
  const fallbackCategoryId =
    categories.find((c) => c.name.toLowerCase() === "caja")?.id ??
    categories.find((c) => c.is_default)?.id ??
    "";
  const effectiveCategoryId = categoryId || fallbackCategoryId;

  const parsed = parseFloat(amount);
  const valid = !Number.isNaN(parsed) && parsed > 0 && reason.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await registerWithdrawal(parsed, reason.trim(), kind, kind === "gasto" ? effectiveCategoryId : null);
    if (ok) {
      notifySuccess(
        "Retiro registrado",
        kind === "gasto"
          ? "Se descontó del efectivo esperado y quedó anotado en Gastos."
          : "Se descontó del efectivo esperado en caja.",
      );
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

          <div>
            <span className="block text-sm font-semibold text-on-surface mb-1.5">
              ¿Qué se hizo con la plata?
            </span>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "gasto" as const, label: "Gasto del negocio", hint: "Se anota en Gastos" },
                { id: "traslado" as const, label: "Traslado", hint: "Solo sale de la caja" },
              ]).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={kind === option.id}
                  onClick={() => setKind(option.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                    kind === option.id
                      ? "border-primary bg-primary/10"
                      : "border-outline-variant/20 hover:bg-surface-container-low"
                  }`}
                >
                  <span className="block text-sm font-semibold text-on-surface">{option.label}</span>
                  <span className="block text-[11px] text-on-surface-variant mt-0.5">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {kind === "gasto" && (
            <div>
              <label htmlFor="withdrawal-category" className="block text-sm font-semibold text-on-surface mb-1.5">
                Categoría del gasto
              </label>
              <select
                id="withdrawal-category"
                value={effectiveCategoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {/* La regla contra el doble conteo, donde se toma la decisión y no
                  en la cabeza de alguien: una compra a proveedor ya suma a
                  Gastos por su factura. */}
              <p className="text-[11px] text-on-surface-variant mt-1.5">
                Si estás pagando una factura de proveedor, elegí Traslado y registrala en Compras:
                si no, ese dinero se cuenta dos veces.
              </p>
            </div>
          )}

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
