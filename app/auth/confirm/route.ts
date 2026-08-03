import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/utils/supabase/database.types";

/**
 * Punto de entrada de los enlaces que Supabase manda por correo.
 *
 * Acepta dos formatos, a propósito:
 *
 *  - `?token_hash=…&type=recovery` — el formato recomendado por `@supabase/ssr`.
 *    Verifica el token acá, en el servidor, y deja la sesión en la cookie. Como
 *    no depende de nada guardado en el navegador, el enlace funciona aunque el
 *    usuario pida el correo en el celular y lo abra en la computadora.
 *
 *  - `?code=…` — el flujo PKCE que usa la plantilla por defecto
 *    (`{{ .ConfirmationURL }}`). El `code_verifier` vive en una cookie del
 *    navegador que pidió el enlace, así que este camino SOLO funciona en ese
 *    mismo navegador. Se mantiene para que nada se rompa mientras la plantilla
 *    de correo siga sin migrarse.
 *
 * Los errores no se tragan: se redirige con `?error=` para que la pantalla de
 * destino pueda explicarle al usuario qué pasó.
 */

const EMAIL_OTP_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * `next` viene de la URL, o sea del usuario. Sin esta validación, un enlace
 * `?next=https://sitio-falso.com` convertiría esta ruta en un redirector
 * abierto, y encima con la sesión recién creada.
 */
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  // "//host" y "/\host" también son absolutos para el navegador.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const rawType = searchParams.get("type");
  const type = rawType && EMAIL_OTP_TYPES.has(rawType) ? (rawType as EmailOtpType) : null;
  const next = safeNext(searchParams.get("next"), "/dashboard/pos");

  /**
   * Sólo las invitaciones de EMPLEADO van a `/access-disabled` cuando el enlace
   * vence. Se detectan por el marcador `invitation=` que arma
   * `invitationRedirect()`, no por `type === "invite"`: el checkout de invitado
   * también genera enlaces de tipo `invite` y mandarlo a `/access-disabled`
   * le diría "tu acceso fue deshabilitado" a alguien que acaba de pagar.
   */
  const isInvitation = next.includes("invitation=");

  // Un enlace roto tiene que devolver a la pantalla donde el usuario puede
  // pedir otro, no al login genérico.
  const errorPath = isInvitation
    ? "/access-disabled"
    : type === "recovery" || next.startsWith("/update-password")
    ? "/reset-password"
    : next.startsWith("/register")
    ? "/register"
    : "/login";

  const fail = (reason: string) => {
    const url = new URL(errorPath, origin);
    if (isInvitation) url.searchParams.set("status", "expired");
    else url.searchParams.set("error", reason);
    return NextResponse.redirect(url);
  };

  if (!tokenHash && !code) return fail("enlace_invalido");

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  if (tokenHash) {
    if (!type) return fail("enlace_invalido");
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail("enlace_vencido");
    await claimGuestCheckout(supabase, data.user?.email ?? null);
    return response;
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code!);
  if (error) return fail("enlace_vencido");
  await claimGuestCheckout(supabase, data.user?.email ?? null);
  return response;
}

/**
 * Ata a la cuenta recién validada los pagos que hizo como invitado en la
 * landing, para que el plan ya esté activo cuando aterrice en el panel.
 *
 * Se hace acá porque es el único punto por el que pasan TODAS las validaciones
 * de correo, y es idempotente: `claim_guest_orders` sólo toma órdenes con
 * `user_id` nulo, así que en el 99% de los casos no encuentra nada y sale. Un
 * fallo no puede romper el login: el panel de suscripción lo vuelve a intentar.
 */
async function claimGuestCheckout(
  supabase: ReturnType<typeof createServerClient<Database>>,
  email: string | null,
): Promise<void> {
  if (!email) return;
  try {
    await supabase.rpc("claim_guest_orders", { p_email: email });
  } catch (error) {
    console.error("claim_guest_orders failed", error);
  }
}
