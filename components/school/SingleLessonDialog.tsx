"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { useSchoolScheduleStore } from "@/stores/school-schedule.store";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { useSchoolStore } from "@/stores/school.store";
import { tsAtUtc, hoursToMinutes, minutesToTime } from "@/services/school-schedule.service";
import { fetchLessonPlans } from "@/services/school-enrollments.service";
import type { LessonPlan } from "@/services/school-enrollments.service";
import { toISODate } from "@/lib/date";
import { notifySuccess } from "@/lib/notifications";

interface SingleLessonDialogProps {
  onClose: () => void;
}

/** Duración por defecto cuando el plan de la matrícula no se pudo resolver. */
const DEFAULT_DURATION_MINUTES = 60;

/**
 * Agenda UNA clase suelta, sin serie: el mismo `enrollmentViews` y el mismo
 * filtro profesor-compatible-con-instrumento que `SeriesDialog`, pero solo con
 * los campos que `scheduleLesson` necesita — fecha y hora de inicio, no un
 * plan de repetición. La duración se deriva del plan de la matrícula (mismo
 * criterio de "clase" que el plan) y se muestra, no se pide.
 */
export function SingleLessonDialog({ onClose }: SingleLessonDialogProps) {
  const enrollmentViews = useSchoolScheduleStore((s) => s.enrollmentViews);
  const fetchEnrollmentViews = useSchoolScheduleStore((s) => s.fetchEnrollmentViews);
  const scheduleLesson = useSchoolScheduleStore((s) => s.scheduleLesson);
  const saving = useSchoolScheduleStore((s) => s.saving);
  const error = useSchoolScheduleStore((s) => s.error);

  const teachers = useSchoolPeopleStore((s) => s.teachers);
  const fetchTeachers = useSchoolPeopleStore((s) => s.fetchTeachers);
  const settings = useSchoolStore((s) => s.settings);

  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [room, setRoom] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void fetchEnrollmentViews();
    if (teachers.length === 0) void fetchTeachers();
    void fetchLessonPlans().then(setPlans).catch(() => {});
  }, [fetchEnrollmentViews, teachers.length, fetchTeachers]);

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

  // La duración sale del plan contratado (mismo nombre congelado en la
  // matrícula); si no se encuentra —plan archivado o renombrado— se cae a una
  // hora, el mismo default que trae `SeriesDialog`.
  const durationMinutes = useMemo(() => {
    const plan = plans.find((p) => p.name === selectedEnrollment?.plan_name);
    return plan?.duration_minutes ?? DEFAULT_DURATION_MINUTES;
  }, [plans, selectedEnrollment]);

  const endTime = useMemo(
    () => minutesToTime(hoursToMinutes(startTime) + durationMinutes),
    [startTime, durationMinutes]
  );

  const pickEnrollment = (id: string) => {
    setEnrollmentId(id);
    setTeacherId("");
    setFormError(null);
  };

  const ready = Boolean(enrollmentId) && Boolean(teacherId) && Boolean(date) && Boolean(startTime);

  const handleSubmit = async () => {
    if (!ready) return;
    setFormError(null);
    const ok = await scheduleLesson({
      enrollment_id: enrollmentId,
      teacher_profile_id: teacherId,
      instrument,
      start_at: tsAtUtc(date, startTime),
      end_at: tsAtUtc(date, endTime),
      room: room || null,
    });
    if (ok) {
      notifySuccess("Clase agendada", `${selectedEnrollment?.student_name} · ${instrument}`);
      onClose();
    }
  };

  return (
    <SchoolModal title="Agendar clase" onClose={onClose} maxWidth="max-w-lg">
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
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface">Fecha</label>
              <input
                type="date"
                value={date}
                min={toISODate(new Date())}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-on-surface">Inicio</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <p className="text-xs text-on-surface-variant">
            Termina a las {endTime} ({durationMinutes} min, según el plan).
          </p>

          <Select label="Salón" value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Sin salón</option>
            {settings.rooms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>

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
            onClick={() => void handleSubmit()}
            disabled={!ready || saving}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Agendando…" : "Agendar clase"}
          </button>
        </div>
      </div>
    </SchoolModal>
  );
}
