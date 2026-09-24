"use client";

import { useEffect, useMemo, useState } from "react";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolScheduleStore } from "@/stores/school-schedule.store";
import { hoursToMinutes } from "@/services/school-schedule.service";
import { toISODate } from "@/lib/date";
import { notifySuccess } from "@/lib/notifications";
import type { TeacherProfile } from "@/services/school-people.service";
import type { AvailabilityInput } from "@/services/school-schedule.service";

interface AvailabilityEditorProps {
  teacher: TeacherProfile;
  onClose: () => void;
}

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const WEEKDAY_NUMBER = 1;

/** Franja en edición: el id del renglón guardado, o null si es nueva. */
interface DraftRow extends AvailabilityInput {
  key: string;
}

function keyOf(weekday: number, start_time: string): string {
  return `${weekday}|${start_time}`;
}

/**
 * Disponibilidad semanal y días bloqueados de un profesor.
 *
 * La franja semanal es la grilla de base; los bloqueos son la excepción (un
 * feriado, una ausencia puntual) y se avisan al planificar series — nunca se
 * cuelan en silencio. La base es la autoritativa; acá se edita y se guarda por
 * diff (ver `saveWeeklyAvailability`).
 */
export function AvailabilityEditor({ teacher, onClose }: AvailabilityEditorProps) {
  const weekly = useSchoolScheduleStore((s) => s.weekly);
  const blockedDates = useSchoolScheduleStore((s) => s.blockedDates);
  const loading = useSchoolScheduleStore((s) => s.loading);
  const saving = useSchoolScheduleStore((s) => s.saving);
  const error = useSchoolScheduleStore((s) => s.error);
  const fetchAvailability = useSchoolScheduleStore((s) => s.fetchAvailability);
  const saveWeekly = useSchoolScheduleStore((s) => s.saveWeekly);
  const createBlockedDate = useSchoolScheduleStore((s) => s.createBlockedDate);
  const deleteBlockedDate = useSchoolScheduleStore((s) => s.deleteBlockedDate);
  const resetAvailability = useSchoolScheduleStore((s) => s.resetAvailability);

  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAvailability(teacher.id);
    return resetAvailability;
  }, [teacher.id, fetchAvailability, resetAvailability]);

  // El borrador se sincroniza con lo guardado cada vez que llega de la base.
  useEffect(() => {
    setDraft(
      weekly.map((row) => ({
        key: keyOf(row.weekday, row.start_time),
        weekday: row.weekday,
        start_time: row.start_time,
        end_time: row.end_time,
      }))
    );
  }, [weekly]);

  const rowsByDay = useMemo(
    () => DAYS.map((_, i) => draft.filter((r) => r.weekday === i + WEEKDAY_NUMBER)),
    [draft]
  );

  const upsertRow = (key: string, patch: Partial<AvailabilityInput>) =>
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = (weekday: number) => {
    const empty = draft.filter((r) => r.weekday === weekday && !r.start_time && !r.end_time);
    if (empty.length > 0) return; // ya hay una franja vacía para ese día
    const key = keyOf(weekday, "");
    setDraft((rows) => [...rows, { key, weekday, start_time: "", end_time: "" }]);
  };

  const removeRow = (key: string) => setDraft((rows) => rows.filter((r) => r.key !== key));

  const handleSave = async () => {
    const complete = draft.filter((r) => (r.start_time || r.end_time) && r.key);
    for (const row of complete) {
      if (!row.start_time || !row.end_time) {
        setValidationError("Completá la franja o quitala");
        return;
      }
      if (hoursToMinutes(row.end_time) <= hoursToMinutes(row.start_time)) {
        setValidationError("El horario de fin debe ser después del inicio");
        return;
      }
    }
    setValidationError(null);
    const ok = await saveWeekly(
      teacher.id,
      complete.map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time }))
    );
    if (ok) {
      notifySuccess("Disponibilidad guardada", "La agenda semanal del profesor quedó actualizada.");
      onClose();
    }
  };

  const handleAddBlocked = async () => {
    if (!newDate) return;
    const ok = await createBlockedDate(teacher.id, newDate, newReason.trim() || undefined);
    if (ok) {
      setNewDate("");
      setNewReason("");
    }
  };

  return (
    <SchoolModal
      title={`Disponibilidad — ${teacher.full_name}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="p-6 space-y-6">
        {error && (
          <p className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
        )}
        {validationError && (
          <p className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{validationError}</p>
        )}

        {loading && weekly.length === 0 && draft.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Cargando disponibilidad…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-on-surface">Horario semanal</h3>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Las franjas definen la grilla; después podés bloquear días puntuales.
              </p>
            </div>

            {DAYS.map((dayName, i) => {
              const weekday = i + WEEKDAY_NUMBER;
              const rows = rowsByDay[i] ?? [];
              return (
                <div key={dayName} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-on-surface">{dayName}</span>
                    {rows.length === 0 && (
                      <button
                        type="button"
                        onClick={() => addRow(weekday)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        + Agregar franja
                      </button>
                    )}
                  </div>
                  {rows.map((row) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={row.start_time}
                        onChange={(e) => upsertRow(row.key, { start_time: e.target.value })}
                        aria-label={`${dayName} desde`}
                        className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <span className="text-on-surface-variant">a</span>
                      <input
                        type="time"
                        value={row.end_time}
                        onChange={(e) => upsertRow(row.key, { end_time: e.target.value })}
                        aria-label={`${dayName} hasta`}
                        className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        aria-label={`Quitar franja del ${dayName}`}
                        className="text-xs font-semibold text-on-surface-variant hover:text-error"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="space-y-3 border-t border-outline-variant/10 pt-4">
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Días bloqueados</h3>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  Feriados y ausencias: una serie los saltea y te lo avisa, no los dicta igual.
                </p>
              </div>

              {blockedDates.length > 0 && (
                <ul className="space-y-1.5">
                  {blockedDates.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-on-surface">
                          {new Date(`${b.blocked_date}T00:00:00`).toLocaleDateString("es-CO", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        {b.reason && (
                          <span className="ml-2 text-xs text-on-surface-variant">{b.reason}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteBlockedDate(b.id)}
                        aria-label="Quitar bloqueo"
                        className="text-xs font-semibold text-on-surface-variant hover:text-error"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={newDate}
                  min={toISODate(new Date())}
                  onChange={(e) => setNewDate(e.target.value)}
                  aria-label="Fecha a bloquear"
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="Motivo (opcional)…"
                  className="min-w-0 flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => void handleAddBlocked()}
                  disabled={!newDate || saving}
                  className="rounded-xl bg-surface-container-high px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
                >
                  Bloquear
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-outline-variant/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-outline-variant/30 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar disponibilidad"}
          </button>
        </div>
      </div>
    </SchoolModal>
  );
}