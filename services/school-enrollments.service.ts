import { createClient } from "@/utils/supabase/client";
import type { SchoolPolicy } from "@/services/school-settings.service";

// ---- Tipos del dominio de planes y matrículas ----

export interface LessonPlan {
  id: string;
  name: string;
  service_id: string;
  /** Nombre del servicio que se vende en el POS (join con `services`). */
  service_name: string;
  lesson_count: number;
  duration_minutes: number;
  validity_days: number;
  max_group_size: number;
  is_active: boolean;
  created_at: string;
}

export interface NewLessonPlanInput {
  name: string;
  service_id: string;
  lesson_count: number;
  duration_minutes: number;
  validity_days: number;
  max_group_size: number;
  is_active?: boolean;
}

/** Servicio existente que se puede vender desde el POS (plan -> `services`). */
export interface SellableService {
  id: string;
  name: string;
  price: number;
  status: string;
}

export interface SchoolEnrollment {
  id: string;
  student_id: string;
  lesson_plan_id: string;
  /** Nombre del alumno (join con `school_students` -> `customers`). */
  student_name: string;
  instrument: string;
  status: string;
  start_date: string;
  expiry_date: string | null;
  contracted_lessons: number;
  plan_name: string;
  plan_price: number;
  plan_validity_days: number;
  reschedule_count: number;
  sale_id: string | null;
  default_teacher_profile_id: string | null;
  created_at: string;
}

