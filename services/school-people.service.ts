import { createClient } from "@/utils/supabase/client";
import { whatsappNumber } from "@/services/promos.service";

// ---- Tipos del dominio de personas de la escuela ----

export interface SchoolStudent {
  id: string;
  customer_id: string;
  /** Nombre del cliente (join con `customers`). */
  full_name: string;
  /** Teléfono del cliente (join con `customers`). */
  customer_phone: string | null;
  /** Email del cliente (join con `customers`). */
  customer_email: string | null;
  instrument: string;
  level: string | null;
  status: string;
  is_minor: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface NewStudentInput {
  customer_id: string;
  instrument: string;
  level: string | null;
  is_minor: boolean;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
}

/** Dato de contacto de un adulto responsable del estudiante. */
export interface StudentGuardian {
  id: string;
  student_id: string;
  customer_id: string;
  /** Nombre del adulto (join con `customers`). */
  full_name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  is_notice_receiver: boolean;
  notices_enabled: boolean;
}

export interface NewGuardianInput {
  student_id: string;
  customer_id: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  /** Si es TRUE se vuelve el receptor de avisos (se apagan los demás). */
  is_notice_receiver?: boolean;
  notices_enabled?: boolean;
}

export interface TeacherProfile {
  id: string;
  staff_id: string;
  /** Nombre de la persona (join con `staff`). */
  full_name: string;
  instruments: string[];
  bio: string | null;
  created_at: string;
}

export interface NewTeacherInput {
  staff_id: string;
  instruments: string[];
  bio?: string | null;
}

/** Nombre de la persona del equipo, para el selector de profesor. */
export interface StaffOption {
  id: string;
  full_name: string;
  role: string | null;
  status: string;
}

const STUDENT_SELECT =
  "id, customer_id, instrument, level, status, is_minor, contact_email, contact_phone, notes, created_at, customers(full_name, phone, email)";
const GUARDIAN_SELECT =
  "id, student_id, customer_id, relationship, phone, email, is_notice_receiver, notices_enabled, customers(full_name)";
const TEACHER_SELECT =
  "id, staff_id, instruments, bio, created_at, staff(full_name)";

type StudentRow = Record<string, unknown> & { customers?: unknown };
type GuardianRow = Record<string, unknown> & { customers?: unknown };
type TeacherRow = Record<string, unknown> & { staff?: unknown };

function customerOf(row: { customers?: unknown }): Record<string, unknown> {
  const joined = row.customers;
  return Array.isArray(joined) ? ((joined[0] as Record<string, unknown>) ?? {}) : ((joined as Record<string, unknown>) ?? {});
}

function mapStudent(raw: StudentRow): SchoolStudent {
  const c = customerOf(raw);
  return {
    id: raw.id as string,
    customer_id: raw.customer_id as string,
    full_name: (c.full_name as string) ?? "Sin nombre",
    customer_phone: (c.phone as string | null) ?? null,
    customer_email: (c.email as string | null) ?? null,
    instrument: raw.instrument as string,
    level: (raw.level as string | null) ?? null,
    status: raw.status as string,
    is_minor: (raw.is_minor as boolean) ?? false,
    contact_email: (raw.contact_email as string | null) ?? null,
    contact_phone: (raw.contact_phone as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    created_at: raw.created_at as string,
  };
}

function mapGuardian(raw: GuardianRow): StudentGuardian {
  const c = customerOf(raw);
  return {
    id: raw.id as string,
    student_id: raw.student_id as string,
    customer_id: raw.customer_id as string,
    full_name: (c.full_name as string) ?? "Sin nombre",
    relationship: (raw.relationship as string | null) ?? null,
    phone: (raw.phone as string | null) ?? null,
    email: (raw.email as string | null) ?? null,
    is_notice_receiver: (raw.is_notice_receiver as boolean) ?? false,
    notices_enabled: (raw.notices_enabled as boolean) ?? true,
  };
}

function mapTeacher(raw: TeacherRow): TeacherProfile {
  const joined = Array.isArray(raw.staff) ? ((raw.staff[0] as Record<string, unknown>) ?? {}) : ((raw.staff as Record<string, unknown>) ?? {});
  return {
    id: raw.id as string,
    staff_id: raw.staff_id as string,
    full_name: (joined.full_name as string) ?? "Sin nombre",
    instruments: (raw.instruments as string[]) ?? [],
    bio: (raw.bio as string | null) ?? null,
    created_at: raw.created_at as string,
  };
}

// ---- Normalización pura (sin I/O) ----

/** Recorta y colapsa espacios de un nombre ("  Ana   María " -> "Ana María"). */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Normaliza el teléfono de contacto a lo que `wa.me` espera (solo dígitos con
 * indicativo). Devuelve null si no hay un número usable.
 */
export function normalizeContactPhone(phone: string | null): string | null {
  return whatsappNumber(phone);
}

// ---- Alumnos ----

export async function fetchStudents(): Promise<SchoolStudent[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("school_students").select(STUDENT_SELECT);
  if (error) throw error;
  const rows = (data ?? []) as unknown as StudentRow[];
  return rows
    .map(mapStudent)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
}

export async function fetchStudent(id: string): Promise<SchoolStudent | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_students")
    .select(STUDENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapStudent(data as unknown as StudentRow) : null;
}

export async function createStudent(input: NewStudentInput): Promise<SchoolStudent> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_students")
    .insert({
      customer_id: input.customer_id,
      instrument: normalizeName(input.instrument),
      level: input.level ? normalizeName(input.level) : null,
      is_minor: input.is_minor,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone ? normalizeName(input.contact_phone) : null,
      notes: input.notes ? input.notes.trim() : null,
    })
    .select(STUDENT_SELECT)
    .single();
  if (error) throw error;
  return mapStudent(data as unknown as StudentRow);
}

export async function updateStudent(id: string, input: NewStudentInput): Promise<SchoolStudent> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_students")
    .update({
      customer_id: input.customer_id,
      instrument: normalizeName(input.instrument),
      level: input.level ? normalizeName(input.level) : null,
      is_minor: input.is_minor,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone ? normalizeName(input.contact_phone) : null,
      notes: input.notes ? input.notes.trim() : null,
    })
    .eq("id", id)
    .select(STUDENT_SELECT)
    .single();
  if (error) throw error;
  return mapStudent(data as unknown as StudentRow);
}

