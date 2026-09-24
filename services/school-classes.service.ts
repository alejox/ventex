import { toMessage } from "@/lib/errors";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/utils/supabase/database.types";

// ============================================================================
// Operación de clases: confirmar, cerrar, cancelar y reprogramar.
//
// Las reglas del negocio viven en la parte PURA de este archivo (sin I/O): la
// matriz de consumo de la política CONGELADA, el plan de consumo de un cierre,
// la derivación de "clases por cerrar" y las compuertas de confirmación por
// sesión y por enlace. La base es la autoritativa (los RPC `school_*` de la
// migración 0100 re-validan bajo lock); esta copia es para decidir y mostrar
// en el cliente, y para los tests sin base.
// ============================================================================

// ---- Tipos del dominio de operación ----

/** Estados de asistencia que el coordinador puede registrar en el cierre. */
export type AttendanceStatus = "attended" | "absent" | "justified";

/** Fila de cierre: quién participa y qué consume según la política congelada. */
export interface CloseParticipantRow {
  participant_id: string;
  enrollment_id: string;
  student_name: string;
  attendance_status: AttendanceStatus | "pending";
  /** Estado de la MATRÍCULA al cerrar: solo `active` consume. */
  enrollment_status: string;
  /** Política congelada al matricular: ¿la inasistencia injustificada consume? */
  policy_consume_on_unjustified_absence: boolean;
}

/** Un movimiento de consumo que el cierre va a escribir (-1 por participante). */
export interface ConsumptionMovement {
  participant_id: string;
  enrollment_id: string;
  amount: number;
}

/** Entrada de asistencia que viaja en el jsonb del RPC `school_close_lesson`. */
export interface AttendanceEntry {
  participant_id: string;
  status: AttendanceStatus;
  observation?: string;
}

/** Candidata a cierre: lo único que la derivación necesita leer de la clase. */
export interface PendingCloseCandidate {
  id: string;
  status: string;
  instrument: string;
  start_at: string;
  end_at: string;
  confirmed_at: string | null;
}

/** Resultado de una compuerta: ok, o el motivo en español de por qué no. */
export interface GateResult {
  ok: boolean;
  reason?: string;
}

// ============================================================================
// Matriz de consumo (pura; espejo del RPC `school_close_lesson`)
// ============================================================================

/**
 * Decisión de consumo de UNA fila de asistencia:
 *
 * - `attended` → consume 1 (‑1).
 * - `absent` → consume 1 SOLO si la política CONGELADA de la matrícula lo
 *   contempla. Una inasistencia justificada y una clase cancelada por la
 *   escuela/coordinador NUNCA consumen.
 * - `justified` → 0: el derecho a reponer queda en el saldo.
 * - Matrícula no `active` → 0 siempre (una matrícula vencida no consume).
 *
 * La política entra como PARÁMETRO congelado y no se lee de `school_settings`:
 * editar la política del negocio es un cambio hacia adelante, nunca retroactivo
 * sobre contratos ya firmados (mismo precedente que `promo_redemptions`).
 */
export function consumptionAmountOf(row: {
  attendance_status: string;
  enrollment_status: string;
  policy_consume_on_unjustified_absence: boolean;
}): -1 | 0 {
  if (row.enrollment_status !== "active") return 0;
  if (row.attendance_status === "attended") return -1;
  if (row.attendance_status === "absent" && row.policy_consume_on_unjustified_absence) {
    return -1;
  }
  return 0;
}

/**
 * Plan de consumo de un cierre completo: UNA fila de movimiento por
 * participante que consume, en el orden de la lista. Es lo que el RPC va a
 * escribir; este espejo sirve para AVISAR en el diálogo de confirmación antes
 * de cerrar (el cierre es explícito, nunca silencioso).
 */
