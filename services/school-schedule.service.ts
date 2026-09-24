import { createClient } from "@/utils/supabase/client";
import { toMessage } from "@/lib/errors";
import { fetchEnrollment } from "@/services/school-enrollments.service";
import type { SchoolEnrollment } from "@/services/school-enrollments.service";
import { fetchTeacherProfiles } from "@/services/school-people.service";
import type { TeacherProfile } from "@/services/school-people.service";

// ============================================================================
// Agenda de la escuela: disponibilidad de profesores, ventanas libres y clases.
//
// Las reglas del negocio viven en la parte PURA de este archivo (sin I/O): los
// conflictos de horario, la grilla de ventanas libres, el plan de una serie y
// la vista "clases contratadas / consumidas / reservadas / programables". La
// base es la autoritativa (los RPC `school_schedule_*` re-validan bajo lock),
// esta copia es para decidir y mostrar en el cliente, y para los tests sin base.
// ============================================================================

// ---- Tipos del dominio de agenda ----

/** Franja semanal de disponibilidad de un profesor (renglón de la tabla). */
export interface WeeklyAvailabilityRow {
  id: string;
  teacher_profile_id: string;
  /** 1 = lunes … 7 = domingo (isodow). */
  weekday: number;
  /** "HH:MM", hora local del negocio. */
  start_time: string;
  /** "HH:MM", hora local del negocio. */
  end_time: string;
}

/** Día bloqueado de un profesor (feriado, ausencia, día sin clases). */
export interface BlockedDateRow {
  id: string;
  teacher_profile_id: string;
  /** "YYYY-MM-DD". */
  blocked_date: string;
  reason: string | null;
}

/** Ocupación genérica de un recurso: el instante lo define la base (UTC). */
export interface OccupiedSlot {
  start_at: string;
  end_at: string;
}

/** Ventana libre calculada: instantes ISO (UTC) listos para enviar a la base. */
export interface LessonWindow {
  start_at: string;
  end_at: string;
}

export type LessonStatus = "scheduled" | "pending_close" | "realized" | "cancelled" | "rescheduled";

/** Alumno anotado en una clase (con su nombre, join con la matrícula). */
export interface LessonParticipantView {
  participant_id: string;
  enrollment_id: string;
  student_name: string;
  attendance_status: string;
}

/** Clase de la agenda, lista para renderizar. */
export interface SchoolLesson {
  id: string;
  teacher_profile_id: string;
  teacher_name: string;
  instrument: string;
  room: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  status: LessonStatus;
  participants: LessonParticipantView[];
}

/** Sesión planificada de una serie (todavía no materializada). */
export interface SeriesSession {
  date: string;
  start_at: string;
  end_at: string;
}

/** Plan de una serie: qué se crearía, qué se omite y por qué. */
export interface SeriesPlan {
  /** Sesiones que SÍ se materializarían. */
  sessions: SeriesSession[];
  /** Fechas bloqueadas del profesor, reportadas al usuario (no silenciosas). */
  skipped: string[];
  /** Fechas con conflicto: al menos una sale mal -> la serie NO se genera. */
  conflicts: { date: string; reason: string }[];
}

/** Resultado del RPC `school_schedule_series` ya tipado. */
export interface ScheduleSeriesResult {
  created: { id: string; date: string }[];
  conflicts: { date: string; reason: string }[];
  skipped: string[];
}

/** Vista "clases contratadas vs. usadas" de una matrícula (escenario 3.8). */
export interface EnrollmentScheduleView {
  contracted: number;
  consumed: number;
  reserved: number;
  /** Contratadas − consumidas − reservadas. Nunca negativo. */
  programmable: number;
}

/** Fila para el selector de matrícula del diálogo de series. */
export interface EnrollmentScheduleViewRow extends EnrollmentScheduleView {
  enrollment_id: string;
  student_name: string;
  instrument: string;
  plan_name: string;
}

/** Opción de matrícula para sumar como participante a una clase. */
export interface ParticipantEnrollmentOption {
  enrollment_id: string;
  student_name: string;
  instrument: string;
  plan_name: string;
  balance: number;
}

// ---- Aritmética pura de fechas y horas (siempre UTC) ----
//
// La base corre en UTC: los instantes viajan como timestamptz y los días como
// "YYYY-MM-DD". Toda la aritmética acá usa componentes UTC, NUNCA la zona del
// navegador: la zona solo interviene al MOSTRAR (los componentes formatean).
// Precedente: `commissionPeriodOf` (la pantalla formatea, el dato es UTC).

/** "14:30" → 870 (minutos desde medianoche). */
export function hoursToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 870 → "14:30". */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" + "HH:MM" → instante UTC ISO ("2026-09-24T14:30:00.000Z"). */
export function tsAtUtc(date: string, time: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0)).toISOString();
}

