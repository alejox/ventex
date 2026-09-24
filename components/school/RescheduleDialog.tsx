"use client";

import { useEffect, useState } from "react";
import { SchoolModal } from "@/components/school/SchoolModal";
import { CollectionLoading, CollectionError } from "@/components/CollectionState";
import { Select } from "@/components/ui/Select";
import { useSchoolClassesStore } from "@/stores/school-classes.store";
import { notifySuccess } from "@/lib/notifications";
import { formatShortDate } from "@/components/school/format";
import { formatSlotTime } from "@/services/school-schedule.service";
import type { PendingRescheduleRequest } from "@/services/school-classes.service";
import type { SchoolLesson } from "@/services/school-schedule.service";

interface RescheduleDialogProps {
  mode: "request" | "decide";
  /** Requerido en modo `request`: la clase que se quiere reprogramar. */
  lesson?: SchoolLesson;
  onDone: () => void;
  onClose: () => void;
}

const REQUESTER_LABEL: Record<PendingRescheduleRequest["requester_kind"], string> = {
  coordinator: "Coordinación",
  guardian: "Adulto responsable",
  student: "Alumno",
};

/** Fecha-hora legible para el texto de WhatsApp ("jue 24 sep a las 15:00"). */
function humanSlot(iso: string): string {
  return `${new Date(iso).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })} a las ${new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

const shareTextOf = (req: PendingRescheduleRequest, newStartAt: string) =>
  `Cambio de horario: la clase de ${req.instrument}${
    req.group_request ? "" : ` de ${req.student_name}`
  } pasa de ${humanSlot(req.old_start_at)} a ${humanSlot(newStartAt)}.`;

/**
 * Reprogramación de una clase, dos caras:
 *
 * - `request` (desde la tarjeta de la clase): el coordinador elige el alumno
 *   (en grupo, la clase se mantiene y solo se mueve esa participación) y deja
 *   el motivo. El pedido PENDIENTE conserva la reserva del horario original.
 * - `decide` (desde la agenda): la lista de pedidos pendientes con aprobar
 *   (con fecha nueva, validada; o sin fecha, liberando el hueco con derecho de
 *   reponer) y rechazar con motivo. Después de aprobar con fecha se ofrece
 *   compartir el cambio por WhatsApp (manual, enlace `wa.me` sin plantilla).
 *
 * El RPC `school_approve_reschedule` es quien valida choques, sube la versión
 * (invalida los enlaces viejos de confirmación), mueve participaciones y
 * notifica; acá solo se le pide y se muestra el resultado.
 */
export function RescheduleDialog({ mode, lesson, onDone, onClose }: RescheduleDialogProps) {
  const requestReschedule = useSchoolClassesStore((s) => s.requestReschedule);
  const approveReschedule = useSchoolClassesStore((s) => s.approveReschedule);
  const rejectReschedule = useSchoolClassesStore((s) => s.rejectReschedule);
  const fetchPendingRescheduleRequests = useSchoolClassesStore(
    (s) => s.fetchPendingRescheduleRequests
  );
  const pending = useSchoolClassesStore((s) => s.pendingRescheduleRequests);
  const loading = useSchoolClassesStore((s) => s.loading);
  const saving = useSchoolClassesStore((s) => s.saving);
  const error = useSchoolClassesStore((s) => s.error);
  const clearError = useSchoolClassesStore((s) => s.clearError);

  // ---- modo request ----
  const participate = lesson?.participants ?? [];
  const [participantId, setParticipantId] = useState(() =>
    participate.length === 1 ? participate[0].participant_id : ""
  );
  const [requestReason, setRequestReason] = useState("");

  // ---- modo decide ----
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [shared, setShared] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "decide") void fetchPendingRescheduleRequests();
  }, [mode, fetchPendingRescheduleRequests]);

  const submitRequest = async () => {
    if (!lesson || !participantId) return;
    const ok = await requestReschedule({
      lessonId: lesson.id,
      participantId,
      reason: requestReason,
      requesterKind: "coordinator",
    });
    if (!ok) return;
    notifySuccess(
      "Solicitud de reprogramación enviada",
      "El horario original queda reservado hasta la decisión."
    );
    onDone();
  };

  const openApprove = (req: PendingRescheduleRequest) => {
    clearError();
    const durationMs = Date.parse(req.old_end_at) - Date.parse(req.old_start_at);
    const start = new Date(Date.parse(req.old_start_at) + 7 * 86400000);
    setNewStartAt(toLocalInput(start));
    setNewEndAt(toLocalInput(new Date(start.getTime() + durationMs)));
    setApproving(req.id);
    setExpanded(req.id);
  };

  const confirmApprove = async (req: PendingRescheduleRequest) => {
    const startIso = new Date(newStartAt).toISOString();
    clearError();
    const ok = await approveReschedule(req.id, {
      startAt: startIso,
      endAt: new Date(newEndAt).toISOString(),
    });
    if (!ok) return;
    notifySuccess("Reprogramación aprobada", "La clase nueva quedó en la agenda.");
    setShared(req.id);
  };

  const confirmApproveOpen = async (req: PendingRescheduleRequest) => {
    clearError();
    const ok = await approveReschedule(req.id);
    if (!ok) return;
    notifySuccess(
      "Reprogramación aprobada sin fecha",
      "Se liberó el hueco; el alumno conserva el derecho de reponer la clase."
    );
    onDone();
  };

  const confirmReject = async (req: PendingRescheduleRequest) => {
    clearError();
    const ok = await rejectReschedule(req.id, rejectReason);
    if (!ok) return;
    notifySuccess("Reprogramación rechazada", "La clase conserva su horario original.");
    setRejecting(null);
    setExpanded(null);
    setRejectReason("");
  };

  return (
    <SchoolModal
      title={mode === "request" ? "Reprogramar clase" : "Reprogramaciones pendientes"}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 p-6 pt-4">
        {mode === "request" && lesson && (
          <>
            <p className="text-sm font-semibold text-on-surface-variant">
              {lesson.instrument} · {formatShortDate(lesson.start_at)} {formatSlotTime(lesson.start_at)}–
              {formatSlotTime(lesson.end_at)}
            </p>
            {participate.length === 0 ? (
              <p className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
                La clase no tiene alumnos. Primero agregá al alumno desde la tarjeta.
              </p>
            ) : (
              <>
                {participate.length > 1 && (
                  <Select
                    value={participantId}
                    onChange={(e) => setParticipantId(e.target.value)}
                    label="Alumno que reprograma"
                  >
                    <option value="">Seleccionar…</option>
                    {participate.map((p) => (
                      <option key={p.participant_id} value={p.participant_id}>
                        {p.student_name}
                      </option>
                    ))}
                  </Select>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant">
                    Motivo (obligatorio)
                  </label>
                  <textarea
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Ej.: el profesor tiene un concierto esa tarde"
                    rows={3}
                    className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                  />
                  {participate.length > 1 && (
                    <p className="text-xs text-on-surface-variant">
                      En una clase grupal se mueve SOLO la participación de este alumno;
                      el resto del grupo conserva el horario.
                    </p>
                  )}
                </div>
                {error && <p className="text-xs font-medium text-error">{error}</p>}
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
                    onClick={() => void submitRequest()}
                    disabled={!participantId || !requestReason.trim() || saving}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
                  >
                    {saving ? "Enviando…" : "Enviar solicitud"}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {mode === "decide" && (
          <>
            {loading && pending.length === 0 ? (
              <CollectionLoading label="Cargando solicitudes…" />
            ) : pending.length === 0 ? (
              <p className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
                No hay reprogramaciones pendientes.
              </p>
            ) : (
              <ul className="space-y-3">
                {pending.map((req) => (
                  <li
                    key={req.id}
                    className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-on-surface">
                          {req.group_request ? "Todo el grupo" : req.student_name}
                          <span className="ml-2 text-xs font-semibold text-primary">{req.instrument}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-on-surface-variant">
                          {req.teacher_name} · {formatShortDate(req.old_start_at)}{" "}
                          {formatSlotTime(req.old_start_at)}–{formatSlotTime(req.old_end_at)} ·{" "}
                          {REQUESTER_LABEL[req.requester_kind]}
                        </p>
                        <p className="mt-1 text-xs text-on-surface">{req.reason}</p>
                      </div>
                      {expanded === req.id ? null : (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => openApprove(req)}
                            className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-dim"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => void confirmApproveOpen(req)}
                            disabled={saving}
                            className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
                          >
                            Sin fecha
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejecting(req.id);
                              setExpanded(req.id);
                              setRejectReason("");
                            }}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-error transition-colors hover:bg-error/10"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>

                    {expanded === req.id && approving === req.id && (
                      <div className="mt-3 space-y-2 border-t border-outline-variant/10 pt-3">
                        <p className="text-xs font-semibold text-on-surface-variant">
                          Nueva fecha y horario
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            type="datetime-local"
                            value={newStartAt}
                            onChange={(e) => setNewStartAt(e.target.value)}
                            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                          />
                          <input
                            type="datetime-local"
                            value={newEndAt}
                            onChange={(e) => setNewEndAt(e.target.value)}
                            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                          />
                        </div>
                        {error && <p className="text-xs font-medium text-error">{error}</p>}
                        <div className="flex flex-wrap justify-end gap-2">
                          {shared === req.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    `https://wa.me/?text=${encodeURIComponent(shareTextOf(req, new Date(newStartAt).toISOString()))}`,
                                    "_blank",
                                    "noopener"
                                  )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                              >
                                Compartir cambio por WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={onDone}
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dim"
                              >
                                Listo
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setApproving(null);
                                  setExpanded(null);
                                }}
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
                              >
                                Volver
                              </button>
                              <button
                                type="button"
                                onClick={() => void confirmApprove(req)}
                                disabled={
                                  saving || !newStartAt || !newEndAt || newEndAt <= newStartAt
                                }
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
                              >
                                {saving ? "Aprobando…" : "Aprobar con esta fecha"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {expanded === req.id && rejecting === req.id && (
                      <div className="mt-3 space-y-2 border-t border-outline-variant/10 pt-3">
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Motivo del rechazo (obligatorio)"
                          rows={2}
                          className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                        />
                        {error && <p className="text-xs font-medium text-error">{error}</p>}
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRejecting(null);
                              setExpanded(null);
                            }}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
                          >
                            Volver
                          </button>
                          <button
                            type="button"
                            onClick={() => void confirmReject(req)}
                            disabled={saving || !rejectReason.trim()}
                            className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                          >
                            {saving ? "Rechazando…" : "Confirmar rechazo"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {error && pending.length > 0 && (
              <CollectionError message={error} onRetry={() => void fetchPendingRescheduleRequests()} />
            )}
          </>
        )}
      </div>
    </SchoolModal>
  );
}

/** Instante → valor para `<input type="datetime-local">` (hora local, sin TZ). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}