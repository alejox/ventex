import { createClient } from "@/utils/supabase/client";

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
  /** Rango de edad opcional del grupo. Solo AVISA al matricular; nada lo obliga en la base. */
  min_age: number | null;
  max_age: number | null;
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
  min_age?: number | null;
  max_age?: number | null;
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
  /**
   * Personal ACTIVO sin fila en `school_teacher_profiles`. Nunca es la fuente
   * de `teachers` (ese sigue siendo el conteo de perfiles) — esto es el aviso
   * de "faltó activar 'Es profesor'" que motivó T7: alguien creado en
   * Personal sin tildar el checkbox no cuenta como profesor en el resumen.
   */
  staff_without_teacher_profile: number;
  /** Clases agendadas alguna vez (cualquier estado). Paso 5 de "Primeros pasos" (T10). */
  lessons: number;
}

const PLAN_SELECT =
  "id, name, service_id, lesson_count, duration_minutes, validity_days, max_group_size, min_age, max_age, is_active, created_at, services(name)";
const ENROLLMENT_SELECT =
  "id, student_id, lesson_plan_id, instrument, status, start_date, expiry_date, contracted_lessons, plan_name, plan_price, plan_validity_days, reschedule_count, sale_id, default_teacher_profile_id, created_at, school_students(full_name)";

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
    min_age: (raw.min_age as number | null) ?? null,
    max_age: (raw.max_age as number | null) ?? null,
    is_active: (raw.is_active as boolean) ?? true,
    created_at: raw.created_at as string,
  };
}

function enrollmentRowToEnrollment(raw: Record<string, unknown> & { school_students?: unknown }): SchoolEnrollment {
  let student_name = "Sin nombre";
  const joined = raw.school_students;
  if (joined) {
    const studentRow = Array.isArray(joined) ? ((joined[0] as Record<string, unknown>) ?? {}) : (joined as Record<string, unknown>);
    student_name = (studentRow?.full_name as string) ?? student_name;
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
 * Edad cumplida en `today` a partir de una fecha de nacimiento `YYYY-MM-DD`.
 *
 * Compara solo mes/día (nunca construye un `Date` con el año de `today`), así
 * que un cumpleaños 29 de febrero cae en el 1 de marzo en un año no bisiesto
 * en vez de reventar o saltarse el año — la misma resolución que ya usan los
 * calendarios civiles para ese caso. `null` si no hay fecha (dato opcional).
 */
export function ageOn(birthDate: string | null | undefined, today: Date): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  const hadBirthdayThisYear =
    today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/** Texto del rango de edad de un plan, o "" si el plan no tiene rango. */
export function ageRangeLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return "";
  if (min !== null && max !== null) return `${min}–${max} años`;
  if (min !== null) return `Desde ${min} años`;
  return `Hasta ${max} años`;
}

/**
 * Si `age` cae fuera de [min, max]. Devuelve `false` (nunca avisa) cuando
 * falta la edad o el plan no tiene rango — el aviso es estrictamente
 * adicional, nunca bloquea la matrícula (decisión del negocio, 2026-09-26).
 */
export function isOutsideAgeRange(age: number | null, min: number | null, max: number | null): boolean {
  if (age === null) return false;
  if (min === null && max === null) return false;
  if (min !== null && age < min) return true;
  if (max !== null && age > max) return true;
  return false;
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
      min_age: input.min_age ?? null,
      max_age: input.max_age ?? null,
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
      min_age: input.min_age ?? null,
      max_age: input.max_age ?? null,
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

/**
 * Pura: cuenta cuántos ids de personal activo no aparecen entre los ids de
 * personal que sí tienen perfil docente. Separada de `fetchSchoolSummary`
 * para poder testearla sin tocar Supabase (tests/school-enrollments.test.ts).
 */
export function countStaffWithoutTeacherProfile(
  activeStaffIds: string[],
  teacherStaffIds: string[],
): number {
  const withProfile = new Set(teacherStaffIds);
  return activeStaffIds.filter((id) => !withProfile.has(id)).length;
}

export async function fetchSchoolSummary(): Promise<SchoolSummary> {
  const supabase = createClient();

  const [students, teachers, plans, enrollments, movements, expiring, activeStaff, teacherProfiles, lessons] =
    await Promise.all([
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
      // Sin cabezal `count`: hace falta la lista de ids, no solo cuántos, para
      // poder restarle los que ya tienen perfil docente.
      supabase.from("staff").select("id").eq("status", "active"),
      supabase.from("school_teacher_profiles").select("staff_id"),
      // "¿Ya agendó la primera clase?" (paso 5 de Primeros pasos) — cualquier
      // estado cuenta, incluso una cancelada: lo que importa es que alguien ya
      // pasó por la agenda, no cuántas clases quedan vigentes.
      supabase.from("school_lessons").select("id", { count: "exact", head: true }),
    ]);

  const errs = [
    students.error,
    teachers.error,
    plans.error,
    enrollments.error,
    movements.error,
    expiring.error,
    activeStaff.error,
    teacherProfiles.error,
    lessons.error,
  ].find(Boolean);
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

  const activeStaffIds = ((activeStaff.data ?? []) as unknown as { id: string }[]).map((s) => s.id);
  const teacherStaffIds = ((teacherProfiles.data ?? []) as unknown as { staff_id: string }[]).map(
    (t) => t.staff_id,
  );

  return {
    students: students.count ?? 0,
    teachers: teachers.count ?? 0,
    plans: plans.count ?? 0,
    enrollments: rows.length,
    active_enrollments: activeEnrollments.size,
    total_balance: totalBalance,
    expiring_soon: expiring.count ?? 0,
    staff_without_teacher_profile: countStaffWithoutTeacherProfile(activeStaffIds, teacherStaffIds),
    lessons: lessons.count ?? 0,
  };
}

// ---- "Primeros pasos" (Resumen) ----

export interface OnboardingStepInput {
  instrumentsCount: number;
  teachersCount: number;
  plansCount: number;
  activeEnrollments: number;
  lessonsCount: number;
}

export interface OnboardingStep {
  id: string;
  label: string;
  href: string;
  done: boolean;
}

/**
 * Pura: el orden REAL en el que un negocio nuevo tiene que avanzar (T10).
 * Cada paso se marca hecho con un dato que YA existe en la base — nunca un
 * checkbox que el dueño tilda a mano — para que la lista no pueda mentir.
 * Separada de la página para poder testearla sin DOM
 * (tests/school-enrollments.test.ts).
 */
export function onboardingSteps(input: OnboardingStepInput): OnboardingStep[] {
  return [
    {
      id: "instruments",
      label: "Configurá las especialidades en Configuración",
      href: "/dashboard/school/config",
      done: input.instrumentsCount > 0,
    },
    {
      id: "teacher",
      label: "Activá el perfil docente de un profesor en Personal",
      href: "/dashboard/staff",
      done: input.teachersCount > 0,
    },
    {
      id: "plan",
      label: "Armá un plan de clase",
      href: "/dashboard/school/planes",
      done: input.plansCount > 0,
    },
    {
      id: "student",
      label: "Registrá un alumno y matriculalo en un plan",
      href: "/dashboard/school/estudiantes",
      done: input.activeEnrollments > 0,
    },
    {
      id: "agenda",
      label: "Agendá la primera clase en la Agenda",
      href: "/dashboard/school/agenda",
      done: input.lessonsCount > 0,
    },
  ];
}

/** Todos los pasos hechos: la lista deja de mostrarse (T10). */
export function allOnboardingStepsDone(steps: OnboardingStep[]): boolean {
  return steps.every((s) => s.done);
}