/** Suma días a una fecha "YYYY-MM-DD" con aritmética UTC (sin DST). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const result = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days));
  return result.toISOString().slice(0, 10);
}

/** Días completos entre dos "YYYY-MM-DD" (positivo si `until` viene después). */
export function daysBetween(from: string, until: string): number {
  const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
  const [uy, um, ud] = until.slice(0, 10).split("-").map(Number);
  const a = Date.UTC(fy ?? 0, (fm ?? 1) - 1, fd ?? 1);
  const b = Date.UTC(uy ?? 0, (um ?? 1) - 1, ud ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/** Día de la semana ISO de una fecha "YYYY-MM-DD": 1 = lunes … 7 = domingo. */
export function isoWeekdayOf(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0 = domingo
  return dow === 0 ? 7 : dow;
}

/** El lunes de la semana que contiene la fecha. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekdayOf(date));
}

// ---- Conflictos de horario (puros) ----

/**
 * ¿Se superponen dos intervalos? Compara INSTANTES (Date.parse), no texto:
 * "Z" y "+00:00" representan lo mismo pero ordenan distinto como string.
 */
export function hasOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(aEnd) > Date.parse(bStart);
}

/** El slot ocupado que choca con [startAt, endAt), o null si el horario está libre. */
export function overlappingOf(slots: OccupiedSlot[], startAt: string, endAt: string): OccupiedSlot | null {
  return slots.find((s) => hasOverlap(s.start_at, s.end_at, startAt, endAt)) ?? null;
}

/** ¿Queda lugar? El cupo es por CLASE: `current < capacity` (1 individuo, N grupal). */
export function fitsCapacity(current: number, capacity: number): boolean {
  return current < capacity;
}

// ---- Ventanas libres de un día (puras) ----

export interface FreeWindowsInput {
  /** "YYYY-MM-DD": el día del que se piden ventanas (calendario local). */
  date: string;
  /** Franjas semanales del profesor (todas, sin filtrar por día). */
  weekly: WeeklyAvailabilityRow[];
  /** "YYYY-MM-DD" bloqueados del profesor. */
  blockedDates: string[];
  /** Clases ya agendadas que restan del salón libre. */
  occupied: OccupiedSlot[];
  durationMinutes: number;
  /** Grilla en minutos; por defecto 30. */
  stepMinutes?: number;
}

/**
 * Ventanas libres del día: la grilla de la franja semanal (o varias, si el
 * profesor tiene más de una), recortada por bloqueos y ocupaciones, en pasos
 * fijos y sin salirse del rango. Devuelve instantes UTC listos para agendar.
 */
export function freeWindowsForDay(input: FreeWindowsInput): LessonWindow[] {
  const step = input.stepMinutes ?? 30;
  const weekday = isoWeekdayOf(input.date);
  if (input.blockedDates.includes(input.date)) return [];

  const windows: LessonWindow[] = [];
  for (const row of input.weekly) {
    if (row.weekday !== weekday) continue;
    const wStart = hoursToMinutes(row.start_time);
    const wEnd = hoursToMinutes(row.end_time);
    for (let s = wStart; s + input.durationMinutes <= wEnd; s += step) {
      const startAt = tsAtUtc(input.date, minutesToTime(s));
      const endAt = tsAtUtc(input.date, minutesToTime(s + input.durationMinutes));
      if (!overlappingOf(input.occupied, startAt, endAt)) {
        windows.push({ start_at: startAt, end_at: endAt });
      }
    }
  }
  return windows;
}

// ---- Series (puras; espejo del RPC `school_schedule_series`) ----

export interface SeriesPlanInput {
  /** "YYYY-MM-DD" del primer día de clase. */
  firstDate: string;
  /** 1 = lunes … 7 = domingo. */
  weekday: number;
  startTime: string;
  endTime: string;
  /** Cantidad de sesiones. Excluyente con `untilDate` (la base lo exige). */
  count?: number;
  /** Fecha límite de la serie (inclusive). Excluyente con `count`. */
  untilDate?: string;
  /** "YYYY-MM-DD" bloqueados del profesor: se omiten y se REPORTAN. */
  blockedDates: string[];
  /** Ocupaciones del profesor en el rango de la serie. */
  teacherSlots: OccupiedSlot[];
  /** Ocupaciones del alumno (todas sus matrículas) en el rango. */
  studentSlots: OccupiedSlot[];
  /** Ocupaciones del salón en el rango. Solo se mira si hay `room`. */
  roomSlots: OccupiedSlot[];
  room?: string | null;
}

/** Sesiones de la serie: una por semana desde `firstDate` hasta `untilDate`. */
export function seriesSessionCount(firstDate: string, untilDate: string): number {
  return Math.floor(daysBetween(firstDate, untilDate) / 7) + 1;
}

/**
 * Planifica una serie semanal SIN materializarla. Reglas (espejo del RPC):
 *
 * - Una fecha bloqueada NO aborta la serie: se saltea y se REPORTa (el
 *   "bloqueado avisado, no silencioso" del diseño).
 * - Un conflicto (profesor / alumno / salón ocupado) SÍ la aborta: la serie
 *   devuelve `{sessions: [], conflicts: [...]}` y el diálogo bloquea la
 *   generación. Generar a medias escondería un choque detrás de una serie
 *   "exitosa" que no dictó todas las clases.
 * - La validación de entrada (día vs. fecha, rango, horario) LANZA, igual que
 *   el RPC: son errores del formulario, no choques a reportar.
 */
export function planSeries(input: SeriesPlanInput): SeriesPlan {
  if (input.count == null && input.untilDate == null) {
    throw new Error("Hay que indicar la cantidad de sesiones o una fecha límite");
  }
  if (input.count != null && input.untilDate != null) {
    throw new Error("La cantidad de sesiones y la fecha límite son excluyentes");
  }
  if (input.count != null && input.count <= 0) {
    throw new Error("La cantidad de sesiones debe ser mayor a cero");
  }
  if (input.weekday < 1 || input.weekday > 7) {
    throw new Error("El día de la semana es inválido");
  }
  if (isoWeekdayOf(input.firstDate) !== input.weekday) {
    throw new Error("La fecha inicial no cae en el día de la semana indicado");
  }
  if (hoursToMinutes(input.endTime) <= hoursToMinutes(input.startTime)) {
    throw new Error("El horario de la clase es inválido");
  }
  if (input.untilDate != null && daysBetween(input.firstDate, input.untilDate) < 0) {
    throw new Error("La fecha límite no puede ser anterior a la fecha inicial");
  }

  const count =
    input.count ?? seriesSessionCount(input.firstDate as string, input.untilDate as string);

  const sessions: SeriesSession[] = [];
  const skipped: string[] = [];
  const conflicts: { date: string; reason: string }[] = [];

  for (let i = 0; i < count; i++) {
    const date = addDays(input.firstDate, i * 7);
    if (input.blockedDates.includes(date)) {
      skipped.push(date);
      continue;
    }
    const startAt = tsAtUtc(date, input.startTime);
    const endAt = tsAtUtc(date, input.endTime);
    if (overlappingOf(input.teacherSlots, startAt, endAt)) {
      conflicts.push({ date, reason: "profesor ocupado" });
      continue;
    }
    if (overlappingOf(input.studentSlots, startAt, endAt)) {
      conflicts.push({ date, reason: "estudiante ocupado" });
      continue;
    }
    if (input.room && overlappingOf(input.roomSlots, startAt, endAt)) {
      conflicts.push({ date, reason: "salón ocupado" });
      continue;
    }
    sessions.push({ date, start_at: startAt, end_at: endAt });
  }

  return {
    sessions,
    skipped,
    // Un solo conflicto ya aborta TODO: al diálogo le basta con saber que NO
    // se puede generar. Las fechas individuales van para mostrarlas.
    conflicts,
  };
}

// ---- Vista de matrícula (pura) ----

/**
 * Clases contratadas vs. uso: lo que se ve en el selector de series.
 *
 * `programmable = contracted − consumed − reserved`, topado en cero: reservar
 * de más no inventa créditos. El escenario de diseño (8 contratadas / 0
 * consumidas / 1 reservada) produce 7 programables.
 */
export function enrollmentScheduleView(
  contracted: number,
  consumed: number,
  reserved: number
): EnrollmentScheduleView {
  return {
    contracted,
    consumed,
    reserved,
    programmable: Math.max(0, contracted - consumed - reserved),
  };
}

// ---- Errores amigables de agenda ----

/**
 * Traduce el error crudo del RPC a un mensaje que entiende el usuario.
 *
 * Los RPC de agenda levantan `SIN_HORARIO:` / `SIN_CUPO:` / `SIN_CREDITO:` con
 * el motivo en español después del tag. `lib/errors` solo conoce `SIN_PERMISO`,
 * así que el resto se despelleja acá — y lo que no es un tag ya viene en
 * español de la base ("El salón está ocupado en ese horario").
 */
function stripScheduleTag(message: string): string {
  const m = /^SIN_(HORARIO|CUPO|CREDITO|PERMISO)[:\s]+(.*)$/i.exec(message.trim());
  if (!m) return message;
  const reason = m[2].trim();
  const capitalized = reason.charAt(0).toUpperCase() + reason.slice(1);
  return capitalized.endsWith(".") ? capitalized : `${capitalized}.`;
}

export function scheduleErrorOf(e: unknown): string {
  if (typeof e === "string" && e.trim()) return stripScheduleTag(e);
  if (e && typeof e === "object") {
    const raw = (e as { message?: unknown }).message;
    if (typeof raw === "string" && raw.trim()) {
      const clean = stripScheduleTag(raw);
      if (clean !== raw) return clean;
    }
  }
  return toMessage(e);
}

/** "HH:MM" local del instante, para los mensajes de conflicto con hora. */
export function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

/** "YYYY-MM-DD" → "28 sep" para listar sesiones (día del calendario LOCAL). */
export function fmtSessionDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

// ============================================================================
// I/O — disponibilidad
// ============================================================================

const WEEKLY_SELECT =
  "id, teacher_profile_id, weekday, start_time, end_time";
const BLOCKED_SELECT = "id, teacher_profile_id, blocked_date, reason";

/** Postgres devuelve TIME como "14:30:00"; el dominio trabaja con "HH:MM". */
function timeToHHMM(time: string): string {
  return time.slice(0, 5);
}

type WeeklyRow = Record<string, unknown> & { start_time?: string; end_time?: string };

function mapWeeklyRow(raw: WeeklyRow): WeeklyAvailabilityRow {
  return {
    id: raw.id as string,
    teacher_profile_id: raw.teacher_profile_id as string,
    weekday: raw.weekday as number,
    start_time: timeToHHMM((raw.start_time as string) ?? "00:00"),
    end_time: timeToHHMM((raw.end_time as string) ?? "00:00"),
  };
}

function mapBlockedRaw(raw: Record<string, unknown>): BlockedDateRow {
  return {
    id: raw.id as string,
    teacher_profile_id: raw.teacher_profile_id as string,
    blocked_date: raw.blocked_date as string,
    reason: (raw.reason as string | null) ?? null,
  };
}

export async function fetchWeeklyAvailability(
  teacherProfileId: string
): Promise<WeeklyAvailabilityRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_teacher_availability")
    .select(WEEKLY_SELECT)
    .eq("teacher_profile_id", teacherProfileId)
    .order("weekday")
    .order("start_time");
  if (error) throw error;
  return ((data ?? []) as unknown as WeeklyRow[]).map(mapWeeklyRow);
}

