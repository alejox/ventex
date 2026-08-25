"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { authMessage } from "@/lib/errors";
import { REGISTRABLE_BUSINESS_TYPES, type BusinessType, type Modules } from "@/config/business";
import { isSafeNext } from "@/lib/safe-next";

/**
 * Acciones de auth unificadas: tanto login como registro se hacen EXCLUSIVAMENTE
 * por estos server actions (con `useActionState` desde las páginas). No hay un
 * camino client-side alternativo: si necesitás cambiar la sesión, cambiá acá.
 */

export type LoginState = { error: string | null };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (error) return { error: authMessage(error) };

  revalidatePath("/", "layout");

  // Volver a donde iba, no al POS.
  //
  // El destino lo puso `proxy.ts` al mandar acá a alguien sin sesión. El caso
  // que lo hizo necesario: se vuelve del checkout de ePayco a
  // `/dashboard/subscription?pay=<orden>`, la cookie no viaja, y aterrizar en el
  // POS dejaba la orden recién PAGADA sin que nadie la mirara.
  //
  // `isSafeNext` no es opcional: este valor viene de la URL y redirigir a ciegas
  // a donde diga un parámetro es un redirect abierto.
  const next = String(formData.get("next") ?? "");
  redirect(isSafeNext(next) ? next : "/dashboard/pos");
}

export type SignupState = { success: boolean; error: string | null };

export async function signup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const businessType = String(formData.get("business_type") ?? "");
  const businessName = String(formData.get("business_name") ?? "");
  const fullName = String(formData.get("full_name") ?? "");
  const phone = String(formData.get("phone") ?? "");

  // Validación duplicada del lado del servidor: la del cliente es UX, esta es
  // la que importa.
  if (password !== confirmPassword) {
    return { success: false, error: "Las contraseñas no coinciden." };
  }

  if (!REGISTRABLE_BUSINESS_TYPES.includes(businessType as BusinessType)) {
    return { success: false, error: "Debes seleccionar un tipo de negocio." };
  }

  let modules: Modules = {};
  const rawModules = formData.get("modules");
  if (typeof rawModules === "string") {
    try {
      const parsed = JSON.parse(rawModules) as unknown;
      if (parsed && typeof parsed === "object") modules = parsed as Modules;
    } catch {
      modules = {};
    }
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // /auth/confirm verifica el token en el servidor (acepta ?code= y
      // ?token_hash=), igual que el reset y la confirmación de correo.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?next=/dashboard/pos`,
      data: {
        full_name: fullName,
        phone,
        business_name: businessName,
        business_type: businessType,
        modules,
      },
    },
  });

  if (error) return { success: false, error: authMessage(error) };

  return { success: true, error: null };
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
