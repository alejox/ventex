"use client";

import React, { useState } from "react";
import { useShiftsStore } from "@/stores/shifts.store";
import { usePosStore } from "@/stores/pos.store";
import type { CurrentShift, ShiftSummary } from "@/services/shifts.service";
import { notifyError, notifySuccess } from "@/lib/notifications";
import { useCurrency, useFormatMoney } from "@/lib/useMoney";
import { useSettingsStore } from "@/stores/settings.store";
import { useProfile } from "@/components/ProfileProvider";
import {
  COP_DENOMINATIONS,
  parseDenominationCount,
  sumDenominationCounts,
} from "@/lib/pos-cash";
import { shiftCloseReport, shiftCloseReportHtml, shiftMethodLabel } from "@/lib/pos-shift-close";
import { Modal } from "@/components/ui/Modal";

/**
 * Imprime el cierre en una ventana aparte (80 mm). Aparte y no con
 * `window.print()` sobre la página: el POS ya tiene su propio CSS de
 * impresión para el recibo, y los dos se pisarían.
 */
function printHtml(html: string): boolean {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Un respiro para que el navegador maquete antes de abrir el diálogo.
  setTimeout(() => {
    win.print();
  }, 250);
  return true;
}

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
  const fmtMoney = useFormatMoney();
  return (
    <div className="rounded-2xl bg-surface-container-low border border-outline-variant/10 divide-y divide-outline-variant/10 text-sm">
      <div className="flex justify-between px-4 py-2.5">
        <span className="text-on-surface-variant">Ventas del turno</span>
        <span className="font-semibold text-on-surface tabular-nums">
          {salesCount} · {fmtMoney(salesTotal)}
        </span>
      </div>
      {Object.entries(byMethod).map(([method, total]) => (
        <div key={method} className="flex justify-between px-4 py-2.5">
          <span className="text-on-surface-variant">{shiftMethodLabel(method)}</span>
          <span className="font-semibold text-on-surface tabular-nums">{fmtMoney(total)}</span>
        </div>
      ))}
      <div className="flex justify-between px-4 py-2.5">
        <span className="text-on-surface-variant">Base de caja</span>
        <span className="font-semibold text-on-surface tabular-nums">{fmtMoney(openingCash)}</span>
      </div>
      {withdrawals > 0 && (
        <div className="flex justify-between px-4 py-2.5">
          <span className="text-on-surface-variant">Retiros de caja</span>
          <span className="font-semibold text-on-surface tabular-nums">-{fmtMoney(withdrawals)}</span>
        </div>
      )}
      <div className="flex justify-between px-4 py-2.5">
        <span className="font-semibold text-on-surface">Efectivo esperado en caja</span>
        <span className="font-bold text-on-surface tabular-nums">{fmtMoney(expectedCash)}</span>
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
  const fmtMoney = useFormatMoney();
  const isCop = useCurrency() === "COP";
  const profile = useProfile();
  const businessName = useSettingsStore((s) => s.settings?.business_profile?.businessName ?? null);
  const closeShift = useShiftsStore((s) => s.closeShift);
  const submitting = useShiftsStore((s) => s.submitting);
  const error = useShiftsStore((s) => s.error);
  const needsJustification = useShiftsStore((s) => s.needsJustification);
  const resetJustification = useShiftsStore((s) => s.resetJustification);
  const fetchCurrentShift = useShiftsStore((s) => s.fetchCurrentShift);
  /*
   * Ventas cobradas sin conexión que todavía no llegaron a la base. Cada una
   * viaja atada al turno en que se cobró: si el turno se cierra antes de que
   * salgan, `create_sale` las rechaza para siempre (el turno ya no existe
   * abierto) y la plata queda en el cajón sin venta, sin stock descontado y con
   * un sobrante falso en el arqueo. Solo aplica al cerrar el PROPIO turno: el
   * dueño cerrando el de otro (`shiftId`) no tiene esa cola en su navegador.
   */
  const pendingSales = usePosStore((s) => s.pendingSales);
  const blockedByQueue = !shiftId && pendingSales > 0;

  const [step, setStep] = useState<"count" | "verdict">("count");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  /**
   * Contador por denominación (C21), opcional. Suma solo y escribe el total
   * en "Efectivo contado"; no muestra nada del turno, así que el conteo sigue
   * siendo ciego.
   */
  const [showCounter, setShowCounter] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const counterTotal = sumDenominationCounts(counts);

  const setCount = (id: string, raw: string) => {
    const next = { ...counts, [id]: raw };
    setCounts(next);
    setClosingCash(String(sumDenominationCounts(next)));
  };

  const printClose = (result: ShiftSummary) => {
    const report = shiftCloseReport(
      {
        businessName,
        // El dueño cerrando el turno de otro no es "el cajero".
        cashier: shiftId ? null : profile?.fullName ?? null,
        openedAt: result.opened_at,
        closedAt: result.closed_at,
        openingCash: result.opening_cash,
        closingCash: result.closing_cash,
        expectedCash: result.expected_cash,
        difference: result.difference,
        salesCount: result.sales_count,
        salesTotal: result.sales_total,
        withdrawals: result.withdrawals_total ?? 0,
        byMethod: result.totals_by_method ?? {},
        notes: notes.trim() || null,
        denominations: COP_DENOMINATIONS.map((d) => {
          const count = parseDenominationCount(counts[d.id] ?? "");
          return {
            label: `${d.kind === "billete" ? "Billete" : "Moneda"} ${fmtMoney(d.value)}`,
            count,
            subtotal: count * d.value,
          };
        }),
      },
      fmtMoney,
    );
    if (!printHtml(shiftCloseReportHtml(report))) {
      notifyError(
        "No se pudo abrir la impresión",
        "Permite las ventanas emergentes de este sitio y vuelve a intentarlo.",
      );
    }
  };

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
    if (!countedValid || blockedByQueue) return;
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
      <Modal
        open
        className="max-w-md!"
        onClose={onClose}
        title="Arqueo de caja"
        description="Resumen del turno cerrado."
        dismissible={false}
        closeOnEscape={false}
        showCloseButton={false}
        bodyClassName="border-t border-outline-variant/10"
      >
          <div className="p-6 space-y-4">
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
                <span className="font-semibold text-on-surface tabular-nums">{fmtMoney(summary.closing_cash)}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="font-bold text-on-surface">Diferencia</span>
                <span className={`font-bold tabular-nums ${ok ? "text-success" : summary.difference < 0 ? "text-error" : "text-amber-500"}`}>
                  {summary.difference > 0 ? "+" : ""}
                  {fmtMoney(summary.difference)}
                </span>
              </div>
            </div>
            {ok ? (
              <p className="text-xs text-success font-semibold">La caja cuadró exactamente.</p>
            ) : summary.difference < 0 ? (
              <p className="text-xs text-error">
                Faltan {fmtMoney(Math.abs(summary.difference))} respecto a lo esperado. Se notificó al dueño.
              </p>
            ) : (
              <p className="text-xs text-amber-500">
                Sobran {fmtMoney(summary.difference)} respecto a lo esperado. Se notificó al dueño.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => printClose(summary)}
                className="sm:flex-1 min-h-12 py-3 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-low transition-colors inline-flex items-center justify-center gap-2"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Imprimir cierre
              </button>
              <button
                type="button"
                onClick={onClose}
                className="sm:flex-1 min-h-12 py-3 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-dim transition-colors"
              >
                Finalizar
              </button>
            </div>
          </div>
      </Modal>
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
      <Modal
        open
        className="max-w-md!"
        onClose={() => {}}
        title={
              difference == null || serverDisagrees
                ? "Atención: la caja no cuadra"
                : cuadrado
                  ? "Turno cuadrado"
                  : faltante
                    ? "Atención: faltante en caja"
                    : "Atención: sobrante en caja"
        }
        dismissible={false}
        closeOnEscape={false}
        showCloseButton={false}
        bodyClassName="border-t border-outline-variant/10"
      >
          <div className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                {error}
              </div>
            )}

            <div
              className={`rounded-2xl border p-4 text-center ${
                cuadrado
                  ? "bg-success/5 border-success/30"
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
                  {fmtMoney(Math.abs(difference))}
                </p>
              )}
              <p className="text-xs text-on-surface-variant mt-2">
                Contaste {fmtMoney(counted)}.
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
                  data-autofocus
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
                className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Cerrando…" : cuadrado ? "Cerrar turno" : "Justificar y cerrar"}
              </button>
            </div>
          </div>
      </Modal>
    );
  }

  // ---- Paso 1: conteo ciego ----
  return (
    <Modal
      open
      className="max-w-md!"
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Cerrar turno"
      description="Cuenta todo el efectivo que hay físicamente en la caja e ingrésalo."
      bodyClassName="border-t border-outline-variant/10"
    >
        <form onSubmit={handleCount} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          {blockedByQueue && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Tienes {pendingSales === 1 ? "1 venta" : `${pendingSales} ventas`} sin enviar
              (cobradas sin conexión). Espera a que se envíen antes de cerrar el
              turno: si lo cierras ahora, esas ventas se pierden y la caja no
              cuadra.
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
                  data-autofocus
              className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 text-lg font-semibold tabular-nums"
            />
            <p className="text-xs text-on-surface-variant mt-1.5">
              Incluye la base con la que abriste. Al confirmar verás si la caja cuadra.
            </p>
          </div>

          {isCop && (
            <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low">
              <button
                type="button"
                onClick={() => setShowCounter((v) => !v)}
                aria-expanded={showCounter}
                aria-controls="close-shift-counter"
                className="w-full min-h-11 flex items-center justify-between gap-3 px-4 text-sm font-semibold text-on-surface"
              >
                <span>Contar por billetes y monedas</span>
                <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${showCounter ? "rotate-180" : ""}`} aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showCounter && (
                <div id="close-shift-counter" className="px-4 pb-4 space-y-3">
                  <p className="text-xs text-on-surface-variant">
                    Escribe cuántos tienes de cada uno. El total se suma solo en &quot;Efectivo contado&quot;.
                  </p>
                  {(["billete", "moneda"] as const).map((kind) => (
                    <fieldset key={kind} className="space-y-1.5">
                      <legend className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                        {kind === "billete" ? "Billetes" : "Monedas"}
                      </legend>
                      <div className="grid grid-cols-2 gap-2">
                        {COP_DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
                          const qty = parseDenominationCount(counts[d.id] ?? "");
                          return (
                            <label
                              key={d.id}
                              className="flex items-center gap-2 rounded-xl bg-surface-container px-2.5 py-1.5"
                            >
                              <span className="min-w-0 flex-1 text-sm font-semibold text-on-surface tabular-nums">
                                {fmtMoney(d.value)}
                                {qty > 0 && (
                                  <span className="block text-[11px] font-normal text-on-surface-variant">
                                    = {fmtMoney(qty * d.value)}
                                  </span>
                                )}
                              </span>
                              <span className="sr-only">
                                Cantidad de {kind === "billete" ? "billetes" : "monedas"} de {fmtMoney(d.value)}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={counts[d.id] ?? ""}
                                onChange={(e) => setCount(d.id, e.target.value)}
                                placeholder="0"
                                className="w-16 h-10 rounded-lg border border-outline-variant/20 bg-surface-container-lowest text-center text-sm font-semibold text-on-surface tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                  <div className="flex items-center justify-between border-t border-outline-variant/15 pt-2.5 text-sm">
                    <span className="font-semibold text-on-surface">Suma del conteo</span>
                    <span className="font-bold text-on-surface tabular-nums">{fmtMoney(counterTotal)}</span>
                  </div>
                </div>
              )}
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
              disabled={submitting || !countedValid || blockedByQueue}
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Cerrando…" : "Continuar"}
            </button>
          </div>
        </form>
    </Modal>
  );
}