export interface AvailabilityInput {
  weekday: number;
  start_time: string;
  end_time: string;
}

/**
 * Reemplaza la disponibilidad semanal de un profesor por DIFF, no borrando
 * todo: la única clave natural es (weekday, start_time), así que se borran los
 * renglones que ya no están y se insertan los que faltan. Un borrado total
 * dejaría al profesor sin agenda si el insert fallara a mitad de camino.
 */
export async function saveWeeklyAvailability(
  teacherProfileId: string,
  rows: AvailabilityInput[]
): Promise<WeeklyAvailabilityRow[]> {
  const supabase = createClient();
  const existing = await fetchWeeklyAvailability(teacherProfileId);

  const normalized = rows
    .filter((r) => r.weekday >= 1 && r.weekday <= 7)
    .map((r) => ({
      weekday: r.weekday,
      start_time: timeToHHMM(r.start_time),
      end_time: timeToHHMM(r.end_time),
    }));

  const key = (weekday: number, start: string) => `${weekday}|${start}`;
  const wanted = new Set(normalized.map((r) => key(r.weekday, r.start_time)));

  const toDelete = existing.filter((e) => !wanted.has(key(e.weekday, e.start_time)));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("school_teacher_availability")
      .delete()
      .in(
        "id",
        toDelete.map((r) => r.id)
      );
    if (delErr) throw delErr;
  }

  const have = new Set(existing.map((r) => key(r.weekday, r.start_time)));
  const toInsert = normalized.filter((r) => !have.has(key(r.weekday, r.start_time)));
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("school_teacher_availability").insert(
      toInsert.map((r) => ({ ...r, teacher_profile_id: teacherProfileId }))
    );
    if (insErr) throw insErr;
  }

  return fetchWeeklyAvailability(teacherProfileId);
}