// ---- Adultos responsables ----

export async function fetchGuardians(studentId: string): Promise<StudentGuardian[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_student_guardians")
    .select(GUARDIAN_SELECT)
    .eq("student_id", studentId)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as GuardianRow[]).map(mapGuardian);
}

/**
 * Crea un adulto responsable. Si el input lo pide receptor de avisos, primero
 * apaga el receptor actual: el índice parcial `school_students_one_notice_receiver`
 * rechaza un segundo receptor y el error crudo de la base no le dice nada a nadie.
 */
export async function createGuardian(input: NewGuardianInput): Promise<StudentGuardian> {
  const supabase = createClient();
  if (input.is_notice_receiver) {
    const { error: offErr } = await supabase
      .from("school_student_guardians")
      .update({ is_notice_receiver: false })
      .eq("student_id", input.student_id)
      .neq("customer_id", input.customer_id)
      .eq("is_notice_receiver", true);
    if (offErr) throw offErr;
  }
  const { data, error } = await supabase
    .from("school_student_guardians")
    .insert({
      student_id: input.student_id,
      customer_id: input.customer_id,
      relationship: input.relationship ? normalizeName(input.relationship) : null,
      phone: input.phone ? normalizeName(input.phone) : null,
      email: input.email?.trim() || null,
      is_notice_receiver: input.is_notice_receiver ?? false,
      notices_enabled: input.notices_enabled ?? true,
    })
    .select(GUARDIAN_SELECT)
    .single();
  if (error) throw error;
  return mapGuardian(data as unknown as GuardianRow);
}

/**
 * Actualiza un adulto responsable. Solo puede haber UN receptor de avisos por
 * estudiante: si este pasa a receptor, el actual se apaga primero.
 */
export async function updateGuardian(id: string, input: NewGuardianInput): Promise<StudentGuardian> {
  const supabase = createClient();
  if (input.is_notice_receiver) {
    const { error: offErr } = await supabase
      .from("school_student_guardians")
      .update({ is_notice_receiver: false })
      .eq("student_id", input.student_id)
      .neq("id", id)
      .eq("is_notice_receiver", true);
    if (offErr) throw offErr;
  }
  const { data, error } = await supabase
    .from("school_student_guardians")
    .update({
      customer_id: input.customer_id,
      relationship: input.relationship ? normalizeName(input.relationship) : null,
      phone: input.phone ? normalizeName(input.phone) : null,
      email: input.email?.trim() || null,
      is_notice_receiver: input.is_notice_receiver ?? false,
      notices_enabled: input.notices_enabled ?? true,
    })
    .eq("id", id)
    .select(GUARDIAN_SELECT)
    .single();
  if (error) throw error;
  return mapGuardian(data as unknown as GuardianRow);
}

// ---- Perfiles de profesor ----

export async function fetchTeacherProfiles(): Promise<TeacherProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("school_teacher_profiles").select(TEACHER_SELECT);
  if (error) throw error;
  return ((data ?? []) as unknown as TeacherRow[])
    .map(mapTeacher)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
}

/** Personas del equipo disponibles para ser profesor (solo activas). */
export async function fetchEligibleStaff(): Promise<StaffOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name, role, status")
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  return ((data ?? []) as unknown as StaffOption[]).filter((s) => s.status === "active");
}

export async function createTeacherProfile(input: NewTeacherInput): Promise<TeacherProfile> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_teacher_profiles")
    .insert({
      staff_id: input.staff_id,
      instruments: input.instruments,
      bio: input.bio?.trim() || null,
    })
    .select(TEACHER_SELECT)
    .single();
  if (error) throw error;
  return mapTeacher(data as unknown as TeacherRow);
}

export async function updateTeacherProfile(id: string, input: NewTeacherInput): Promise<TeacherProfile> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_teacher_profiles")
    .update({
      staff_id: input.staff_id,
      instruments: input.instruments,
      bio: input.bio?.trim() || null,
    })
    .eq("id", id)
    .select(TEACHER_SELECT)
    .single();
  if (error) throw error;
  return mapTeacher(data as unknown as TeacherRow);
}