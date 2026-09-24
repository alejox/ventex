"use client";

import { useEffect, useState } from "react";
import { SchoolModal } from "@/components/school/SchoolModal";
import { CollectionLoading } from "@/components/CollectionState";
import { useSchoolClassesStore } from "@/stores/school-classes.store";
import { formatSlotTime } from "@/services/school-schedule.service";
import type {
  AttendanceEntry,
  AttendanceStatus,
  CloseParticipantRow,
} from "@/services/school-classes.service";
import type { SchoolLesson } from "@/services/school-schedule.service";

/** Lo que el editor de asistencia entrega al diálogo de confirmación. */
export interface AttendanceSelection {
  rows: CloseParticipantRow[];
  entries: AttendanceEntry[];
}

interface AttendanceDialogProps {
  lesson: SchoolLesson;
  /** Entrega la asistencia completa para que el cierre sea explícito. */
  onContinue: (selection: AttendanceSelection) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "attended", label: "Asistió" },
  { value: "absent", label: "Faltó" },
  { value: "justified", label: "Justificado" },
];

/**
 * Editor de asistencia del cierre: TODOS los participantes, sin pendientes
 * silenciosos. Cada fila es el participante con la política CONGELADA de su
 * matrícula (`fetchClosePreview`); el plan de consumo se arma recién en el
 * diálogo de confirmación con `consumptionPlanOf` — cerrar es explícito.
 */
export function AttendanceDialog({ lesson, onContinue, onClose }: AttendanceDialogProps) {
  const fetchClosePreview = useSchoolClassesStore((s) => s.fetchClosePreview);
  const [rows, setRows] = useState<CloseParticipantRow[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [observations, setObservations] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      await fetchClosePreview(lesson.id);
      if (!alive) return;
      const preview = useSchoolClassesStore.getState().closePreview;
      setRows(preview);
      setStatuses(
        Object.fromEntries(
          preview.map((r) => [
            r.participant_id,
            r.attendance_status === "pending" ? "attended" : r.attendance_status,
          ])
        )
      );
    })();
    return () => {
      alive = false;
    };
  }, [lesson.id, fetchClosePreview]);

  const submit = () => {
    if (!rows) return;
    onContinue({
      rows,
      entries: rows.map((r) => ({
        participant_id: r.participant_id,
        status: statuses[r.participant_id] ?? "attended",
        ...(observations[r.participant_id]?.trim()
          ? { observation: observations[r.participant_id].trim() }
          : {}),
      })),
    });
  };

  return (
    <SchoolModal title="Cerrar clase" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6 pt-4">
        <p className="text-sm font-semibold text-on-surface-variant">
          {lesson.instrument} · {formatSlotTime(lesson.start_at)}–{formatSlotTime(lesson.end_at)}
        </p>

        {rows === null ? (
          <CollectionLoading label="Cargando participantes…" />
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
            La clase no tiene participantes. Podés cerrarla igual; no se descuenta
            ninguna clase de los saldos.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const current = statuses[r.participant_id] ?? "attended";
              return (
                <li
                  key={r.participant_id}
                  className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-on-surface">{r.student_name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        r.enrollment_status === "active"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      {r.enrollment_status === "active"
                        ? "Matrícula activa"
                        : `Matrícula ${r.enrollment_status}`}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {STATUS_OPTIONS.map((opt) => {
                      const selected = current === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setStatuses((m) => ({ ...m, [r.participant_id]: opt.value }))
                          }
                          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? "bg-primary text-white"
                              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={observations[r.participant_id] ?? ""}
                    onChange={(e) =>
                      setObservations((m) => ({ ...m, [r.participant_id]: e.target.value }))
                    }
                    placeholder="Observación (opcional)"
                    className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={rows === null}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
          >
            Revisar plan de consumo
          </button>
        </div>
      </div>
    </SchoolModal>
  );
}