export async function fetchBlockedDates(teacherProfileId: string): Promise<BlockedDateRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_teacher_blocked_dates")
    .select(BLOCKED_SELECT)
    .eq("teacher_profile_id", teacherProfileId)
    .order("blocked_date");
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapBlockedRaw);
}

/** La fecha ya bloqueada se detecta ANTES del insert: el 23505 crudo no dice nada. */
export async function addBlockedDate(
  teacherProfileId: string,
  blockedDate: string,
  reason?: string
): Promise<BlockedDateRow> {
  const supabase = createClient();
  const existing = await fetchBlockedDates(teacherProfileId);
  if (existing.some((b) => b.blocked_date === blockedDate)) {
    throw new Error("Esa fecha ya está bloqueada");
  }
  const { data, error } = await supabase
    .from("school_teacher_blocked_dates")
    .insert({
      teacher_profile_id: teacherProfileId,
      blocked_date: blockedDate,
      reason: reason?.trim() || null,
    })
    .select(BLOCKED_SELECT)
    .single();
  if (error) throw error;
  return mapBlockedRaw(data as unknown as Record<string, unknown>);
}

export async function removeBlockedDate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("school_teacher_blocked_dates").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================================
// I/O — agenda (clases)
// ============================================================================

const LESSON_SELECT =
  "id, teacher_profile_id, instrument, room, start_at, end_at, capacity, status, school_teacher_profiles(staff(full_name)), school_lesson_participants(id, enrollment_id, attendance_status, school_enrollments(school_students(customers(full_name))))";

