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
