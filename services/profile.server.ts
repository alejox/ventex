import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { resolveWorkspaceForDashboard } from "@/services/workspace.server";
import type { BusinessType, Modules, Profile, WorkerPermissions } from "@/config/business";

/**
 * Perfil del usuario autenticado leído en el servidor (Server Components /
 * route handlers). Lo usa el layout del dashboard para gatear la navegación
 * antes de pintar y evitar el parpadeo de hidratación.
 *
 * Memoizado por request (`cache`): varios layouts anidados lo piden en el mismo
 * render (dashboard + settings) y debe costar una sola consulta.
 */
export const fetchProfileServer = cache(async function fetchProfileServer(): Promise<Profile | null> {
  // Nested layouts can render concurrently. Resolve the per-session workspace
  // before caching a profile so an early child read cannot freeze a singular,
  // selection-less projection for the rest of the request.
  await resolveWorkspaceForDashboard();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("current_user_profile");
  if (error) throw error;
  const row = data as {
    full_name?: string | null;
    business_type?: string | null;
    business_name?: string | null;
    modules?: unknown;
    is_super_admin?: boolean | null;
    is_reseller?: boolean | null;
    is_worker?: boolean | null;
    worker_access_status?: string | null;
    workspace_id?: string | null;
    membership_id?: string | null;
    membership_kind?: string | null;
    staff_id?: string | null;
    worker_permissions?: unknown;
  } | null;

  const email = user.email || "";
  return {
    id: user.id,
    fullName: row?.full_name || email.split("@")[0] || "Admin",
    email,
    businessType: (row?.business_type as BusinessType) || null,
    modules: (row?.modules as Modules) || {},
    isSuperAdmin: Boolean(row?.is_super_admin),
    isReseller: Boolean(row?.is_reseller),
    isWorker: Boolean(row?.is_worker),
    workerAccessStatus:
      row?.worker_access_status === "pending" ||
      row?.worker_access_status === "active" ||
      row?.worker_access_status === "suspended"
        ? row.worker_access_status
        : null,
    workspaceId: row?.workspace_id ?? null,
    membershipId: row?.membership_id ?? null,
    membershipKind:
      row?.membership_kind === "owner" || row?.membership_kind === "member"
        ? row.membership_kind
        : null,
    businessName: row?.business_name ?? null,
    staffId: row?.staff_id ?? null,
    workerPermissions: (row?.worker_permissions ?? {}) as WorkerPermissions,
  };
});

/** Resultado del chequeo de licencia mensual (RPC ensure_license_current). */
export interface LicenseCheck {
  managed: boolean;
  blocked: boolean;
  status?: "pending" | "active" | "expired" | "suspended";
  period_end?: string;
}

/**
 * Activa/renueva la licencia mensual de un cliente de revendedor (consume
 * créditos en el primer login y al vencer cada mes) y dice si debe bloquearse
 * el acceso. Cuentas directas (sin revendedor) devuelven managed=false.
 * Autoritativo en BD: el layout del dashboard lo llama en el servidor.
 */
export async function ensureLicenseCurrent(): Promise<LicenseCheck> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_license_current");
  if (error) throw error;
  return data as unknown as LicenseCheck;
}
