import { createClient } from "@/utils/supabase/client";
import type { BusinessType, Modules, Profile, WorkerPermissions } from "@/config/business";

type CurrentProfileRow = {
  id: string;
  full_name: string | null;
  business_type: string | null;
  business_name?: string | null;
  modules: unknown;
  is_super_admin?: boolean | null;
  is_reseller?: boolean | null;
  is_worker?: boolean | null;
  worker_access_status?: string | null;
  workspace_id?: string | null;
  membership_id?: string | null;
  membership_kind?: string | null;
  staff_id?: string | null;
  worker_permissions?: unknown;
};

/** Mapea la proyección segura del perfil (+ datos de auth) al tipo de dominio. */
function toProfile(
  row: CurrentProfileRow | null,
  email: string,
): Profile | null {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name || email.split("@")[0] || "Admin",
    email,
    businessType: (row.business_type as BusinessType) || null,
    modules: (row.modules as Modules) || {},
    isSuperAdmin: Boolean(row.is_super_admin),
    isReseller: Boolean(row.is_reseller),
    isWorker: Boolean(row.is_worker),
    workerAccessStatus:
      row.worker_access_status === "pending" ||
      row.worker_access_status === "active" ||
      row.worker_access_status === "suspended"
        ? row.worker_access_status
        : null,
    workspaceId: row.workspace_id ?? null,
    membershipId: row.membership_id ?? null,
    membershipKind:
      row.membership_kind === "owner" || row.membership_kind === "member"
        ? row.membership_kind
        : null,
    businessName: row.business_name ?? null,
    staffId: row.staff_id ?? null,
    workerPermissions: (row.worker_permissions ?? {}) as WorkerPermissions,
  };
}

/** Perfil del usuario autenticado (cliente). Devuelve null si no hay sesión. */
export async function fetchProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("current_user_profile");
  if (error) throw error;

  return toProfile(data as CurrentProfileRow | null, user.email || "");
}

export interface ProfileUpdate {
  fullName?: string;
  businessType?: BusinessType | null;
  modules?: Modules;
}

/** Actualiza el perfil del usuario autenticado y devuelve el resultado. */
export async function updateProfile(patch: ProfileUpdate): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  const current = await fetchProfile();
  if (!current) throw new Error("No se pudo resolver el perfil");

  if (patch.fullName !== undefined) {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: patch.fullName })
      .eq("id", user.id);
    if (error) throw error;
  }

  if (patch.businessType !== undefined || patch.modules !== undefined) {
    if (
      current.membershipKind !== "owner" ||
      !current.workspaceId
    ) {
      throw new Error("Solo el dueño puede cambiar la configuración del negocio");
    }
    const businessPatch: {
      business_type?: string | null;
      modules?: Modules;
    } = {};
    if (patch.businessType !== undefined) {
      businessPatch.business_type = patch.businessType;
    }
    if (patch.modules !== undefined) businessPatch.modules = patch.modules;

    const { error } = await supabase
      .from("profiles")
      .update(businessPatch)
      .eq("id", current.workspaceId);
    if (error) throw error;
  }

  const updated = await fetchProfile();
  if (!updated) throw new Error("No se pudo recargar el perfil");
  return updated;
}
