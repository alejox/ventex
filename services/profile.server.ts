import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, business_type, modules, is_super_admin, is_reseller, is_worker, workspace_id, staff_id, worker_permissions")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;

  const email = user.email || "";
  return {
    id: user.id,
    fullName: data?.full_name || email.split("@")[0] || "Admin",
    email,
    businessType: (data?.business_type as BusinessType) || null,
    modules: (data?.modules as Modules) || {},
    isSuperAdmin: Boolean(data?.is_super_admin),
    isReseller: Boolean(data?.is_reseller),
    isWorker: Boolean(data?.is_worker),
    workspaceId: data?.workspace_id ?? null,
    staffId: data?.staff_id ?? null,
    workerPermissions: (data?.worker_permissions ?? {}) as WorkerPermissions,
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
