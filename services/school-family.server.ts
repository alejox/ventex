import { createHash } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Llamadas ANON del módulo escuela, solo desde el servidor.
 *
 * `school_family_payload` y `school_confirm_lesson_by_token` son los DOS
 * únicos RPC ejecutables por `anon` de todo el cambio (ver migración 0100): el
 * tenant se deriva de la fila que resuelve el TOKEN, nunca del llamador —por
 * eso este archivo nunca recibe un `user_id` ni un `workspaceId` como
 * parámetro. Se usa el cliente admin (service_role) por conveniencia de
 * transporte del lado servidor; el aislamiento real lo hace el propio RPC
 * (SECURITY DEFINER, búsqueda por hash del token, expiración/revocación).
 *
 * Nunca importar este archivo desde un Client Component: solo las rutas de
 * `/api/school/*` y las páginas `/school/f/[token]` y `/school/c/[token]`
 * (Server Components) lo usan.
 */

/** Proyección familiar completa: alumno, acudientes, próxima clase y material. */
export interface FamilyPayload {
  student: {
    id: string;
    full_name: string;
    instrument: string;
    level: string | null;
    status: string;
  };
  guardians: { customer_id: string; relationship: string | null; is_notice_receiver: boolean }[];
  next_lesson: {
    lesson_id: string;
    start_at: string;
    end_at: string;
    instrument: string;
    room: string | null;
    status: string;
  } | null;
  materials: {
    id: string;
    title: string;
    instructions: string | null;
    kind: "file" | "link";
    created_at: string;
  }[];
}

/**
 * Trae la proyección familiar del token. El GET de la página SOLO renderiza
 * esto — el token de lectura familiar es reutilizable hasta que vence, así
 * que consultarlo no lo consume.
 *
 * Lanza el error crudo del RPC (`LINK_INVALIDO` | `LINK_VENCIDO` |
 * `LINK_REVOCADO`); el llamador lo traduce con `schoolLinkErrorOf`.
 */
export async function fetchFamilyPayload(token: string): Promise<FamilyPayload> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("school_family_payload", { p_token: token });
  if (error) throw error;
  return data as unknown as FamilyPayload;
}

export interface ConfirmByTokenResult {
  id: string;
  status: "pending_close";
  confirmed_via: "link";
  confirmed_version: number;
}

/**
 * Confirma la clase por token. SOLO se llama desde el handler POST de
 * `/api/school/confirm` — el GET de `app/school/c/[token]/page.tsx` nunca
 * invoca esto (WhatsApp genera previews vía GET y no debe confirmar nada).
 * El token es de un solo uso: la base lo marca `used_at` en la misma
 * transacción que confirma la clase.
 */
export async function confirmLessonByToken(token: string): Promise<ConfirmByTokenResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("school_confirm_lesson_by_token", { p_token: token });
  if (error) throw error;
  return data as unknown as ConfirmByTokenResult;
}

export interface ConfirmLinkPreview {
  lesson_id: string;
  instrument: string;
  start_at: string;
  end_at: string;
  status: string;
  room: string | null;
  teacher_name: string;
}

/**
 * Vista de SOLO LECTURA del enlace de confirmación, para el GET de
 * `app/school/c/[token]/page.tsx`. No existe un RPC anon para esto (el único
 * RPC de este propósito, `school_confirm_lesson_by_token`, CONFIRMA — nunca
 * debe llamarse desde un GET), así que acá se resuelve el hash y se leen las
 * mismas guardas que el RPC valida (propósito, revocado/usado, vencimiento)
 * con el cliente admin, sin tocar ninguna fila. `sha256` en Node produce el
 * mismo hex en minúsculas que `encode(digest(token,'sha256'),'hex')` en
 * Postgres, así que el lookup por `token_hash` es el mismo de siempre.
 */
export async function previewConfirmLink(token: string): Promise<ConfirmLinkPreview> {
  const admin = createAdminClient();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: link } = await admin
    .from("school_access_links")
    .select("purpose, lesson_id, expires_at, revoked_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!link || link.purpose !== "teacher_confirm") {
    throw new Error("LINK_INVALIDO");
  }
  if (link.revoked_at || link.used_at) {
    throw new Error("LINK_INVALIDO: el enlace fue revocado o ya se usó");
  }
  if (new Date(link.expires_at).getTime() <= Date.now()) {
    throw new Error("LINK_VENCIDO");
  }

  const { data: lesson } = await admin
    .from("school_lessons")
    .select("id, instrument, start_at, end_at, status, room, school_teacher_profiles(staff(full_name))")
    .eq("id", link.lesson_id ?? "")
    .maybeSingle();
  if (!lesson) throw new Error("LINK_INVALIDO");

  const teacherJoin = lesson.school_teacher_profiles as unknown as
    | { staff?: { full_name?: string | null } | null }
    | null;

  return {
    lesson_id: lesson.id,
    instrument: lesson.instrument,
    start_at: lesson.start_at,
    end_at: lesson.end_at,
    status: lesson.status,
    room: lesson.room,
    teacher_name: teacherJoin?.staff?.full_name ?? "—",
  };
}