export interface CreditMovement {
  id: string;
  enrollment_id: string;
  lesson_id: string | null;
  kind: string;
  amount: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface EnrollmentInput {
  student_id: string;
  lesson_plan_id: string;
  instrument: string;
  /** La venta del plan en el POS. null = matrícula válida sin venta. */
  sale_id?: string | null;
  payer_customer_id?: string | null;
  default_teacher_profile_id?: string | null;
}

export interface SchoolSummary {
  students: number;
  teachers: number;
  plans: number;
  enrollments: number;
  active_enrollments: number;
  /** Créditos restantes sumando todas las matrículas activas. */
  total_balance: number;
  /** Matrículas activas que vencen en los próximos 15 días. */
  expiring_soon: number;
}

const PLAN_SELECT =
  "id, name, service_id, lesson_count, duration_minutes, validity_days, max_group_size, is_active, created_at, services(name)";
const ENROLLMENT_SELECT =
  "id, student_id, lesson_plan_id, instrument, status, start_date, expiry_date, contracted_lessons, plan_name, plan_price, plan_validity_days, reschedule_count, sale_id, default_teacher_profile_id, created_at, school_students(customer_id, customers(full_name))";

function planRowToPlan(raw: Record<string, unknown> & { services?: unknown }): LessonPlan {
  const joined = Array.isArray(raw.services) ? ((raw.services[0] as Record<string, unknown>) ?? {}) : ((raw.services as Record<string, unknown>) ?? {});
  return {
    id: raw.id as string,
    name: raw.name as string,
    service_id: raw.service_id as string,
    service_name: (joined.name as string) ?? "—",
    lesson_count: raw.lesson_count as number,
    duration_minutes: raw.duration_minutes as number,
    validity_days: raw.validity_days as number,
    max_group_size: raw.max_group_size as number,
    is_active: (raw.is_active as boolean) ?? true,
    created_at: raw.created_at as string,
  };
}

function enrollmentRowToEnrollment(raw: Record<string, unknown> & { school_students?: unknown }): SchoolEnrollment {
  let student_name = "Sin nombre";
  const joined = raw.school_students;
  if (joined) {
    const studentRow = Array.isArray(joined) ? ((joined[0] as Record<string, unknown>) ?? {}) : (joined as Record<string, unknown>);
    const customers = studentRow?.customers;
    if (customers) {
      const c = Array.isArray(customers) ? ((customers[0] as Record<string, unknown>) ?? {}) : (customers as Record<string, unknown>);
      student_name = (c.full_name as string) ?? student_name;
    }
  }
  return {
    id: raw.id as string,
    student_id: raw.student_id as string,
    lesson_plan_id: raw.lesson_plan_id as string,
    student_name,
    instrument: raw.instrument as string,
    status: raw.status as string,
    start_date: raw.start_date as string,
    expiry_date: (raw.expiry_date as string | null) ?? null,
    contracted_lessons: raw.contracted_lessons as number,
    plan_name: raw.plan_name as string,
    plan_price: raw.plan_price as number,
    plan_validity_days: raw.plan_validity_days as number,
    reschedule_count: raw.reschedule_count as number,
    sale_id: (raw.sale_id as string | null) ?? null,
    default_teacher_profile_id: (raw.default_teacher_profile_id as string | null) ?? null,
    created_at: raw.created_at as string,
  };
}

// ---- Lógica pura (sin I/O) ----

/**
 * Saldo de créditos de una matrícula = SUM(amount) de sus movimientos.
 *
 * NUNCA un contador editable: el saldo se reconstruye desde el libro mayor.
 * La base es la autoritativa (`school_enroll` devuelve `balance`); esta copia
 * es para mostrarlo y para los tests sin base.
 */
export function enrollmentBalanceOf(movements: Pick<CreditMovement, "amount">[]): number {
  return movements.reduce((acc, m) => acc + m.amount, 0);
}

/**
 * La foto congelada que `school_enroll` va a escribir en la matrícula.
 *
 * Precedente: `promo_redemptions` congela premio y umbral al canjear. Acá se
 * congela el catálogo COMPLETO del plan (nombre, precio, vigencia) más la
 * política de la escuela, para que cambios futuros no alteren contratos ya
 * firmados. Es PREVIEW: la base es la que congela de verdad.
 */
export function frozenSnapshotOf(input: {
  plan: Pick<LessonPlan, "name" | "lesson_count" | "validity_days" | "duration_minutes">;
  servicePrice: number;
  policy: SchoolPolicy;
}): {
  plan_name: string;
  contracted_lessons: number;
  plan_price: number;
  plan_validity_days: number;
  policy_min_advance_hours: number;
  policy_max_reschedules: number;
  policy_consume_on_unjustified_absence: boolean;
  policy_expiry_extension_days: number;
} {
  return {
    plan_name: input.plan.name,
    contracted_lessons: input.plan.lesson_count,
    plan_price: input.servicePrice,
    plan_validity_days: input.plan.validity_days,
    policy_min_advance_hours: input.policy.min_advance_hours,
    policy_max_reschedules: input.policy.max_reschedules,
    policy_consume_on_unjustified_absence: input.policy.consume_on_unjustified_absence,
    policy_expiry_extension_days: input.policy.expiry_extension_days,
  };
}

// ---- Planes ----

export async function fetchLessonPlans(activeOnly = false): Promise<LessonPlan[]> {
  const supabase = createClient();
  let query = supabase.from("school_lesson_plans").select(PLAN_SELECT).order("name");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Parameters<typeof planRowToPlan>[0][]).map(planRowToPlan);
}

export async function createLessonPlan(input: NewLessonPlanInput): Promise<LessonPlan> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lesson_plans")
    .insert({
      name: input.name.trim(),
      service_id: input.service_id,
      lesson_count: input.lesson_count,
      duration_minutes: input.duration_minutes,
      validity_days: input.validity_days,
      max_group_size: input.max_group_size,
      is_active: input.is_active ?? true,
    })
    .select(PLAN_SELECT)
    .single();
  if (error) throw error;
  return planRowToPlan(data as unknown as Parameters<typeof planRowToPlan>[0]);
}

export async function updateLessonPlan(id: string, input: NewLessonPlanInput): Promise<LessonPlan> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lesson_plans")
    .update({
      name: input.name.trim(),
      service_id: input.service_id,
      lesson_count: input.lesson_count,
      duration_minutes: input.duration_minutes,
      validity_days: input.validity_days,
      max_group_size: input.max_group_size,
      is_active: input.is_active ?? true,
    })
    .eq("id", id)
    .select(PLAN_SELECT)
    .single();
  if (error) throw error;
  return planRowToPlan(data as unknown as Parameters<typeof planRowToPlan>[0]);
}

/** Servicios vendibles para el selector de plan (el precio lo lleva el servicio). */
export async function fetchSellableServices(): Promise<SellableService[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, price, status")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as SellableService[]).filter((s) => s.status === "active");
}

