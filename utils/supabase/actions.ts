"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { authMessage } from "@/lib/errors";
import { REGISTRABLE_BUSINESS_TYPES, type BusinessType, type Modules } from "@/config/business";
import { isSafeNext } from "@/lib/safe-next";
import { onboardingPath, sanitizeMonths, sanitizePlanId } from "@/lib/signup-intent";

/**
 * Acciones de auth unificadas: tanto login como registro se hacen EXCLUSIVAMENTE
 * por estos server actions (con `useActionState` desde las páginas). No hay un
 * camino client-side alternativo: si necesitas cambiar la sesión, cámbiala aquí.
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

export type SignupState = {
  success: boolean;
  error: string | null;
  /** Correo al que se mandó la confirmación (para mostrarlo y reenviar). */
  email?: string;
  /** Ruta de vuelta del enlace; el reenvío manda la MISMA. */
  next?: string;
  /**
   * Marca de cada envío exitoso. La pantalla "Revisa tu correo" la usa para
   * saber si el usuario ya volvió atrás a corregir ESTE envío (y no uno viejo).
   */
  sentAt?: number;
};

const MIN_PASSWORD = 6;

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Enlace del correo: /auth/confirm verifica en el servidor y sigue a `next`. */
function confirmRedirect(next: string): string {
  return `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export async function signup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const businessType = String(formData.get("business_type") ?? "");

  // Validación duplicada del lado del servidor: la del cliente es UX, esta es
  // la que importa. Ya no hay "Confirmar contraseña" (B8): el campo tiene ojo
  // para mostrarla, que evita el error de tipeo sin pedir escribirla dos veces.
  if (password.length < MIN_PASSWORD) {
    return { success: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` };
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

  /**
   * El rubro, los módulos y el plan elegido NO van a la metadata: viajan en el
   * `next` del enlace y los precarga el `OnboardingModal`, que es donde ahora
   * se piden el nombre del negocio, el tuyo y el teléfono. Mandar el rubro en
   * la metadata haría que `handle_new_user` lo guarde y el modal no aparezca
   * nunca — y el nombre del negocio se perdería, porque ese trigger no lo copia.
   */
  const next = onboardingPath({
    businessType: businessType as BusinessType,
    modules,
    plan: sanitizePlanId(String(formData.get("plan") ?? "")),
    months: sanitizeMonths(String(formData.get("months") ?? "")),
  });

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // /auth/confirm verifica el token en el servidor (acepta ?code= y
      // ?token_hash=), igual que el reset y la confirmación de correo.
      emailRedirectTo: confirmRedirect(next),
    },
  });

  if (error) return { success: false, error: authMessage(error) };

  // When email confirmation is disabled, Supabase returns an active session.
  // Send the new owner to the app instead of showing the confirmation screen.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }

  return { success: true, error: null, email, next, sentAt: Date.now() };
}

export type ResendState = { ok: boolean; error: string | null };

/**
 * "Reenviar correo" de la pantalla "Revisa tu correo". Reusa el mismo `next`
 * que el envío original para que el enlace nuevo precargue lo mismo. El
 * cooldown de la pantalla es cortesía; el límite real lo pone Supabase y su
 * error llega traducido por `authMessage`.
 */
export async function resendSignupEmail(email: string, next: string): Promise<ResendState> {
  const target = email.trim();
  if (!target) return { ok: false, error: "Falta el correo." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: target,
    options: { emailRedirectTo: confirmRedirect(isSafeNext(next) ? next : "/dashboard") },
  });
  if (error) return { ok: false, error: authMessage(error) };
  return { ok: true, error: null };
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
