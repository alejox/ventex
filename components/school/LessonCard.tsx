"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { useSchoolScheduleStore } from "@/stores/school-schedule.store";
import { formatSlotTime } from "@/services/school-schedule.service";
import type { SchoolLesson } from "@/services/school-schedule.service";

interface LessonCardProps {
  lesson: SchoolLesson;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programada",
  pending_close: "Por cerrar",
  realized: "Realizada",
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary",
  pending_close: "bg-amber-500/10 text-amber-600",
  realized: "bg-emerald-500/10 text-emerald-600",
};

/**
 * Una clase del día: horario, profesor, instrumento, salón, cupo y alumnos.
 *
 * La capacidad es POR CLASE (`capacity` de la lección): una individual no
 * admite segundo alumno y el RPC `school_add_participant` lo rechaza; el
 * menú de "Agregar alumno" devuelve el error tal cual, porque el cupo no es
 * del cliente decidirlo.
 */
export function LessonCard({ lesson }: LessonCardProps) {
  const eligibleOptions = useSchoolScheduleStore((s) => s.eligibleOptions);
  const fetchEligibleOptions = useSchoolScheduleStore((s) => s.fetchEligibleOptions);
  const addParticipant = useSchoolScheduleStore((s) => s.addParticipant);
  const saving = useSchoolScheduleStore((s) => s.saving);

  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState("");

  const seatsLeft = lesson.capacity - lesson.participants.length;
  const full = seatsLeft <= 0;

  const openAdd = () => {
    setChosen("");
    setAdding(true);
    void fetchEligibleOptions(lesson.id);
  };

  const handleAdd = async () => {
    if (!chosen) return;
    const ok = await addParticipant(lesson.id, chosen);
    if (ok) {
      setAdding(false);
      setChosen("");
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-on-surface">
          {formatSlotTime(lesson.start_at)}–{formatSlotTime(lesson.end_at)}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            STATUS_STYLE[lesson.status] ?? "bg-surface-container text-on-surface-variant"
          }`}
        >
          {STATUS_LABEL[lesson.status] ?? lesson.status}
        </span>
      </div>

      <p className="mt-1 text-sm text-on-surface">{lesson.instrument}</p>
      <p className="text-xs text-on-surface-variant">{lesson.teacher_name}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lesson.room && (
          <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] text-on-surface-variant">
            {lesson.room}
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            full ? "bg-error/10 text-error" : "bg-surface-container-low text-on-surface-variant"
          }`}
        >
          {lesson.participants.length}/{lesson.capacity} {lesson.participants.length === 1 ? "alumno" : "alumnos"}
        </span>
      </div>

      {lesson.participants.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {lesson.participants.map((p) => (
            <li key={p.participant_id} className="text-xs text-on-surface-variant">
              · {p.student_name}
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="mt-2 text-[11px] font-medium text-error">Cupo completo</p>
      ) : adding ? (
        <div className="mt-2 space-y-2 border-t border-outline-variant/10 pt-2">
          <Select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            searchable
            searchPlaceholder="Buscar alumno…"
            label="Agregar alumno"
          >
            <option value="">Seleccionar…</option>
            {eligibleOptions.map((o) => (
              <option key={o.enrollment_id} value={o.enrollment_id}>
                {o.student_name} · {o.instrument} ({o.balance} clases)
              </option>
            ))}
          </Select>
          {eligibleOptions.length === 0 && (
            <p className="text-xs text-on-surface-variant">
              No hay matrículas activas de {lesson.instrument} con clases disponibles.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!chosen || saving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
            >
              {saving ? "Agregando…" : "Agregar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openAdd}
          className="mt-2 text-xs font-semibold text-primary transition-colors hover:underline"
        >
          + Agregar alumno
        </button>
      )}
    </div>
  );
}