/**
 * Archiva / reactiva un plan.
 *
 * Los planes se archivan, NUNCA se borran: `school_enrollments.lesson_plan_id`
 * referencia al plan y un DELETE descolgaría la historia de cada matrícula
 * (igual que con los servicios del catálogo).
 */
export async function setLessonPlanStatus(id: string, is_active: boolean): Promise<LessonPlan> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_lesson_plans")
    .update({ is_active })
    .eq("id", id)
    .select(PLAN_SELECT)
    .single();
  if (error) throw error;
  return planRowToPlan(data as unknown as Parameters<typeof planRowToPlan>[0]);
}

// ---- Matrículas ----

export async function fetchEnrollments(): Promise<SchoolEnrollment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_enrollments")
    .select(ENROLLMENT_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Parameters<typeof enrollmentRowToEnrollment>[0][]).map(enrollmentRowToEnrollment);
}

export async function fetchEnrollment(id: string): Promise<SchoolEnrollment | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_enrollments")
    .select(ENROLLMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? enrollmentRowToEnrollment(data as unknown as Parameters<typeof enrollmentRowToEnrollment>[0]) : null;
}

export async function fetchCreditMovements(enrollmentId: string): Promise<CreditMovement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_class_credit_movements")
    .select("id, enrollment_id, lesson_id, kind, amount, reason, created_by, created_at")
    .eq("enrollment_id", enrollmentId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as CreditMovement[];
}

/**
 * Matricula a un alumno en un plan.
 *
 * La base CREA la matrícula, congela el snapshot, asigna los créditos y
 * devuelve el saldo. `sale_id` opcional: una matrícula sin venta es válida; la
 * venta del POS solo debe viajar cuando la venta quedó `completed` (factura,
 * no promesa de pago).
 */
export async function schoolEnroll(input: EnrollmentInput): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_enroll", {
    p_student_id: input.student_id,
    p_lesson_plan_id: input.lesson_plan_id,
    p_instrument: input.instrument,
    ...(input.sale_id ? { p_sale_id: input.sale_id } : {}),
    ...(input.payer_customer_id ? { p_payer_customer_id: input.payer_customer_id } : {}),
    ...(input.default_teacher_profile_id
      ? { p_default_teacher_profile_id: input.default_teacher_profile_id }
      : {}),
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

// ---- Resumen del dashboard de la escuela ----

export async function fetchSchoolSummary(): Promise<SchoolSummary> {
  const supabase = createClient();

  const [students, teachers, plans, enrollments, movements, expiring] = await Promise.all([
    supabase.from("school_students").select("id", { count: "exact", head: true }),
    supabase.from("school_teacher_profiles").select("id", { count: "exact", head: true }),
    supabase.from("school_lesson_plans").select("id", { count: "exact", head: true }),
    supabase.from("school_enrollments").select("id, status"),
    supabase.from("school_class_credit_movements").select("amount, enrollment_id, school_enrollments(status)"),
    supabase
      .from("school_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lte("expiry_date", new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .gt("expiry_date", new Date().toISOString().slice(0, 10)),
  ]);

  const errs = [students.error, teachers.error, plans.error, enrollments.error, movements.error, expiring.error].find(Boolean);
  if (errs) throw errs;

  const rows = (enrollments.data ?? []) as unknown as { id: string; status: string }[];
  const activeEnrollments = new Set(
    rows.filter((r) => r.status === "active").map((r) => r.id)
  );

  const movementRows = (movements.data ?? []) as unknown as {
    amount: number;
    enrollment_id: string;
    school_enrollments?: unknown;
  }[];
  const totalBalance = movementRows.reduce((acc, m) => {
    const joined = m.school_enrollments;
    const status = Array.isArray(joined)
      ? ((joined[0] as { status?: string })?.status ?? "")
      : ((joined as { status?: string })?.status ?? "");
    return status === "active" ? acc + m.amount : acc;
  }, 0);

  return {
    students: students.count ?? 0,
    teachers: teachers.count ?? 0,
    plans: plans.count ?? 0,
    enrollments: rows.length,
    active_enrollments: activeEnrollments.size,
    total_balance: totalBalance,
    expiring_soon: expiring.count ?? 0,
  };
}