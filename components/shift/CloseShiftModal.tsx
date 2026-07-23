"use client";

import React, { useState } from "react";
import { useShiftsStore } from "@/stores/shifts.store";
import type { CurrentShift, ShiftSummary } from "@/services/shifts.service";
import { notifySuccess } from "@/lib/notifications";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Datáfono",
  transferencia: "Transferencia",
};

/** Desglose completo del turno. Solo se muestra DESPUÉS de contar el efectivo. */
function SummaryRows({
  byMethod,
  salesCount,
  salesTotal,
  openingCash,
  withdrawals,
  expectedCash,
}: {
  byMethod: Record<string, number>;
  salesCount: number;
  salesTotal: number;
  openingCash: number;
  withdrawals: number;
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
      {withdrawals > 0 && (
        <div className="flex justify-between px-4 py-2.5">
          <span className="text-on-surface-variant">Retiros de caja</span>
          <span className="font-semibold text-on-surface tabular-nums">-{money(withdrawals)}</span>
        </div>
      )}
      <div className="flex justify-between px-4 py-2.5">
        <span className="font-semibold text-on-surface">Efectivo esperado en caja</span>
        <span className="font-bold text-on-surface tabular-nums">{money(expectedCash)}</span>
      </div>
    </div>
  );
}

/**
 * Cierre de turno con arqueo a conteo ciego: primero el empleado declara el
 * efectivo que contó, SIN ver ventas ni el esperado (si los viera, podría
 * cuadrar la cifra en vez de contar). Recién ahí se revela la diferencia, y
 * todo descuadre exige justificación (el servidor también la exige).
 *
 * Para el dueño (`shiftId`) el flujo es el mismo, pero cerrando un turno ajeno.
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
  const needsJustification = useShiftsStore((s) => s.needsJustification);
  const resetJustification = useShiftsStore((s) => s.resetJustification);
  const fetchCurrentShift = useShiftsStore((s) => s.fetchCurrentShift);

  const [step, setStep] = useState<"count" | "verdict">("count");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState<ShiftSummary | null>(null);

  const counted = parseFloat(closingCash);
  const countedValid = !Number.isNaN(counted) && counted >= 0;

  // El dueño cierra un turno ajeno sin los acumulados en vivo, así que no hay
  // veredicto que anticipar: el servidor lo calcula y, si descuadra, pide nota.
  const expected = live?.expected_cash ?? null;
  const difference = expected != null && countedValid ? Math.round((counted - expected) * 100) / 100 : null;
  // Única fuente de verdad del paso 2: si se exige justificación, se muestra el
  // campo. Antes el textarea dependía de `difference` y el botón de esta bandera,
  // así que cuando el servidor contradecía al cliente (una venta entró mientras
  // el empleado contaba) quedaba un botón deshabilitado sin campo donde escribir.
  const showJustification = (difference != null && difference !== 0) || needsJustification;
  const notesValid = !showJustification || notes.trim().length > 0;

  const submit = async () => {
    if (!countedValid) return;
    const result = await closeShift(counted, notes.trim() || undefined, shiftId);
    if (result) {
      setSummary(result);
      notifySuccess("Turno cerrado", "El arqueo de caja quedó registrado.");
    }
  };

  const handleCount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!countedValid) return;
    // Sin datos en vivo no hay veredicto local: se intenta cerrar y el servidor
    // responde si falta justificación.
    if (expected == null) {
      submit();
      return;
    }
    setStep("verdict");
  };

  // ---- Paso 3: resultado del arqueo (el turno ya está cerrado) ----
  if (summary) {
    const ok = summary.difference === 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
          <div className="p-6 border-b border-outline-variant/10 shrink-0">
            <h2 className="text-lg font-bold text-on-surface">Arqueo de caja</h2>
            <p className="text-sm text-on-surface-variant mt-1">Resumen del turno cerrado.</p>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto">
            <SummaryRows
              byMethod={summary.totals_by_method ?? {}}
              salesCount={summary.sales_count}
              salesTotal={summary.sales_total}
              openingCash={summary.opening_cash}
              withdrawals={summary.withdrawals_total ?? 0}
              expectedCash={summary.expected_cash}
            />
            <div className="rounded-2xl bg-surface-container-low border border-outline-variant/10 divide-y divide-outline-variant/10 text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-on-surface-variant">Efectivo contado</span>
                <span className="font-semibold text-on-surface tabular-nums">{money(summary.closing_cash)}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="font-bold text-on-surface">Diferencia</span>
                <span className={`font-bold tabular-nums ${ok ? "text-[#10b981]" : summary.difference < 0 ? "text-error" : "text-amber-500"}`}>
                  {summary.difference > 0 ? "+" : ""}
                  {money(summary.difference)}
                </span>
              </div>
            </div>
            {ok ? (
              <p className="text-xs text-[#10b981] font-semibold">La caja cuadró exactamente.</p>
            ) : summary.difference < 0 ? (
              <p className="text-xs text-error">
                Faltan {money(Math.abs(summary.difference))} respecto a lo esperado. Se notificó al dueño.
              </p>
            ) : (
              <p className="text-xs text-amber-500">
                Sobran {money(summary.difference)} respecto a lo esperado. Se notificó al dueño.
              </p>
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

  // ---- Paso 2: veredicto del descuadre + justificación ----
  // `needsJustification` cubre el cierre del dueño: sin datos en vivo no se
  // puede anticipar la diferencia, así que el veredicto llega del servidor.
  if (step === "verdict" || needsJustification) {
    const cuadrado = difference === 0 && !needsJustification;
    const faltante = difference != null && difference < 0;
    // El cliente creía que cuadraba y el servidor dijo que no: los acumulados
    // se movieron entre el conteo y el envío.
    const serverDisagrees = needsJustification && difference === 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
          <div className="p-6 border-b border-outline-variant/10 shrink-0">
            <h2 className="text-lg font-bold text-on-surface">
              {difference == null || serverDisagrees
                ? "Atención: la caja no cuadra"
                : cuadrado
                  ? "Turno cuadrado"
                  : faltante
                    ? "Atención: faltante en caja"
                    : "Atención: sobrante en caja"}
            </h2>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {error}
              </div>
            )}

            <div
              className={`rounded-2xl border p-4 text-center ${
                cuadrado
                  ? "bg-[#10b981]/5 border-[#10b981]/30"
                  : faltante
                    ? "bg-error/5 border-error/30"
                    : "bg-amber-500/5 border-amber-500/30"
              }`}
            >
              <p className="text-sm text-on-surface-variant">
                {serverDisagrees
                  ? "Los movimientos del turno cambiaron mientras contabas, así que el efectivo contado ya no coincide con lo esperado."
                  : difference == null
                    ? "El efectivo contado no coincide con lo esperado."
                    : cuadrado
                      ? "El efectivo contado coincide con lo esperado."
                      : faltante
                        ? "Faltan en caja"
                        : "Sobran en caja"}
              </p>
              {difference != null && !cuadrado && !serverDisagrees && (
                <p className={`text-3xl font-bold mt-1 tabular-nums ${faltante ? "text-error" : "text-amber-500"}`}>
                  {money(Math.abs(difference))}
                </p>
              )}
              <p className="text-xs text-on-surface-variant mt-2">
                Contaste {money(counted)}.
              </p>
            </div>

            {showJustification && (
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">
                  Justificación <span className="text-error">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  autoFocus
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    faltante
                      ? "Ej: se pagó un domicilio en efectivo sin registrar el retiro"
                      : "Ej: un cliente dejó una propina en la caja"
                  }
                  className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 resize-none"
                />
                <p className="text-xs text-on-surface-variant mt-1">
                  Obligatoria: el dueño recibirá una alerta con esta explicación.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  // Sin bajar la bandera del store, este mismo paso se volvería
                  // a renderizar y el empleado quedaría encerrado en el modal.
                  resetJustification();
                  // Refresca los acumulados: si el servidor discrepó es porque
                  // se movieron, y el próximo veredicto debe salir del dato nuevo.
                  if (live) fetchCurrentShift();
                  setStep("count");
                }}
                className="px-5 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
              >
                Volver a contar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !notesValid}
                className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Cerrando…" : cuadrado ? "Cerrar turno" : "Justificar y cerrar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Paso 1: conteo ciego ----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface">Cerrar turno</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Cuenta todo el efectivo que hay físicamente en la caja e ingrésalo.
          </p>
        </div>

        <form onSubmit={handleCount} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
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
            <p className="text-xs text-on-surface-variant mt-1.5">
              Incluye la base con la que abriste. Al confirmar verás si la caja cuadra.
            </p>
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
              disabled={submitting || !countedValid}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Cerrando…" : "Continuar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
