"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import { ShareWhatsAppButton } from "@/components/school/ShareWhatsAppButton";
import { useSchoolScheduleStore } from "@/stores/school-schedule.store";
import { useSchoolClassesStore } from "@/stores/school-classes.store";
import { useSchoolMaterialsStore } from "@/stores/school-materials.store";
import { AttendanceDialog, type AttendanceSelection } from "@/components/school/AttendanceDialog";
import { ConfirmCloseDialog } from "@/components/school/ConfirmCloseDialog";
import { RescheduleDialog } from "@/components/school/RescheduleDialog";
import { notifySuccess } from "@/lib/notifications";
import { sessionConfirmGate } from "@/services/school-classes.service";
import { formatSlotTime } from "@/services/school-schedule.service";
import { buildConfirmLinkUrl } from "@/services/school-materials.service";
import type { SchoolLesson } from "@/services/school-schedule.service";

interface LessonCardProps {
  lesson: SchoolLesson;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programada",
  pending_close: "Por cerrar",
  realized: "Realizada",
  cancelled: "Cancelada",
  rescheduled: "Reprogramada",
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary",
  pending_close: "bg-amber-500/10 text-amber-600",
  realized: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-surface-container text-on-surface-variant",
  rescheduled: "bg-surface-container text-on-surface-variant",
};

/**
 * Una clase del día: horario, profesor, instrumento, salón, cupo y alumnos,
 * más las acciones de operación según el estado:
 *
 * - `scheduled` → Confirmar (solo después de que terminó: compuerta de sesión),
 *   Cancelar, Reprogramar.
 * - `pending_close` → Cerrar clase (asistencia completa + plan de consumo
 *   explícito), Cancelar, Reprogramar.
 * - `realized` / `cancelled` / `rescheduled` → sin acciones.
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
  const confirmLesson = useSchoolClassesStore((s) => s.confirmLesson);
  const cancelLesson = useSchoolClassesStore((s) => s.cancelLesson);
  const classesSaving = useSchoolClassesStore((s) => s.saving);
  const classesError = useSchoolClassesStore((s) => s.error);
  const clearClassesError = useSchoolClassesStore((s) => s.clearError);
  const createConfirmLink = useSchoolMaterialsStore((s) => s.createConfirmLink);
  const materialsSaving = useSchoolMaterialsStore((s) => s.saving);

  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState("");
  const [showAttendance, setShowAttendance] = useState(false);
  const [closeDraft, setCloseDraft] = useState<AttendanceSelection | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [confirmLinkUrl, setConfirmLinkUrl] = useState<string | null>(null);

  const seatsLeft = lesson.capacity - lesson.participants.length;
  const full = seatsLeft <= 0;
  const operational = lesson.status === "scheduled" || lesson.status === "pending_close";
  const confirmGate = sessionConfirmGate(lesson, new Date().toISOString());

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

  const handleConfirm = async () => {
    const ok = await confirmLesson(lesson.id);
    if (ok) {
      notifySuccess("Clase confirmada", "Ya podés cerrarla con la asistencia.");
    }
  };

  const handleCreateConfirmLink = async () => {
    clearClassesError();
    const link = await createConfirmLink(lesson.id);
    if (!link) return;
    setConfirmLinkUrl(buildConfirmLinkUrl(window.location.origin, link.token));
  };

  const handleCancel = async () => {
    clearClassesError();
    const ok = await cancelLesson(lesson.id, cancelReason);
    if (ok) {
      notifySuccess("Clase cancelada", "No se descuenta ninguna clase del saldo.");
      setShowCancel(false);
      setCancelReason("");
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

      {operational && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-outline-variant/10 pt-2">
          {lesson.status === "scheduled" && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!confirmGate.ok || classesSaving}
              title={confirmGate.ok ? undefined : `No disponible: ${confirmGate.reason}`}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
            >
              Confirmar
            </button>
          )}
          {lesson.status === "pending_close" && (
            <button
              type="button"
              onClick={() => {
                clearClassesError();
                setShowAttendance(true);
              }}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-dim"
            >
              Cerrar clase
            </button>
          )}
          {lesson.status === "scheduled" && (
            <button
              type="button"
              onClick={() => void handleCreateConfirmLink()}
              disabled={materialsSaving}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface disabled:opacity-50"
            >
              Enlace de confirmación
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => setShowReschedule(true)}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            Reprogramar
          </button>
        </div>
      )}

      {showAttendance && (
        <AttendanceDialog
          lesson={lesson}
          onClose={() => setShowAttendance(false)}
          onContinue={(sel) => {
            setShowAttendance(false);
            setCloseDraft(sel);
          }}
        />
      )}

      {closeDraft && (
        <ConfirmCloseDialog
          lesson={lesson}
          rows={closeDraft.rows}
          entries={closeDraft.entries}
          onClose={() => setCloseDraft(null)}
          onDone={() => setCloseDraft(null)}
        />
      )}

      {showReschedule && (
        <RescheduleDialog
          mode="request"
          lesson={lesson}
          onClose={() => setShowReschedule(false)}
          onDone={() => setShowReschedule(false)}
        />
      )}

      {confirmLinkUrl && (
        <SchoolModal title="Enlace de confirmación" onClose={() => setConfirmLinkUrl(null)}>
          <div className="space-y-3 p-6 pt-4">
            <p className="text-xs text-on-surface-variant">
              Válido por 24 h y de un solo uso. Compartilo con el profesor para que confirme
              la clase sin entrar al sistema; un GET (como el preview de WhatsApp) nunca la
              confirma — solo confirma si el profesor toca el botón de la página.
            </p>
            <p className="break-all rounded-xl bg-surface-container-low p-3 text-xs text-on-surface-variant">
              {confirmLinkUrl}
            </p>
            <ShareWhatsAppButton
              message={`Confirmá la clase de ${lesson.instrument} del ${formatSlotTime(lesson.start_at)}: ${confirmLinkUrl}`}
            />
          </div>
        </SchoolModal>
      )}

      {showCancel && (
        <SchoolModal title="Cancelar clase" onClose={() => setShowCancel(false)}>
          <div className="space-y-4 p-6 pt-4">
            <p className="text-sm font-semibold text-on-surface-variant">
              {lesson.instrument} · {formatSlotTime(lesson.start_at)}–{formatSlotTime(lesson.end_at)}
            </p>
            <p className="text-xs text-on-surface-variant">
              Cancelar no descuenta ninguna clase de los saldos. El motivo queda
              registrado (obligatorio).
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej.: el profesor avisó que no puede asistir"
              rows={3}
              className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
            {classesError && <p className="text-xs font-medium text-error">{classesError}</p>}
            <div className="flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowCancel(false);
                  setCancelReason("");
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={!cancelReason.trim() || classesSaving}
                className="rounded-lg bg-error px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {classesSaving ? "Cancelando…" : "Cancelar clase"}
              </button>
            </div>
          </div>
        </SchoolModal>
      )}
    </div>
  );
}