import { toMessage } from "@/lib/errors";

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