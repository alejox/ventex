"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolScheduleStore } from "@/stores/school-schedule.store";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { useSchoolStore } from "@/stores/school.store";
import { tsAtUtc, fmtSessionDate } from "@/services/school-schedule.service";
import { toISODate } from "@/lib/date";
import { notifySuccess } from "@/lib/notifications";
import { SCHOOL_DAYS, localWeekdayOf } from "@/components/school/format";

interface SeriesDialogProps {
  onClose: () => void;
}

/**
 * Programador de series semanales.
 *
 * El flujo es PREVIEW → GENERAR, y el preview es el mismo RPC que se va a
 * llamar (con los datos reales de la base): las fechas bloqueadas se muestran
 * como omitidas —avisadas, nunca silenciosas— y si hay UN conflicto de
 * horario la generación queda bloqueada hasta resolverlo. Generar "a medias"
 * escondería un choque detrás de una serie exitosa.
 */
export function SeriesDialog({ onClose }: SeriesDialogProps) {
  const enrollmentViews = useSchoolScheduleStore((s) => s.enrollmentViews);
  const fetchEnrollmentViews = useSchoolScheduleStore((s) => s.fetchEnrollmentViews);
  const seriesDraft = useSchoolScheduleStore((s) => s.seriesDraft);
  const previewSeries = useSchoolScheduleStore((s) => s.previewSeries);
  const scheduleSeries = useSchoolScheduleStore((s) => s.scheduleSeries);
  const saving = useSchoolScheduleStore((s) => s.saving);
  const error = useSchoolScheduleStore((s) => s.error);

  const teachers = useSchoolPeopleStore((s) => s.teachers);
  const fetchTeachers = useSchoolPeopleStore((s) => s.fetchTeachers);
  const settings = useSchoolStore((s) => s.settings);

  const [enrollmentId, setEnrollmentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [firstDate, setFirstDate] = useState(() => nextDateForWeekday(1));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [countMode, setCountMode] = useState<"count" | "until">("count");
  const [count, setCount] = useState(8);
  const [untilDate, setUntilDate] = useState("");
  const [room, setRoom] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (enrollmentViews.length === 0) void fetchEnrollmentViews();
    if (teachers.length === 0) void fetchTeachers();
  }, [enrollmentViews.length, teachers.length, fetchEnrollmentViews, fetchTeachers]);

  const selectedEnrollment = useMemo(
    () => enrollmentViews.find((v) => v.enrollment_id === enrollmentId) ?? null,
    [enrollmentViews, enrollmentId]
  );

  // El instrumento viene de la matrícula; el profesor tiene que dictarlo.
  const instrument = selectedEnrollment?.instrument ?? "";
  const compatibleTeachers = useMemo(
    () => teachers.filter((t) => t.instruments.includes(instrument)),
    [teachers, instrument]
  );

  const pickEnrollment = (id: string) => {
    setEnrollmentId(id);
    setTeacherId("");
    setFormError(null);
  };

  const hasCount = countMode === "count" ? count > 0 : untilDate.length > 0;
  const previewReady =
    Boolean(enrollmentId) &&
    Boolean(teacherId) &&
    Boolean(firstDate) &&
    Boolean(startTime) &&
    Boolean(endTime) &&
    hasCount;

  const handlePreview = async () => {
    if (!previewReady) return;
    setFormError(null);
    await previewSeries({
      enrollment_id: enrollmentId,
      teacher_profile_id: teacherId,
      instrument,
      firstDate,
      weekday,
      startTime,
      endTime,
      count: countMode === "count" ? count : undefined,
      untilDate: countMode === "until" ? untilDate : undefined,
      room: room || null,
    });
  };

  const handleGenerate = async () => {
    if (!seriesDraft || seriesDraft.conflicts.length > 0) return;
    const result = await scheduleSeries({
      enrollment_id: enrollmentId,
      teacher_profile_id: teacherId,
      instrument,
      first_at: tsAtUtc(firstDate, startTime),
      end_time: endTime,
      weekday,
      count: countMode === "count" ? count : undefined,
      until_date: countMode === "until" ? untilDate : undefined,
      room: room || null,
    });
    if (result && result.conflicts.length === 0 && result.created.length > 0) {
      notifySuccess(
        "Serie programada",
        `${result.created.length} clases desde ${fmtSessionDate(result.created[0]!.date)}.`
      );
      onClose();
    }
  };

  const displayDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  return (
    <SchoolModal title="Programar serie semanal" onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-5">
        {(error || formError) && (
          <p className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{formError ?? error}</p>
        )}

        <div className="space-y-3">
          <Select
            label="Alumno y matrícula"
            value={enrollmentId}
            onChange={(e) => pickEnrollment(e.target.value)}
            searchable
            searchPlaceholder="Buscar alumno…"
            hint="Matrículas activas con clases disponibles."
          >
            <option value="">Seleccionar…</option>
            {enrollmentViews.map((v) => (
              <option key={v.enrollment_id} value={v.enrollment_id} disabled={v.programmable <= 0}>
                {v.student_name} · {v.instrument} — {v.programmable} de {v.contracted} disponibles
              </option>
            ))}
          </Select>
          {enrollmentViews.length === 0 && (
            <p className="text-xs text-on-surface-variant">
              No hay matrículas activas con clases disponibles para agendar.
            </p>
          )}

          <Select
            label="Profesor"
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setFormError(null);
            }}
            searchable
            searchPlaceholder="Buscar profesor…"
            hint={instrument ? `Profesores que dictan ${instrument}.` : undefined}
          >
            <option value="">Seleccionar…</option>
            {compatibleTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
          {instrument && compatibleTeachers.length === 0 && (
            <p className="text-xs text-on-surface-variant">
              Ningún profesor dicta {instrument}. Agregalo en su perfil.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Día de la semana" value={String(weekday)} onChange={(e) => setWeekday(Number(e.target.value))}>
              {SCHOOL_DAYS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface">Primera clase</label>
              <input
                type="date"
                value={firstDate}
                min={toISODate(new Date())}
                onChange={(e) => setFirstDate(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface">Inicio</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface">Fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl bg-surface-container-low p-3">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setCountMode("count")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  countMode === "count" ? "bg-primary text-white" : "bg-surface-container-lowest text-on-surface-variant"
                }`}
              >
                Por cantidad
              </button>
              <button
                type="button"
                onClick={() => setCountMode("until")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  countMode === "until" ? "bg-primary text-white" : "bg-surface-container-lowest text-on-surface-variant"
                }`}
              >
                Hasta una fecha
              </button>
            </div>
            {countMode === "count" ? (
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-on-surface">Cantidad de clases</label>
                <input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-24 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-on-surface">Última clase</label>
                <input
                  type="date"
                  value={untilDate}
                  min={firstDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>

          <Select label="Salón" value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Sin salón</option>
            {settings.rooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>

        {seriesDraft && (
          <div className="space-y-2 rounded-xl border border-outline-variant/10 p-3">
            {seriesDraft.conflicts.length > 0 && (
              <div className="rounded-xl bg-error/10 p-3">
                <p className="text-sm font-semibold text-error">
                  No se puede generar: hay clases que chocan con el horario
                </p>
                <ul className="mt-1.5 space-y-0.5 text-xs text-error/90">
                  {seriesDraft.conflicts.map((c) => (
                    <li key={c.date}>
                      {displayDate(c.date)} · {c.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {seriesDraft.skipped.length > 0 && (
              <div className="rounded-xl bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-600">
                  Estas fechas están bloqueadas y se saltearán:
                </p>
                <p className="mt-1 text-xs text-amber-600/90">
                  {seriesDraft.skipped.map(displayDate).join(", ")}
                </p>
              </div>
            )}
            {seriesDraft.sessions.length > 0 && (
              <p className="text-sm text-emerald-600">
                Se generarán {seriesDraft.sessions.length}{" "}
                {seriesDraft.sessions.length === 1 ? "clase" : "clases"} desde{" "}
                {displayDate(seriesDraft.sessions[0]!.date)} hasta{" "}
                {displayDate(seriesDraft.sessions[seriesDraft.sessions.length - 1]!.date)}.
              </p>
            )}
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
            onClick={() => void handlePreview()}
            disabled={!previewReady || saving}
            className="rounded-xl border border-primary/40 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            Previsualizar
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!seriesDraft || seriesDraft.conflicts.length > 0 || saving}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Generando…" : "Generar serie"}
          </button>
        </div>
      </div>
    </SchoolModal>
  );
}

/** La próxima fecha local que cae en `weekday` (hoy inclusive si coincide). */
function nextDateForWeekday(weekday: number): string {
  const today = new Date();
  const todayIso = localWeekdayOf(today);
  const diff = weekday - todayIso;
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
  return toISODate(target);
}