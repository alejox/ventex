import { toMessage } from "@/lib/errors";
import { createClient } from "@/utils/supabase/client";
import { whatsappLink } from "@/services/promos.service";

// ============================================================================
// Materiales + comunicación (fase 5 / U4).
//
// La parte PURA vive arriba (sin I/O, cubierta por
// `tests/school-messages.test.ts`): plantillas de mensaje, reemplazo de
// variables, singularización, límite de datos personales y las URLs de los
// enlaces de token. El acceso a datos (materiales, enlaces de acceso,
// proyección familiar, bitácora) va después, siguiendo el mismo patrón de
// `school-classes.service.ts`: los RPC de la migración 0100 son los únicos
// que escriben; acá solo se arman los argumentos y se decodifica la respuesta.
// ============================================================================

// ---- Tipos del dominio ----

export type CommunicationPurpose = "attendance" | "reschedule" | "material" | "reminder" | "other";
export type CommunicationState = "prepared" | "shared";
export type MaterialKind = "file" | "link";

export interface GateResult {
  ok: boolean;
  reason?: string;
}

export const SCHOOL_MESSAGE_PURPOSE_LABELS: Record<CommunicationPurpose, string> = {
  attendance: "Asistencia",
  reschedule: "Reprogramación",
  material: "Material",
  reminder: "Recordatorio",
  other: "Otro",
};

/**
 * Plantillas por defecto (una por propósito con variables conocidas). `other`
 * no tiene plantilla: es texto libre del operador, sin variables que rellenar.
 *
 * Cada plantilla usa SOLO datos del alumno destinatario y su propio acudiente
 * — nunca el nombre de otro alumno ni el contacto de otra familia. Esto es una
 * garantía de DISEÑO, no una validación en tiempo de ejecución: el llamador
 * arma `vars` con los datos de un único estudiante (ver `renderSchoolMessage`),
 * así que no existe una ruta por la que el texto renderizado incluya a un
 * segundo alumno.
 */
export const DEFAULT_SCHOOL_TEMPLATES: Record<
  Exclude<CommunicationPurpose, "other">,
  string
> = {
  attendance:
    "Hola {acudiente}, te contamos la asistencia de {alumno} en la clase de {instrumento} del {fecha}: {estado}.",
  reschedule:
    "Hola {acudiente}, la clase de {instrumento} de {alumno} se reprogramó: pasa del {fecha_anterior} al {fecha_nueva}.",
  material:
    'Hola {acudiente}, subimos material nuevo para {alumno}: "{titulo}". Podés verlo en tu enlace de la escuela: {enlace}',
  reminder:
    "Hola {acudiente}, te recordamos la clase de {instrumento} de {alumno} el {fecha} a las {hora}. Saldo del plan: {clases} clases.",
};

/**
 * Con 1 clase restante, la palabra pegada al token va en singular ("Le queda
 * 1 clase" y no "Le queda 1 clases"). Mismo defecto y misma solución que
 * `singularizarJuntoAl` de `services/promos.service.ts`: se corrige sobre la
 * PLANTILLA (la palabra la escribe el negocio) y solo en la palabra pegada al
 * token, para no tocar otro "1 algo" del mensaje.
 */
function singularizarJuntoAlToken(template: string, token: string, valor: number): string {
  if (valor !== 1) return template;
  return template.replace(
    new RegExp(`\\{${token}\\}(\\s+)(\\p{L}+)`, "gu"),
    (match, espacio: string, palabra: string) => {
      if (!palabra.endsWith("s")) return match;
      const singular = palabra.endsWith("ces") ? `${palabra.slice(0, -3)}z` : palabra.slice(0, -1);
      return `{${token}}${espacio}${singular}`;
    }
  );
}

/**
 * Reemplaza las variables de una plantilla de escuela.
 *
 * Los valores se insertan con una función de reemplazo (nunca como segundo
 * argumento string de `String.replace`, que interpreta `$&`/`$1`/`$'`): el
 * título de un material o el motivo de un cambio los escribe una persona, y
 * un texto con un `$&` adentro se corrompía solo al insertarse (mismo defecto
 * documentado en `renderPromoMessage`). Una variable sin valor se va a la
 * cadena vacía y no queda como `{token}` colgando en el mensaje final.
 */
