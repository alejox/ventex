import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Cliente de Supabase SOLO PARA VERIFICAR estado tras acciones hechas por la
// UI — nunca para mutar. Se autentica con la MISMA cuenta E2E (E2E_EMAIL /
// E2E_PASSWORD, ya usada por el login de Playwright), así que lee bajo las
// mismas políticas RLS que la app: no es un bypass de service-role.
//
// Se usa donde no hay pantalla que muestre el dato (la bitácora de
// comunicación no tiene UI en el dashboard) o para obtener IDs/instantes
// exactos en vez de raspar el DOM (los lessons de una serie, por ejemplo).
//
// Lee NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY del entorno
// del proceso de test (pásalos como variables de entorno al invocar
// `playwright test`, igual que E2E_EMAIL/E2E_PASSWORD) — ninguna de las dos
// es secreta (son las mismas que el bundle del navegador expone).
// ============================================================================

let client: SupabaseClient | null = null;
let signInPromise: Promise<void> | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name} en el entorno del test runner (db helper de verificación).`
    );
  }
  return value;
}

export async function dbClient(): Promise<SupabaseClient> {
  if (!client) {
    client = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    );
  }
  if (!signInPromise) {
    signInPromise = (async () => {
      const email = process.env.E2E_EMAIL ?? process.env.TEST_EMAIL;
      const password = process.env.E2E_PASSWORD ?? process.env.TEST_PASSWORD;
      if (!email || !password) {
        throw new Error(
          "Falta E2E_EMAIL / E2E_PASSWORD (o TEST_EMAIL / TEST_PASSWORD) en el entorno del test runner."
        );
      }
      const { error } = await client!.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Tenancy no es solo `auth.uid()`: `get_effective_user_id()` resuelve
      // por `workspace_session_selections`, una fila por SESIÓN (no por
      // usuario) que la app arma en `resolveWorkspaceForDashboard()`
      // (services/workspace.server.ts) al entrar a /dashboard. Una sesión de
      // Node recién autenticada no tiene esa fila todavía — sin este paso,
      // toda tabla tenant-scoped (services, school_*, customers…) devuelve 0
      // filas por RLS, no un error, así que el síntoma es "no encontrado" en
      // vez de un 403 explícito. Se replica exactamente lo que hace el
      // dashboard cuando hay UNA sola workspace disponible (el caso de la
      // cuenta E2E: un solo negocio, dueño).
      const { data: ctx, error: ctxErr } = await client!.rpc("workspace_context");
      if (ctxErr) throw ctxErr;
      const context = ctx as {
        active: { workspace_id: string } | null;
        available: { workspace_id: string }[];
      } | null;
      if (!context?.active && context?.available?.length === 1) {
        const { error: selErr } = await client!.rpc("select_active_workspace", {
          p_workspace_id: context.available[0].workspace_id,
        });
        if (selErr) throw selErr;
      } else if (!context?.active) {
        throw new Error(
          `dbClient(): la cuenta E2E no tiene exactamente una workspace disponible sin seleccionar ` +
            `(available=${context?.available?.length ?? 0}) — el helper de verificación no sabe cuál activar.`
        );
      }
    })();
  }
  await signInPromise;
  return client;
}

export interface DbCustomer {
  id: string;
  full_name: string;
}

export async function getCustomerByName(name: string): Promise<DbCustomer> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("customers")
    .select("id, full_name")
    .eq("full_name", name)
    .single();
  if (error) throw new Error(`getCustomerByName(${name}): ${error.message}`);
  return data as unknown as DbCustomer;
}

export async function getServiceIdByName(name: string): Promise<string> {
  const sb = await dbClient();
  const { data, error } = await sb.from("services").select("id").eq("name", name).single();
  if (error) throw new Error(`getServiceIdByName(${name}): ${error.message}`);
  return (data as { id: string }).id;
}

/** Como `getServiceIdByName`, pero `null` en vez de tirar cuando no existe. */
export async function findServiceIdByName(name: string): Promise<string | null> {
  const sb = await dbClient();
  const { data, error } = await sb.from("services").select("id").eq("name", name).maybeSingle();
  if (error) throw new Error(`findServiceIdByName(${name}): ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

export interface DbPlan {
  id: string;
  name: string;
  lesson_count: number;
}

