"use client";

import { useMemo, useState } from "react";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolClassesStore } from "@/stores/school-classes.store";
import { enrollmentBalanceOf } from "@/services/school-enrollments.service";
import { formatMoney, formatShortDate } from "@/components/school/format";
import { notifySuccess } from "@/lib/notifications";
import type { CreditMovement, SchoolEnrollment } from "@/services/school-enrollments.service";

interface CreditHistoryProps {
  enrollments: SchoolEnrollment[];
  movements: CreditMovement[];
  /** Refresca el detalle del alumno tras un ajuste (el saldo es la suma). */
  onChanged: () => void;
}

const KIND_LABELS: Record<string, string> = {
  assignment: "Crédito por matrícula",
  consumption: "Clase consumida",
  cancel_return: "Devolución por cancelación",
  void: "Anulación de venta",
  adjustment: "Ajuste",
};

const MOVEMENT_STYLE: Record<string, string> = {
  assignment: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  consumption: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  cancel_return: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  void: "bg-surface-container text-on-surface-variant",
  adjustment: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  expired: "Vencida",
  voided: "Voided",
  cancelled: "Cancelada",
};

/**
 * Libro mayor de créditos del alumno, POR MATRÍCULA: cada plan muestra su
 * saldo reconstruido (suma de movimientos — nunca un contador editable) y su
 * ledger completo de asignación / consumo / devolución / anulación / ajuste,
 * con la razón que lo justifica. El ajuste exige motivo y viaja por el RPC
 * `school_adjust_credit` — no hay ediciones silenciosas.
 */
export function CreditHistory({ enrollments, movements, onChanged }: CreditHistoryProps) {
  const adjustCredit = useSchoolClassesStore((s) => s.adjustCredit);
  const saving = useSchoolClassesStore((s) => s.saving);
  const error = useSchoolClassesStore((s) => s.error);
  const clearError = useSchoolClassesStore((s) => s.clearError);

  const [adjusting, setAdjusting] = useState<SchoolEnrollment | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const movementsByEnrollment = useMemo(() => {
    const byId = new Map<string, CreditMovement[]>();
    for (const m of movements) {
      const list = byId.get(m.enrollment_id) ?? [];
      list.push(m);
      byId.set(m.enrollment_id, list);
    }
    return byId;
  }, [movements]);

  const submitAdjust = async () => {
    if (!adjusting) return;
    const value = Number(amount);
    const ok = await adjustCredit(adjusting.id, value, reason);
    if (ok === null) return;
    notifySuccess(
      "Saldo ajustado",
      `${value > 0 ? "+" : ""}${value} ${value === 1 || value === -1 ? "clase" : "clases"} · nuevo saldo ${ok}`
    );
    setAdjusting(null);
    setAmount("");
    setReason("");
    onChanged();
  };

  return (
    <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm">
      <h2 className="font-bold text-on-surface">Historial de saldo</h2>

      {enrollments.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">
          Sin matrículas: no hay saldo que mostrar.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {enrollments.map((e) => {
            const ledger = movementsByEnrollment.get(e.id) ?? [];
            const balance = enrollmentBalanceOf(ledger);
            return (
              <div key={e.id} className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface">
                      {e.plan_name}
                      <span className="ml-2 rounded-full bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                        {ENROLLMENT_STATUS_LABEL[e.status] ?? e.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-on-surface-variant">
                      {formatMoney(e.plan_price)} · {e.contracted_lessons}{" "}
                      {e.contracted_lessons === 1 ? "clase" : "clases"} contratadas
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${
                        balance > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      {balance} {balance === 1 ? "clase en saldo" : "clases en saldo"}
                    </span>
                    {e.status === "active" && (
                      <button
                        type="button"
                        onClick={() => {
                          clearError();
                          setAdjusting(e);
                          setAmount("");
                          setReason("");
                        }}
                        className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                </div>

                {ledger.length === 0 ? (
                  <p className="mt-3 text-xs text-on-surface-variant">Sin movimientos.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-outline-variant/10">
                    {[...ledger]
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-on-surface">
                              {KIND_LABELS[m.kind] ?? m.kind}
                            </p>
                            <p className="truncate text-xs text-on-surface-variant">
                              {m.reason} · {formatShortDate(m.created_at)}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                              MOVEMENT_STYLE[m.kind] ?? "bg-surface-container text-on-surface-variant"
                            }`}
                          >
                            {m.amount > 0 ? `+${m.amount}` : m.amount}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adjusting && (
        <SchoolModal title={`Ajustar saldo · ${adjusting.plan_name}`} onClose={() => setAdjusting(null)}>
          <div className="space-y-4 p-6 pt-4">
            <p className="text-xs text-on-surface-variant">
              El saldo es la SUMA de sus movimientos: cada ajuste queda registrado
              en el historial con su motivo. Usá un número negativo para descontar
              (ej.: −2) y positivo para sumar (ej.: +3). Cero no está permitido.
            </p>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant">Cantidad</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="−2 o +3"
                className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant">
                Motivo (obligatorio)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej.: crédito de cortesía del profesor"
                rows={3}
                className="mt-1 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
              />
            </div>
            {error && <p className="text-xs font-medium text-error">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
              <button
                type="button"
                onClick={() => setAdjusting(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitAdjust()}
                disabled={saving || !amount || Number(amount) === 0 || !reason.trim()}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar ajuste"}
              </button>
            </div>
          </div>
        </SchoolModal>
      )}
    </section>
  );
}