export function consumptionPlanOf(
  rows: Pick<
    CloseParticipantRow,
    | "participant_id"
    | "enrollment_id"
    | "attendance_status"
    | "enrollment_status"
    | "policy_consume_on_unjustified_absence"
  >[]
): ConsumptionMovement[] {
  const plan: ConsumptionMovement[] = [];
  for (const row of rows) {
    if (consumptionAmountOf(row) === -1) {
      plan.push({ participant_id: row.participant_id, enrollment_id: row.enrollment_id, amount: -1 });
    }
  }
  return plan;
}

/** Arma el jsonb de asistencia del RPC (observaciones en blanco no viajan). */
export function attendancePayloadOf(entries: AttendanceEntry[]): Record<string, unknown>[] {
  return entries.map((e) => ({
    participant_id: e.participant_id,
    status: e.status,
    ...(e.observation?.trim() ? { observation: e.observation.trim() } : {}),
  }));
}

/**
 * Decodifica la respuesta del RPC `school_close_lesson`. La idempotencia del
 * doble clic es CONTRATO: la segunda llamada devuelve `{alreadyClosed: true}`
 * sin tocar nada, y el cliente lo trata como éxito silencioso. Este mapper es
 * el espejo puro de ese contrato — la base es quien lo cumple de verdad.
 */
export function closeResultOf(raw: {
  alreadyClosed?: unknown;
  id?: unknown;
  status?: unknown;
  participants?: unknown;
  consumed?: unknown;
}): { id: string | null; status: string | null; alreadyClosed: boolean; participants: number; consumed: number } {
  return {
    id: typeof raw.id === "string" ? raw.id : null,
    status: typeof raw.status === "string" ? raw.status : null,
    alreadyClosed: raw.alreadyClosed === true,
    participants: typeof raw.participants === "number" ? raw.participants : 0,
    consumed: typeof raw.consumed === "number" ? raw.consumed : 0,
  };
}

// ============================================================================
// Clases por cerrar (pura; derivada, NUNCA transicionada)
// ============================================================================

/**
 * Clases por cerrar: `scheduled` + sin confirmar + ya terminadas. Es una
 * DERIVACIÓN que solo MUESTRA la lista (superficie de alerta para el resumen y
 * la agenda); nada pasa de estado automáticamente — confirmar es un acto
 * explícito del coordinador.
 */
export function pendingCloseLessonsOf(
  lessons: PendingCloseCandidate[],
  nowIso: string
): PendingCloseCandidate[] {
  return lessons
    .filter(
      (l) => l.status === "scheduled" && l.confirmed_at == null && l.end_at < nowIso
    )
    .sort((a, b) => a.end_at.localeCompare(b.end_at));
}

// ============================================================================
// Compuertas de confirmación (pura; sesión vs. enlace)
// ============================================================================

/**
 * Compuerta de la confirmación por SESIÓN (espejo de `school_confirm_lesson`):
 * la clase debe estar programada y ya terminada. El RPC re-valida bajo lock;
 * esto es para habilitar el botón y avisar temprano.
 */
export function sessionConfirmGate(
  lesson: { status: string; end_at: string },
  nowIso: string
): GateResult {
  if (lesson.status !== "scheduled") {
    return { ok: false, reason: "la clase no está programada" };
  }
  if (nowIso < lesson.end_at) {
    return { ok: false, reason: "la clase todavía no terminó" };
  }
  return { ok: true };
}

/**
 * Compuerta del enlace de confirmación (espejo de `school_confirm_lesson_by_token`).
 *
 * La regla de VERSIÓN es la que invalida los enlaces viejos: al aprobarse una
 * reprogramación, el RPC sube `version` y revoca los enlaces del horario
 * original; acá la compuerta falla cerrada ante cualquiera de los dos caminos.
 */
