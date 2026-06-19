import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de sesión (datos del usuario autenticado) ----
export interface SessionUser {
  name: string;
  email: string;
  businessType: string | null;
  modules: Record<string, boolean> | null;
}

const DEFAULT_NAME = "Admin";

/** Devuelve los datos del usuario autenticado leídos de su perfil/metadata. */
export async function fetchSessionUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  return {
    name: meta.full_name || user.email?.split("@")[0] || DEFAULT_NAME,
    email: user.email || "",
    businessType: meta.business_type || null,
    modules: meta.modules || null,
  };
}