export function renderSchoolMessage(
  template: string | null,
  purpose: Exclude<CommunicationPurpose, "other">,
  vars: Record<string, string | number>
): string {
  let base = template?.trim() || DEFAULT_SCHOOL_TEMPLATES[purpose];

  if (typeof vars.clases === "number") {
    base = singularizarJuntoAlToken(base, "clases", vars.clases);
  }

  const literal = (valor: string) => () => valor;
  let out = base;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), literal(String(value)));
  }

  return out
    .replace(/\{[a-zA-Z_]+\}/g, "") // variable sin valor provisto → vacío
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * URL de WhatsApp para compartir un mensaje. Con teléfono conocido usa
 * `whatsappLink` (precedente de promos); sin teléfono cae al enlace `wa.me`
 * sin destinatario —mismo recurso que ya usa `RescheduleDialog` para compartir
 * un cambio— que abre WhatsApp con el texto listo y deja que la persona elija
 * el contacto. Nunca devuelve null: siempre hay algo que abrir.
 */
export function shareWhatsAppUrl(phone: string | null | undefined, message: string): string {
  return whatsappLink(phone ?? null, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** URL pública de la página familiar (anon, fuera de `/dashboard`). */
export function buildFamilyLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/school/f/${token}`;
}

/** URL pública de la página de confirmación del profesor (anon, POST-only). */
export function buildConfirmLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/school/c/${token}`;
}

/**
 * Compuerta de envío: honra `notices_enabled` del acudiente. La base también
 * la revalida en `school_log_communication` (falla cerrado); esto es para
 * avisar temprano en la UI y no mostrar un botón que la base va a rechazar.
 */
export function noticeShareGate(guardian: { notices_enabled: boolean }): GateResult {
  if (!guardian.notices_enabled) {
    return { ok: false, reason: "este acudiente tiene los avisos desactivados" };
  }
  return { ok: true };
}

/**
 * Espejo puro del CHECK `school_materials_exactly_one`: un material es
 * archivo O enlace externo, nunca los dos ni ninguno. Sirve para deshabilitar
 * el botón de guardar antes de que la base lo rechace.
 */
export function materialInputGate(input: {
  kind: MaterialKind;
  hasFile: boolean;
  externalUrl: string;
}): GateResult {
  if (input.kind === "file") {
    return input.hasFile
      ? { ok: true }
      : { ok: false, reason: "seleccioná un archivo para subir" };
  }
  const url = input.externalUrl.trim();
  if (!url) return { ok: false, reason: "escribí el enlace externo" };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, reason: "el enlace debe empezar con http:// o https://" };
  }
  return { ok: true };
}

/**
 * Cuota de almacenamiento: cuánto queda y si el archivo entra. Se recalcula
 * server-side en `/api/school/upload` (nunca confiando en el cliente); esto
 * es para avisar temprano en el formulario.
 */
export function quotaGate(usedBytes: number, quotaBytes: number, fileSize: number): GateResult {
  if (usedBytes + fileSize > quotaBytes) {
    const restanteMb = Math.max(0, (quotaBytes - usedBytes) / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `supera la cuota de almacenamiento del negocio (quedan ${restanteMb} MB)`,
    };
  }
  return { ok: true };
}

/**
 * Traduce los errores de los enlaces de token (`LINK_INVALIDO`,
 * `LINK_VENCIDO`, y el `LINK_INVALIDO: …revocado…` de
 * `school_confirm_lesson_by_token`) a un mensaje en español. Lo que no
 * reconoce cae en `toMessage` (que ya traduce `SIN_PERMISO:`).
 */
export function schoolLinkErrorOf(e: unknown): string {
  const raw =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string"
        ? (e as { message: string }).message
        : "";
  if (/revocad[oa]|usó/i.test(raw)) return "El enlace fue revocado o ya se usó.";
  if (/^LINK_VENCIDO/.test(raw)) return "El enlace venció. Pedí uno nuevo.";
  if (/^LINK_INVALIDO/.test(raw)) return "El enlace no es válido.";
  return toMessage(e);
}

// ============================================================================
// Acceso a datos (I/O) — materiales, enlaces de acceso y bitácora
//
// Los RPC `school_*` de la migración 0100 (ya aplicada en la fase 1) son los
// únicos que emiten/revocan tokens y escriben la bitácora; acá solo se arman
// los argumentos y se decodifica la respuesta. El CRUD de `school_materials`
// va por tabla directa, mismo patrón que `school-people.service.ts`.
// ============================================================================