export function linkConfirmGate(
  link: {
    purpose: string;
    revoked_at: string | null;
    used_at: string | null;
    expires_at: string;
    version: number;
  },
  lesson: { version: number; status: string; end_at: string },
  nowIso: string
): GateResult {
  if (link.purpose !== "teacher_confirm") {
    return { ok: false, reason: "el enlace no es de confirmación" };
  }
  if (link.revoked_at != null || link.used_at != null) {
    return { ok: false, reason: "el enlace fue revocado o ya se usó" };
  }
  if (link.expires_at <= nowIso) {
    return { ok: false, reason: "el enlace venció" };
  }
  if (link.version !== lesson.version) {
    return { ok: false, reason: "la clase cambió; pedí un enlace nuevo" };
  }
  if (lesson.status !== "scheduled") {
    return { ok: false, reason: "la clase no está programada" };
  }
  if (nowIso < lesson.end_at) {
    return { ok: false, reason: "la clase todavía no terminó" };
  }
  return { ok: true };
}

// ============================================================================
// Errores amigables de operación
// ============================================================================

/**
 * Traduce el error crudo del RPC a un mensaje que entiende el usuario. Los RPC
 * de operación levantan tags `SIN_ESTADO:` / `SIN_PERMISO:` / `SIN_HORARIO:` /
 * `LINK_*:` con el motivo en español después del tag; lo que no es un tag ya
 * viene en español de la base ("El motivo de la cancelación es obligatorio").
 */
function stripClassTag(message: string): string {
  const m = /^(SIN_(ESTADO|PERMISO|HORARIO)|LINK_(INVALIDO|VENCIDO))[:\s]+(.*)$/i.exec(
    message.trim()
  );
  if (!m) return message;
  const reason = m[4].trim();
  const capitalized = reason.charAt(0).toUpperCase() + reason.slice(1);
  return capitalized.endsWith(".") ? capitalized : `${capitalized}.`;
}

export function classErrorOf(e: unknown): string {
  if (typeof e === "string" && e.trim()) return stripClassTag(e);
  if (e && typeof e === "object") {
    const raw = (e as { message?: unknown }).message;
    if (typeof raw === "string" && raw.trim()) {
      const clean = stripClassTag(raw);
      if (clean !== raw) return clean;
    }
  }
  return toMessage(e);
}
// ============================================================================
// Acceso a datos (I/O) — operación de clases
//
// Los RPC `school_*` de la migración 0100 son los únicos que escriben; acá solo
// se arman los argumentos (validando temprano lo que la base también valida),
// se llama al RPC, y se decodifica la respuesta con los espejos puros de arriba.
// ============================================================================

/** Respuesta de `school_confirm_lesson`: la clase pasó a `pending_close`. */
export interface ConfirmLessonResult {
  id: string;
  status: "pending_close";
  confirmed_via: "session" | "link";
  confirmed_version: number;
}

/** Pedido de reprogramación que está por decidirse (agenda del coordinador). */
export interface PendingRescheduleRequest {
  id: string;
  lesson_id: string;
  old_start_at: string;
  old_end_at: string;
  instrument: string;
  student_name: string;
  teacher_name: string;
  reason: string;
  requested_at: string;
  requester_kind: "coordinator" | "guardian" | "student";
  /** true = el pedido es del grupo (participant_id nulo en la base). */
  group_request: boolean;
}

export interface RescheduleRequestInput {
  lessonId: string;
  participantId: string;
  reason: string;
  requesterKind?: "coordinator" | "guardian" | "student";
}

export interface ApproveRescheduleResult {
  id: string;
  status: "approved";
  old_lesson_id: string | null;
  new_lesson_id: string | null;
  alreadyDecided: boolean;
}

export interface AdjustCreditResult {
  enrollment_id: string;
  balance: number;
}

/** Aplana la respuesta `{foo: {…}}` del select con joins anidados. */
function joinedObject(value: unknown): Record<string, unknown> {
  return Array.isArray(value)
    ? ((value[0] as Record<string, unknown>) ?? {})
    : ((value as Record<string, unknown>) ?? {});
}

/** Confirma una clase ya terminada desde la sesión del coordinador. */
export async function confirmLesson(lessonId: string): Promise<ConfirmLessonResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_confirm_lesson", {
    p_lesson_id: lessonId,
  });
  if (error) throw error;
  return data as unknown as ConfirmLessonResult;
}

