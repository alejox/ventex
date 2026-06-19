import { createClient } from "@/utils/supabase/server";
import type { BusinessType, Modules, Profile } from "@/config/business";

/**
 * Perfil del usuario autenticado leído en el servidor (Server Components /
 * route handlers). Lo usa el layout del dashboard para gatear la navegación
 * antes de pintar y evitar el parpadeo de hidratación.
 */
export async function fetchProfileServer(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, business_type, modules")
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
  };
}