export interface SchoolMaterial {
  id: string;
  title: string;
  instructions: string | null;
  kind: MaterialKind;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  external_url: string | null;
  lesson_id: string | null;
  created_at: string;
  /** Alumnos destinatarios (join con `school_material_recipients`). */
  recipient_student_ids: string[];
}

export interface NewMaterialFileInput {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface NewMaterialInput {
  title: string;
  instructions?: string | null;
  kind: MaterialKind;
  externalUrl?: string | null;
  /** Requerido cuando `kind === "file"`: lo entrega `/api/school/upload`. */
  file?: NewMaterialFileInput | null;
  lessonId?: string | null;
  authorStaffId?: string | null;
  recipientStudentIds: string[];
}

const MATERIAL_SELECT =
  "id, title, instructions, kind, file_path, file_name, file_size, mime_type, external_url, lesson_id, created_at, school_material_recipients(student_id)";

function mapMaterial(raw: Record<string, unknown>): SchoolMaterial {
  const recipients = (raw.school_material_recipients as { student_id: string }[] | null) ?? [];
  return {
    id: raw.id as string,
    title: raw.title as string,
    instructions: (raw.instructions as string | null) ?? null,
    kind: raw.kind as MaterialKind,
    file_path: (raw.file_path as string | null) ?? null,
    file_name: (raw.file_name as string | null) ?? null,
    file_size: (raw.file_size as number | null) ?? null,
    mime_type: (raw.mime_type as string | null) ?? null,
    external_url: (raw.external_url as string | null) ?? null,
    lesson_id: (raw.lesson_id as string | null) ?? null,
    created_at: raw.created_at as string,
    recipient_student_ids: recipients.map((r) => r.student_id),
  };
}

/** Todo el material del negocio, con sus destinatarios. */
export async function fetchMaterials(): Promise<SchoolMaterial[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_materials")
    .select(MATERIAL_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMaterial);
}

const MATERIAL_SELECT_FOR_STUDENT = MATERIAL_SELECT.replace(
  "school_material_recipients(student_id)",
  "school_material_recipients!inner(student_id)"
);

/** Material dirigido a UN alumno (ficha del estudiante). */
export async function fetchMaterialsForStudent(studentId: string): Promise<SchoolMaterial[]> {
  const supabase = createClient();
  // `!inner` filtra el join: sin él, `.eq` sobre una columna embebida no
  // recorta filas y devolvería material de otros alumnos (mismo patrón que
  // `services/credits.service.ts` y `services/staff.service.ts`).
  const { data, error } = await supabase
    .from("school_materials")
    .select(MATERIAL_SELECT_FOR_STUDENT)
    .eq("school_material_recipients.student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMaterial);
}

/**
 * Crea el material y sus destinatarios. El archivo ya fue subido al bucket
 * por `/api/school/upload` (validación server-side); acá solo se registra la
 * fila y el enlace archivo↔alumnos. `kind`/`file`/`externalUrl` respetan el
 * CHECK `school_materials_exactly_one` — `materialInputGate` lo valida antes.
 */
export async function createMaterial(input: NewMaterialInput): Promise<SchoolMaterial> {
  const supabase = createClient();
  const payload = {
    title: input.title.trim(),
    instructions: input.instructions?.trim() || null,
    kind: input.kind,
    file_path: input.kind === "file" ? (input.file?.path ?? null) : null,
    file_name: input.kind === "file" ? (input.file?.name ?? null) : null,
    file_size: input.kind === "file" ? (input.file?.size ?? null) : null,
    mime_type: input.kind === "file" ? (input.file?.mimeType ?? null) : null,
    external_url: input.kind === "link" ? (input.externalUrl?.trim() ?? null) : null,
    lesson_id: input.lessonId ?? null,
    author_staff_id: input.authorStaffId ?? null,
  };
  const { data, error } = await supabase
    .from("school_materials")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  const materialId = (data as { id: string }).id;

  if (input.recipientStudentIds.length > 0) {
    const { error: recErr } = await supabase.from("school_material_recipients").insert(
      input.recipientStudentIds.map((studentId) => ({ material_id: materialId, student_id: studentId }))
    );
    if (recErr) throw recErr;
  }

  const { data: full, error: fetchErr } = await supabase
    .from("school_materials")
    .select(MATERIAL_SELECT)
    .eq("id", materialId)
    .single();
  if (fetchErr) throw fetchErr;
  return mapMaterial(full as unknown as Record<string, unknown>);
}

/** Borra el material (los destinatarios se van en cascada). */
export async function deleteMaterial(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("school_materials").delete().eq("id", id);
  if (error) throw error;
}

/** Bytes ya usados por el negocio (suma de `file_size`, ignora los enlaces). */
export async function fetchStorageUsageBytes(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.from("school_materials").select("file_size");
  if (error) throw error;
  return ((data ?? []) as { file_size: number | null }[]).reduce(
    (acc, m) => acc + (m.file_size ?? 0),
    0
  );
}

// ---- Enlaces de acceso (confirmación del profesor / lectura familiar) ----

export interface AccessLinkResult {
  link_id: string;
  token: string;
  expires_at: string;
}

function mapAccessLink(raw: Record<string, unknown>): AccessLinkResult {
  return {
    link_id: raw.link_id as string,
    token: raw.token as string,
    expires_at: raw.expires_at as string,
  };
}

/** Enlace de confirmación para el profesor (24 h, un solo uso). */
export async function createConfirmLink(lessonId: string): Promise<AccessLinkResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_create_confirm_link", {
    p_lesson_id: lessonId,
  });
  if (error) throw error;
  return mapAccessLink((data ?? {}) as Record<string, unknown>);
}