type LessonRow = Record<string, unknown> & {
  school_teacher_profiles?: unknown;
  school_lesson_participants?: unknown;
};

function joinedObject(value: unknown): Record<string, unknown> {
  return Array.isArray(value)
    ? ((value[0] as Record<string, unknown>) ?? {})
    : ((value as Record<string, unknown>) ?? {});
}

function mapLesson(raw: LessonRow): SchoolLesson {
  const teacher = joinedObject(raw.school_teacher_profiles);
  const staff = teacher?.staff;
  const staffRow = joinedObject(staff);
  const participants = (Array.isArray(raw.school_lesson_participants)
    ? (raw.school_lesson_participants as unknown as Record<string, unknown>[])
    : []) as unknown as LessonRow[];

  const mappedParticipants: LessonParticipantView[] = participants.map((p) => {
    const enrollment = joinedObject(p.school_enrollments);
    const student = joinedObject(enrollment.school_students);
    const customer = joinedObject(student.customers);
    return {
      participant_id: p.id as string,
      enrollment_id: p.enrollment_id as string,
      student_name: (customer.full_name as string) ?? "Sin nombre",
      attendance_status: p.attendance_status as string,
    };
  });

  return {
    id: raw.id as string,
    teacher_profile_id: raw.teacher_profile_id as string,
    teacher_name: (staffRow.full_name as string) ?? "Sin nombre",
    instrument: raw.instrument as string,
    room: (raw.room as string | null) ?? null,
    start_at: raw.start_at as string,
    end_at: raw.end_at as string,
    capacity: raw.capacity as number,
    status: raw.status as LessonStatus,
    participants: mappedParticipants,
  };
}

/** Estados que ocupan agenda (los cancelados/repactados no tapan ventanas). */
const ACTIVE_LESSON_STATUSES: LessonStatus[] = ["scheduled", "pending_close", "realized"];

/**
 * Clases del período, con profesor y alumnos. `from`/`to` son INSTANTES ISO:
 * como en comisiones, un rango por fecha cortaría mal a las 20:00 locales.
 */
export async function fetchAgendaLessons(fromIso: string, toIso: string): Promise<SchoolLesson[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lessons")
    .select(LESSON_SELECT)
    .gte("start_at", fromIso)
    .lt("start_at", toIso)
    .in("status", ACTIVE_LESSON_STATUSES)
    .order("start_at");
  if (error) throw error;
  return ((data ?? []) as unknown as LessonRow[]).map(mapLesson);
}

/** Ocupaciones de un profesor en un rango, para ventanas libres y previews. */
async function fetchTeacherOccupied(
  teacherProfileId: string,
  fromIso: string,
  toIso: string
): Promise<OccupiedSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lessons")
    .select("start_at, end_at")
    .eq("teacher_profile_id", teacherProfileId)
    .in("status", ACTIVE_LESSON_STATUSES)
    .gte("start_at", fromIso)
    .lt("start_at", toIso);
  if (error) throw error;
  return ((data ?? []) as unknown as { start_at: string; end_at: string }[]).map((l) => ({
    start_at: l.start_at,
    end_at: l.end_at,
  }));
}

/** Ocupaciones del salón en un rango (solo clases que aún restan agenda). */
async function fetchRoomOccupied(room: string, fromIso: string, toIso: string): Promise<OccupiedSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lessons")
    .select("start_at, end_at")
    .eq("room", room)
    .in("status", ACTIVE_LESSON_STATUSES)
    .gte("start_at", fromIso)
    .lt("start_at", toIso);
  if (error) throw error;
  return ((data ?? []) as unknown as { start_at: string; end_at: string }[]).map((l) => ({
    start_at: l.start_at,
    end_at: l.end_at,
  }));
}

/** Ocupaciones del ALUMNO: clases de cualquier matrícula del mismo estudiante. */
async function fetchStudentOccupied(
  studentId: string,
  fromIso: string,
  toIso: string
): Promise<OccupiedSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lessons")
    .select("start_at, end_at, school_lesson_participants(school_enrollments(student_id))")
    .in("status", ACTIVE_LESSON_STATUSES)
    .gte("start_at", fromIso)
    .lt("start_at", toIso);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    start_at: string;
    end_at: string;
    school_lesson_participants?: unknown;
  }[];
  return rows
    .filter((l) => {
      const participants = Array.isArray(l.school_lesson_participants)
        ? (l.school_lesson_participants as unknown as { school_enrollments?: unknown }[])
        : [];
      return participants.some((p) => {
        const enrollment = joinedObject(p.school_enrollments);
        return enrollment.student_id === studentId;
      });
    })
    .map((l) => ({ start_at: l.start_at, end_at: l.end_at }));
}

