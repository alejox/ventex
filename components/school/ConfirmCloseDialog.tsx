"use client";

import { useMemo } from "react";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolClassesStore } from "@/stores/school-classes.store";
import { notifySuccess } from "@/lib/notifications";
import {
  consumptionAmountOf,
  consumptionPlanOf,
} from "@/services/school-classes.service";
import { formatSlotTime } from "@/services/school-schedule.service";
import type {
  AttendanceEntry,
  CloseParticipantRow,
} from "@/services/school-classes.service";
import type { SchoolLesson } from "@/services/school-schedule.service";

interface ConfirmCloseDialogProps {
  lesson: SchoolLesson;
  rows: CloseParticipantRow[];
  entries: AttendanceEntry[];
  onDone: () => void;
  onClose: () => void;
}

/** Texto corto de por qué la fila no consume (para el plan del cierre). */
function noConsumeReasonOf(r: CloseParticipantRow, status: AttendanceEntry["status"]): string {
  if (r.enrollment_status !== "active") return "matrícula no activa";
  if (status === "justified") return "justificado: repone";
  return "inasistencia sin descuento según la política";
}

/**
 * Confirmación explícita del cierre: muestra el plan de consumo ANTES de
 * escribir nada (`consumptionPlanOf`, puro) y recién ahí llama al RPC con el
 * jsonb de asistencia completo. El doble clic es idempotente (contrato
 * `alreadyClosed` del RPC); acá el botón se deshabilita con `saving`.
 */
export function ConfirmCloseDialog({
  lesson,
  rows,
  entries,
  onDone,
  onClose,
}: ConfirmCloseDialogProps) {
  const closeLesson = useSchoolClassesStore((s) => s.closeLesson);
  const saving = useSchoolClassesStore((s) => s.saving);
  const error = useSchoolClassesStore((s) => s.error);

  const statusById = useMemo(
    () => new Map(entries.map((e) => [e.participant_id, e.status])),
    [entries]
  );

  const plan = useMemo(
    () =>
      consumptionPlanOf(
        rows.map((r) => ({
          ...r,
          attendance_status: statusById.get(r.participant_id) ?? r.attendance_status,
        }))
      ),
    [rows, statusById]
  );

  const consumeSet = new Set(plan.map((p) => p.participant_id));

  const confirm = async () => {
    const ok = await closeLesson(lesson.id, entries);
    if (!ok) return;
    notifySuccess(
      "Clase cerrada",
      plan.length > 0
        ? `${plan.length} ${plan.length === 1 ? "clase descontada" : "clases descontadas"} de los saldos.`
        : "Sin consumos de créditos."
    );
    onDone();
  };

  return (
    <SchoolModal title="Confirmar cierre" onClose={onClose}>
      <div className="space-y-4 p-6 pt-4">
        <p className="text-sm font-semibold text-on-surface-variant">
          {lesson.instrument} · {formatSlotTime(lesson.start_at)}–{formatSlotTime(lesson.end_at)}
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Sin participantes: el cierre no descuenta ninguna clase.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const status: AttendanceEntry["status"] =
                statusById.get(r.participant_id) ??
                (r.attendance_status === "pending" ? "attended" : r.attendance_status);
              const consumes = consumeSet.has(r.participant_id);
              return (
                <li
                  key={r.participant_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface">{r.student_name}</p>
                    <p className="truncate text-xs text-on-surface-variant">
                      {consumes
                        ? "descuenta 1 clase del saldo"
                        : `no descuenta: ${noConsumeReasonOf(r, status)}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      consumptionAmountOf({ ...r, attendance_status: status }) === -1
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {consumptionAmountOf({ ...r, attendance_status: status }) === -1 ? "−1" : "0"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p
          className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
            plan.length > 0
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {plan.length > 0
            ? `Se descuentan ${plan.length} ${plan.length === 1 ? "clase" : "clases"} de los saldos.`
            : "Ninguna clase se descuenta de los saldos."}
        </p>

        {error && <p className="text-xs font-medium text-error">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
          >
            {saving ? "Cerrando…" : "Cerrar clase"}
          </button>
        </div>
      </div>
    </SchoolModal>
  );
}