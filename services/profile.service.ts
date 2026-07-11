import { createClient } from "@/utils/supabase/client";
import type { BusinessType, Modules, Profile } from "@/config/business";

/** Mapea la fila de `profiles` (+ datos de auth) al tipo de dominio. */
function toProfile(
  row: {
    id: string;
    full_name: string | null;
    business_type: string | null;
    modules: unknown;
    is_super_admin?: boolean | null;
  } | null,
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
  };
}

/** Perfil del usuario autenticado (cliente). Devuelve null si no hay sesión. */
export async function fetchProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, business_type, modules, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;

  return toProfile(data, user.email || "");
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

  const row: { full_name?: string; business_type?: string | null; modules?: Modules } = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.businessType !== undefined) row.business_type = patch.businessType;
  if (patch.modules !== undefined) row.modules = patch.modules;

  const { data, error } = await supabase
    .from("profiles")
    .update(row)
    .eq("id", user.id)
    .select("id, full_name, business_type, modules, is_super_admin")
    .single();
  if (error) throw error;

  return toProfile(data, user.email || "")!;
}