/**
 * Cierra la clase con la asistencia completa. El doble clic es idempotente:
 * la segunda llamada devuelve `alreadyClosed` y el espejo `closeResultOf` lo
 * traduce; el cliente lo trata como éxito sin volver a tocar nada.
 */
export async function closeLesson(
  lessonId: string,
  entries: AttendanceEntry[]
): Promise<ReturnType<typeof closeResultOf>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_close_lesson", {
    p_lesson_id: lessonId,
    p_attendance: attendancePayloadOf(entries) as unknown as Json,
  });
  if (error) throw error;
  return closeResultOf((data ?? {}) as Record<string, unknown>);
}

/** Cancela una clase con motivo obligatorio (la base re-valida el motivo). */
export async function cancelLesson(
  lessonId: string,
  reason: string
): Promise<{ id: string; status: "cancelled"; alreadyCancelled: boolean }> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("El motivo de la cancelación es obligatorio");
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_cancel_lesson", {
    p_lesson_id: lessonId,
    p_reason: trimmed,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    id: raw.id as string,
    status: raw.status as "cancelled",
    alreadyCancelled: raw.alreadyCancelled === true,
  };
}

/**
 * Pide la reprogramación de una clase para un participante. El pedido
 * pendiente CONSERVA la reserva del horario original; decidir es aparte.
 * Desde el POS/escuela siempre es el coordinador (la exime de la anticipación
 * mínima, y así queda registrado).
 */
export async function requestReschedule(input: RescheduleRequestInput): Promise<{ id: string; status: "pending" }> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("El motivo de la reprogramación es obligatorio");
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_request_reschedule", {
    p_lesson_id: input.lessonId,
    p_participant_id: input.participantId,
    p_reason: reason,
    p_requester_kind: input.requesterKind ?? "coordinator",
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return { id: (raw.id as string) ?? "", status: "pending" };
}

/**
 * Aprueba la reprogramación. Con rango fecha: la base valida conflictos (mismas
 * reglas que `school_schedule_lesson`), crea la clase nueva, mueve las
 * participaciones, sube la versión de la original (invalida los enlaces viejos)
 * y notifica. Sin rango: se libera el hueco (make‑up implícito en el saldo).
 */
export async function approveReschedule(
  requestId: string,
  range?: { startAt: string; endAt: string }
): Promise<ApproveRescheduleResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_approve_reschedule", {
    p_request_id: requestId,
    p_new_start_at: range?.startAt,
    p_new_end_at: range?.endAt,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    id: raw.id as string,
    status: raw.status as "approved",
    old_lesson_id: (raw.old_lesson_id as string | null) ?? null,
    new_lesson_id: (raw.new_lesson_id as string | null) ?? null,
    alreadyDecided: raw.alreadyDecided === true,
  };
}

/** Rechaza la reprogramación con motivo; la original conserva su horario. */
export async function rejectReschedule(
  requestId: string,
  reason: string
): Promise<{ id: string; status: "rejected"; alreadyDecided: boolean }> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("El motivo del rechazo es obligatorio");
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_reject_reschedule", {
    p_request_id: requestId,
    p_reason: trimmed,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    id: raw.id as string,
    status: raw.status as "rejected",
    alreadyDecided: raw.alreadyDecided === true,
  };
}

/**
 * Ajusta el saldo de créditos de una matrícula (movimiento `adjustment` con
 * motivo obligatorio; la base rechaza el cero). Devuelve el saldo reconstruido.
 */
export async function adjustCredit(
  enrollmentId: string,
  amount: number,
  reason: string
): Promise<AdjustCreditResult> {
  const trimmed = reason.trim();
  if (amount === 0) throw new Error("El ajuste no puede ser cero");
  if (!trimmed) throw new Error("El motivo del ajuste es obligatorio");
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_adjust_credit", {
    p_enrollment_id: enrollmentId,
    p_amount: amount,
    p_reason: trimmed,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    enrollment_id: raw.enrollment_id as string,
    balance: raw.balance as number,
  };
}