/** Enlace de lectura familiar (7 días por defecto; regenerar revoca el previo). */
export async function createFamilyLink(
  studentId: string,
  guardianCustomerId: string,
  hours = 168
): Promise<AccessLinkResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("school_create_family_link", {
    p_student_id: studentId,
    p_guardian_customer_id: guardianCustomerId,
    p_hours: hours,
  });
  if (error) throw error;
  return mapAccessLink((data ?? {}) as Record<string, unknown>);
}

/** Revoca un enlace (deja de servir de inmediato). */
export async function revokeLink(linkId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("school_revoke_link", { p_link_id: linkId });
  if (error) throw error;
}

// ---- Bitácora de comunicación (solo estados observables) ----

export interface LogCommunicationInput {
  studentId: string;
  guardianCustomerId: string;
  purpose: CommunicationPurpose;
  state: CommunicationState;
  message?: string;
}

export interface CommunicationLogEntry {
  id: string;
  purpose: CommunicationPurpose;
  state: CommunicationState;
  recipient_phone: string | null;
  recipient_name: string | null;
  message: string | null;
  student_id: string | null;
  guardian_customer_id: string | null;
  created_at: string;
}

/**
 * Registra el estado observable de un envío. `school_log_communication`
 * revalida `notices_enabled` server-side y falla cerrado si el acudiente
 * desactivó los avisos — acá `noticeShareGate` solo evita mostrar el botón.
 */
export async function logCommunication(
  input: LogCommunicationInput
): Promise<{ id: string; state: CommunicationState }> {
  const supabase = createClient();
  const trimmedMessage = input.message?.trim() || undefined;
  const { data, error } = await supabase.rpc("school_log_communication", {
    p_student_id: input.studentId,
    p_guardian_customer_id: input.guardianCustomerId,
    p_purpose: input.purpose,
    p_state: input.state,
    ...(trimmedMessage ? { p_message: trimmedMessage } : {}),
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return { id: raw.id as string, state: raw.state as CommunicationState };
}

/** Bitácora de comunicación de UN alumno, más reciente primero. */
export async function fetchCommunicationLog(studentId: string): Promise<CommunicationLogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("school_communication_log")
    .select(
      "id, purpose, state, recipient_phone, recipient_name, message, student_id, guardian_customer_id, created_at"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CommunicationLogEntry[];
}

/** Sube un archivo de material vía la ruta de servidor (validación server-side). */
export async function uploadMaterialFile(file: File): Promise<NewMaterialFileInput> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/school/upload", { method: "POST", body: formData });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((body.error as string) || "No se pudo subir el archivo.");
  }
  return {
    path: body.path as string,
    name: body.name as string,
    size: body.size as number,
    mimeType: body.mimeType as string,
  };
}