export interface TeacherFreeWindowsInput {
  teacherProfileId: string;
  /** "YYYY-MM-DD" (calendario local). */
  date: string;
  durationMinutes: number;
  stepMinutes?: number;
}

/** Ventanas libres reales del día, mezclando disponibilidad + bloqueos + clases. */
export async function fetchTeacherFreeWindows(
  input: TeacherFreeWindowsInput
): Promise<LessonWindow[]> {
  const [weekly, blocked, occupied] = await Promise.all([
    fetchWeeklyAvailability(input.teacherProfileId),
    fetchBlockedDates(input.teacherProfileId),
    fetchTeacherOccupied(input.teacherProfileId, tsAtUtc(input.date, "00:00"), tsAtUtc(addDays(input.date, 1), "00:00")),
  ]);
  return freeWindowsForDay({
    date: input.date,
    weekly,
    blockedDates: blocked.map((b) => b.blocked_date),
    occupied,
    durationMinutes: input.durationMinutes,
    stepMinutes: input.stepMinutes,
  });
}

// ============================================================================
// I/O — agendar (RPC)
// ============================================================================

export interface ScheduleLessonInput {
  enrollment_id: string;
  teacher_profile_id: string;
  instrument: string;
  /** Instantes ISO (UTC). */
  start_at: string;
  end_at: string;
  room?: string | null;
}

function assertTeacherMatchesInstrument(
  instruments: string[],
  instrument: string
): void {
  if (!instruments.includes(instrument)) {
    throw new Error("El profesor no dicta ese instrumento");
  }
}

function assertEnrollmentMatchesInstrument(
  enrollment: SchoolEnrollment,
  instrument: string
): void {
  if (enrollment.instrument !== instrument) {
    throw new Error("El instrumento debe coincidir con el de la matrícula");
  }
}

/** Rango de la serie para cargar ocupaciones (de la primera a la última fecha). */
function seriesSpan(firstDate: string, count: number | undefined, untilDate: string | undefined): { fromIso: string; toIso: string } {
  const lastDate = untilDate ?? addDays(firstDate, ((count ?? 1) - 1) * 7);
  return {
    fromIso: tsAtUtc(firstDate, "00:00"),
    toIso: tsAtUtc(addDays(lastDate, 1), "00:00"),
  };
}

export interface SeriesPreviewInput {
  enrollment_id: string;
  teacher_profile_id: string;
  instrument: string;
  firstDate: string;
  weekday: number;
  startTime: string;
  endTime: string;
  count?: number;
  untilDate?: string;
  room?: string | null;
}

/**
 * Previsualiza una serie SIN materializarla: junta disponibilidad, bloqueos y
 * ocupaciones reales y corre `planSeries`. El RPC es quien decide en serio;
 * esto solo le muestra al usuario qué pasaría y por qué no se puede generar.
 */
export async function previewSeries(input: SeriesPreviewInput): Promise<SeriesPlan> {
  const [enrollment, teachers] = await Promise.all([
    fetchEnrollment(input.enrollment_id),
    fetchTeacherProfilesFor(input.teacher_profile_id),
  ]);
  if (!enrollment) throw new Error("La matrícula no existe");
  assertEnrollmentMatchesInstrument(enrollment, input.instrument);
  assertTeacherMatchesInstrument(teachers.instruments, input.instrument);

  const span = seriesSpan(input.firstDate, input.count, input.untilDate);
  const [teacherSlots, studentSlots, roomSlots, blocked] = await Promise.all([
    fetchTeacherOccupied(input.teacher_profile_id, span.fromIso, span.toIso),
    fetchStudentOccupied(enrollment.student_id, span.fromIso, span.toIso),
    input.room ? fetchRoomOccupied(input.room, span.fromIso, span.toIso) : Promise.resolve([]),
    fetchBlockedDates(input.teacher_profile_id),
  ]);

  return planSeries({
    firstDate: input.firstDate,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    count: input.count,
    untilDate: input.untilDate,
    blockedDates: blocked.map((b) => b.blocked_date),
    teacherSlots,
    studentSlots,
    roomSlots,
    room: input.room,
  });
}

/**
 * Agenda UNA clase vía `school_schedule_lesson`.
 *
 * Antes del RPC se pre-verifica con los datos frescos y, si hay choque, se
 * tira el error CON LA HORA del conflicto (el RPC re-valida bajo lock igual:
 * esta pre-verificación es para avisar temprano, no para reemplazarlo).
 */