/**
 * Clases por cerrar (superficie de alerta): derivadas en la base con los MISMOS
 * criterios que `pendingCloseLessonsOf` y re-derivadas acá por estabilidad con
 * el mismo instante. La derivación nunca transiciona estados.
 */
export async function fetchPendingCloseLessons(nowIso: string): Promise<PendingCloseCandidate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lessons")
    .select("id, status, instrument, start_at, end_at, confirmed_at")
    .eq("status", "scheduled")
    .is("confirmed_at", null)
    .lt("end_at", nowIso)
    .order("end_at");
  if (error) throw error;
  return pendingCloseLessonsOf((data ?? []) as unknown as PendingCloseCandidate[], nowIso);
}

/**
 * Participantes de la clase con la política CONGELADA de su matrícula: es lo
 * que el editor de asistencia y el plan de consumo necesitan para decidir y
 * avisar. El cierre exige que TODOS estén listados (nada de pendientes
 * silenciosos), y este fetch es la lista completa de la clase.
 */
export async function fetchClosePreview(lessonId: string): Promise<CloseParticipantRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lesson_participants")
    .select(
      "id, enrollment_id, attendance_status, school_enrollments(status, policy_consume_on_unjustified_absence, school_students(customers(full_name)))"
    )
    .eq("lesson_id", lessonId)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => {
    const enrollment = joinedObject(p.school_enrollments);
    const student = joinedObject(enrollment.school_students);
    const customer = joinedObject(student.customers);
    return {
      participant_id: p.id as string,
      enrollment_id: p.enrollment_id as string,
      student_name: (customer.full_name as string) ?? "Sin nombre",
      attendance_status: (p.attendance_status as CloseParticipantRow["attendance_status"]) ?? "pending",
      enrollment_status: (enrollment.status as string) ?? "inactive",
      policy_consume_on_unjustified_absence:
        enrollment.policy_consume_on_unjustified_absence === true,
    };
  });
}

const RESCHEDULE_REQUEST_SELECT =
  "id, lesson_id, participant_id, reason, requester_kind, requested_at, school_lessons(start_at, end_at, instrument, school_teacher_profiles(staff(full_name))), school_enrollments(school_students(customers(full_name)))";

type RescheduleRequestRow = Record<string, unknown> & {
  school_lessons?: unknown;
  school_enrollments?: unknown;
};

function mapPendingRescheduleRequest(raw: RescheduleRequestRow): PendingRescheduleRequest {
  const lesson = joinedObject(raw.school_lessons);
  const teacher = joinedObject(lesson.school_teacher_profiles);
  const staff = joinedObject(teacher.staff);
  const enrollment = joinedObject(raw.school_enrollments);
  const student = joinedObject(enrollment.school_students);
  const customer = joinedObject(student.customers);
  return {
    id: raw.id as string,
    lesson_id: raw.lesson_id as string,
    old_start_at: lesson.start_at as string,
    old_end_at: lesson.end_at as string,
    instrument: lesson.instrument as string,
    student_name: (customer.full_name as string) ?? "Sin nombre",
    teacher_name: (staff.full_name as string) ?? "Sin nombre",
    reason: raw.reason as string,
    requested_at: raw.requested_at as string,
    requester_kind: raw.requester_kind as PendingRescheduleRequest["requester_kind"],
    group_request: raw.participant_id == null,
  };
}

/** Pedidos de reprogramación pendientes, con clase/profesor/estudiante. */
export async function fetchPendingRescheduleRequests(): Promise<PendingRescheduleRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_reschedule_requests")
    .select(RESCHEDULE_REQUEST_SELECT)
    .eq("status", "pending")
    .order("requested_at");
  if (error) throw error;
  return ((data ?? []) as unknown as RescheduleRequestRow[]).map(mapPendingRescheduleRequest);
}