/** Cualquier plan ya vinculado a ese servicio — se reusa en vez de duplicar. */
export async function findAnyPlanForService(serviceId: string): Promise<DbPlan | null> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_lesson_plans")
    .select("id, name, lesson_count")
    .eq("service_id", serviceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findAnyPlanForService(${serviceId}): ${error.message}`);
  return (data as DbPlan | null) ?? null;
}

export async function getStaffIdByName(name: string): Promise<string> {
  const sb = await dbClient();
  const { data, error } = await sb.from("staff").select("id").eq("full_name", name).single();
  if (error) throw new Error(`getStaffIdByName(${name}): ${error.message}`);
  return (data as { id: string }).id;
}

/** `null` en vez de tirar cuando no hay un cliente con ese nombre. */
export async function findCustomerIdByName(name: string): Promise<string | null> {
  const sb = await dbClient();
  const { data, error } = await sb.from("customers").select("id").eq("full_name", name).maybeSingle();
  if (error) throw new Error(`findCustomerIdByName(${name}): ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

export interface DbStaff {
  id: string;
  full_name: string;
  status: string;
}

/**
 * El plan gratis de la cuenta E2E permite UN solo colaborador
 * (`my_subscription().max_collaborators`) — nunca puede haber más de una fila
 * en `staff`. En vez de buscar por nombre (que cambia de corrida en corrida
 * si no se normalizó todavía), esto trae "la única" que exista, sea cual sea
 * su nombre actual.
 */
export async function findAnyStaff(): Promise<DbStaff | null> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("staff")
    .select("id, full_name, status")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findAnyStaff(): ${error.message}`);
  return (data as DbStaff | null) ?? null;
}

export interface DbTeacherProfile {
  id: string;
  staff_id: string;
  instruments: string[];
}

export async function findTeacherProfileByStaffId(staffId: string): Promise<DbTeacherProfile | null> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_teacher_profiles")
    .select("id, staff_id, instruments")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (error) throw new Error(`findTeacherProfileByStaffId(${staffId}): ${error.message}`);
  return (data as DbTeacherProfile | null) ?? null;
}

export interface DbStudent {
  id: string;
  customer_id: string;
  instrument: string;
}

export async function getStudentByCustomerId(customerId: string): Promise<DbStudent> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_students")
    .select("id, customer_id, instrument")
    .eq("customer_id", customerId)
    .single();
  if (error) throw new Error(`getStudentByCustomerId(${customerId}): ${error.message}`);
  return data as unknown as DbStudent;
}

/** Como `getStudentByCustomerId`, pero `null` en vez de tirar cuando no existe. */
export async function findStudentByCustomerId(customerId: string): Promise<DbStudent | null> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_students")
    .select("id, customer_id, instrument")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`findStudentByCustomerId(${customerId}): ${error.message}`);
  return (data as DbStudent | null) ?? null;
}

export interface DbGuardian {
  id: string;
  student_id: string;
  customer_id: string;
  is_notice_receiver: boolean;
}

export async function findGuardianForStudent(
  studentId: string,
  customerId: string
): Promise<DbGuardian | null> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_student_guardians")
    .select("id, student_id, customer_id, is_notice_receiver")
    .eq("student_id", studentId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`findGuardianForStudent(${studentId}, ${customerId}): ${error.message}`);
  return (data as DbGuardian | null) ?? null;
}

export interface DbEnrollment {
  id: string;
  student_id: string;
  status: string;
  contracted_lessons: number;
  plan_name: string;
}

export async function getEnrollmentByStudent(studentId: string): Promise<DbEnrollment> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_enrollments")
    .select("id, student_id, status, contracted_lessons, plan_name")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`getEnrollmentByStudent(${studentId}): ${error.message}`);
  return data as unknown as DbEnrollment;
}

export interface DbLesson {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
}

/** Clases de una matrícula (vía sus participaciones), ordenadas por inicio. */
export async function getLessonsForEnrollment(enrollmentId: string): Promise<DbLesson[]> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_lesson_participants")
    .select("school_lessons(id, start_at, end_at, status)")
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error(`getLessonsForEnrollment(${enrollmentId}): ${error.message}`);
  const rows = (data ?? []) as unknown as { school_lessons: DbLesson | DbLesson[] | null }[];
  const lessons = rows
    .map((r) => (Array.isArray(r.school_lessons) ? r.school_lessons[0] : r.school_lessons))
    .filter((l): l is DbLesson => Boolean(l));
  return lessons.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}

export async function getLessonById(lessonId: string): Promise<DbLesson> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_lessons")
    .select("id, start_at, end_at, status")
    .eq("id", lessonId)
    .single();
  if (error) throw new Error(`getLessonById(${lessonId}): ${error.message}`);
  return data as unknown as DbLesson;
}

export interface DbCreditMovement {
  id: string;
  kind: string;
  amount: number;
  lesson_id: string | null;
}

export async function getCreditMovements(enrollmentId: string): Promise<DbCreditMovement[]> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_class_credit_movements")
    .select("id, kind, amount, lesson_id")
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error(`getCreditMovements(${enrollmentId}): ${error.message}`);
  return (data ?? []) as unknown as DbCreditMovement[];
}

export interface DbCommunicationLogEntry {
  id: string;
  purpose: string;
  state: string;
}

export async function getCommunicationLog(studentId: string): Promise<DbCommunicationLogEntry[]> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_communication_log")
    .select("id, purpose, state")
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getCommunicationLog(${studentId}): ${error.message}`);
  return (data ?? []) as unknown as DbCommunicationLogEntry[];
}

export interface DbMaterial {
  id: string;
  title: string;
  kind: string;
}

export async function getMaterialsForStudent(studentId: string): Promise<DbMaterial[]> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_material_recipients")
    .select("school_materials(id, title, kind)")
    .eq("student_id", studentId);
  if (error) throw new Error(`getMaterialsForStudent(${studentId}): ${error.message}`);
  const rows = (data ?? []) as unknown as { school_materials: DbMaterial | DbMaterial[] | null }[];
  return rows
    .map((r) => (Array.isArray(r.school_materials) ? r.school_materials[0] : r.school_materials))
    .filter((m): m is DbMaterial => Boolean(m));
}

export interface DbRescheduleRequest {
  id: string;
  lesson_id: string;
  status: string;
}

export async function getRescheduleRequestsForLesson(
  lessonId: string
): Promise<DbRescheduleRequest[]> {
  const sb = await dbClient();
  const { data, error } = await sb
    .from("school_reschedule_requests")
    .select("id, lesson_id, status")
    .eq("lesson_id", lessonId);
  if (error) throw new Error(`getRescheduleRequestsForLesson(${lessonId}): ${error.message}`);
  return (data ?? []) as unknown as DbRescheduleRequest[];
}