export async function scheduleLesson(input: ScheduleLessonInput): Promise<Record<string, unknown>> {
  const [enrollment, teachers] = await Promise.all([
    fetchEnrollment(input.enrollment_id),
    fetchTeacherProfilesFor(input.teacher_profile_id),
  ]);
  if (!enrollment) throw new Error("La matrícula no existe");
  assertEnrollmentMatchesInstrument(enrollment, input.instrument);
  assertTeacherMatchesInstrument(teachers.instruments, input.instrument);

  const [teacherSlots, studentSlots, roomSlots] = await Promise.all([
    fetchTeacherOccupied(input.teacher_profile_id, input.start_at, input.end_at),
    fetchStudentOccupied(enrollment.student_id, input.start_at, input.end_at),
    input.room ? fetchRoomOccupied(input.room, input.start_at, input.end_at) : Promise.resolve([]),
  ]);

  const teacherHit = overlappingOf(teacherSlots, input.start_at, input.end_at);
  if (teacherHit) {
    throw new Error(
      `SIN_HORARIO: El profesor ya tiene una clase de ${formatSlotTime(teacherHit.start_at)} a ${formatSlotTime(teacherHit.end_at)}`
    );
  }
  const studentHit = overlappingOf(studentSlots, input.start_at, input.end_at);
  if (studentHit) {
    throw new Error(
      `SIN_HORARIO: El alumno ya tiene una clase de ${formatSlotTime(studentHit.start_at)} a ${formatSlotTime(studentHit.end_at)}`
    );
  }
  const roomHit = input.room ? overlappingOf(roomSlots, input.start_at, input.end_at) : null;
  if (roomHit) {
    throw new Error(
      `SIN_HORARIO: El salón ya está ocupado de ${formatSlotTime(roomHit.start_at)} a ${formatSlotTime(roomHit.end_at)}`
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_schedule_lesson", {
    p_enrollment_id: input.enrollment_id,
    p_teacher_profile_id: input.teacher_profile_id,
    p_instrument: input.instrument,
    p_start_at: input.start_at,
    p_end_at: input.end_at,
    ...(input.room ? { p_room: input.room } : {}),
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export interface ScheduleSeriesInput {
  enrollment_id: string;
  teacher_profile_id: string;
  instrument: string;
  first_at: string;
  end_time: string;
  weekday: number;
  count?: number;
  until_date?: string;
  room?: string | null;
}

/**
 * Agenda una serie semanal vía `school_schedule_series`. El RPC es el que
 * decide: devuelve `{created, conflicts, skipped}` y el cliente NUNCA genera
 * "a medias" — si hay conflictos, la serie entera queda sin crear y el diálogo
 * los muestra.
 */
export async function scheduleSeries(input: ScheduleSeriesInput): Promise<ScheduleSeriesResult> {
  const [enrollment, teachers] = await Promise.all([
    fetchEnrollment(input.enrollment_id),
    fetchTeacherProfilesFor(input.teacher_profile_id),
  ]);
  if (!enrollment) throw new Error("La matrícula no existe");
  assertEnrollmentMatchesInstrument(enrollment, input.instrument);
  assertTeacherMatchesInstrument(teachers.instruments, input.instrument);

  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_schedule_series", {
    p_enrollment_id: input.enrollment_id,
    p_teacher_profile_id: input.teacher_profile_id,
    p_instrument: input.instrument,
    p_first_at: input.first_at,
    p_end_time: input.end_time,
    p_weekday: input.weekday,
    ...(input.count != null ? { p_count: input.count } : {}),
    ...(input.until_date ? { p_until_date: input.until_date } : {}),
    ...(input.room ? { p_room: input.room } : {}),
  });
  if (error) throw error;
  const raw = (data ?? {}) as { created?: unknown; conflicts?: unknown; skipped?: unknown };
  return {
    created: Array.isArray(raw.created)
      ? (raw.created as unknown as { id: string; date: string }[])
      : [],
    conflicts: Array.isArray(raw.conflicts)
      ? (raw.conflicts as unknown as { date: string; reason: string }[])
      : [],
    skipped: Array.isArray(raw.skipped) ? (raw.skipped as unknown as string[]) : [],
  };
}

/** Suma un alumno a una clase vía `school_add_participant` (cupo ≠ crédito). */
export async function addParticipant(
  lessonId: string,
  enrollmentId: string
): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_add_participant", {
    p_lesson_id: lessonId,
    p_enrollment_id: enrollmentId,
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

// ============================================================================
// I/O — vistas de libros (contratadas / consumidas / reservadas)
// ============================================================================

/**
 * Matrículas activas con su vista de agenda: contratadas (snapshot), consumidas
 * (movimientos `consumption`) y reservadas (participaciones en clases vigentes).
 * Es la fuente del selector de series — "8 contratadas, 1 reservada, 7
 * programables" sale de acá.
 */
export async function fetchEnrollmentScheduleViews(): Promise<EnrollmentScheduleViewRow[]> {
  const supabase = createClient();

  const [{ data: enrollments, error: enrErr }, { data: movements, error: movErr }, { data: participants, error: parErr }] =
    await Promise.all([
      supabase
        .from("school_enrollments")
        .select(
          "id, student_id, instrument, status, contracted_lessons, plan_name, school_students(customer_id, customers(full_name))"
        )
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("school_class_credit_movements")
        .select("enrollment_id, amount")
        .eq("kind", "consumption"),
      supabase
        .from("school_lesson_participants")
        .select("id, enrollment_id, school_lessons(status)"),
    ]);

  const err = [enrErr, movErr, parErr].find(Boolean);
  if (err) throw err;

  type EnrollmentRaw = Record<string, unknown> & { school_students?: unknown };
  const consumedByEnrollment = new Map<string, number>();
  for (const m of (movements ?? []) as unknown as { enrollment_id: string; amount: number }[]) {
    consumedByEnrollment.set(m.enrollment_id, (consumedByEnrollment.get(m.enrollment_id) ?? 0) - m.amount);
  }

  const reservedByEnrollment = new Map<string, number>();
  for (const p of (participants ?? []) as unknown as { enrollment_id: string; school_lessons?: unknown }[]) {
    const lesson = joinedObject(p.school_lessons);
    const status = lesson.status as string;
    if (status === "scheduled" || status === "pending_close") {
      reservedByEnrollment.set(p.enrollment_id, (reservedByEnrollment.get(p.enrollment_id) ?? 0) + 1);
    }
  }

  const rows = ((enrollments ?? []) as unknown as EnrollmentRaw[])
    .map((raw) => {
      const student = joinedObject(raw.school_students);
      const customer = joinedObject(student.customers);
      const enrollmentId = raw.id as string;
      const view = enrollmentScheduleView(
        raw.contracted_lessons as number,
        consumedByEnrollment.get(enrollmentId) ?? 0,
        reservedByEnrollment.get(enrollmentId) ?? 0
      );
      return {
        ...view,
        enrollment_id: enrollmentId,
        student_name: (customer.full_name as string) ?? "Sin nombre",
        instrument: raw.instrument as string,
        plan_name: raw.plan_name as string,
      };
    })
    .sort((a, b) => a.student_name.localeCompare(b.student_name, "es"));

  return rows;
}

/** Matrículas que pueden sumarse a UNA clase (instrumento + créditos + cupo). */
export async function fetchEligibleParticipantEnrollments(
  lessonId: string
): Promise<ParticipantEnrollmentOption[]> {
  const supabase = createClient();

  const lessonQuery = await supabase
    .from("school_lessons")
    .select("id, instrument, capacity")
    .eq("id", lessonId)
    .single();
  if (lessonQuery.error) throw lessonQuery.error;
  const lesson = lessonQuery.data as unknown as { instrument: string; capacity: number };

  const enrollmentQuery = await supabase
    .from("school_enrollments")
    .select(
      "id, instrument, plan_name, status, school_students(customer_id, customers(full_name))"
    )
    .eq("status", "active")
    .eq("instrument", lesson.instrument);
  if (enrollmentQuery.error) throw enrollmentQuery.error;
  const enrollmentRows = (enrollmentQuery.data ?? []) as unknown as (Record<string, unknown> & {
    school_students?: unknown;
  })[];

  const participantQuery = await supabase
    .from("school_lesson_participants")
    .select("enrollment_id")
    .eq("lesson_id", lessonId);
  if (participantQuery.error) throw participantQuery.error;
  const alreadyIn = new Set(
    (participantQuery.data ?? []).map((r) => (r as { enrollment_id: string }).enrollment_id)
  );

  const ids = enrollmentRows.map((r) => r.id as string);
  const balanceByEnrollment = new Map<string, number>();
  if (ids.length > 0) {
    const movementQuery = await supabase
      .from("school_class_credit_movements")
      .select("enrollment_id, amount")
      .in("enrollment_id", ids);
    if (movementQuery.error) throw movementQuery.error;
    for (const m of (movementQuery.data ?? []) as unknown as { enrollment_id: string; amount: number }[]) {
      balanceByEnrollment.set(m.enrollment_id, (balanceByEnrollment.get(m.enrollment_id) ?? 0) + m.amount);
    }
  }

  return enrollmentRows
    .filter((r) => !alreadyIn.has(r.id as string))
    .map((raw) => {
      const student = joinedObject(raw.school_students);
      const customer = joinedObject(student.customers);
      return {
        enrollment_id: raw.id as string,
        student_name: (customer.full_name as string) ?? "Sin nombre",
        instrument: raw.instrument as string,
        plan_name: raw.plan_name as string,
        balance: balanceByEnrollment.get(raw.id as string) ?? 0,
      };
    })
    .filter((o) => o.balance > 0);
}

// ---- Helper local: perfil de profesor por id (join con staff) ----

async function fetchTeacherProfilesFor(teacherProfileId: string): Promise<TeacherProfile> {
  const all = await fetchTeacherProfiles();
  const found = all.find((t) => t.id === teacherProfileId);
  if (!found) throw new Error("El profesor no existe");
  return found;
}