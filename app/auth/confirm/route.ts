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

  // Un enlace de recuperación roto tiene que devolver al formulario de
  // recuperación, no al login: ahí es donde el usuario puede pedir otro.
  const errorPath = type === "recovery" || next.startsWith("/update-password")
    ? "/reset-password"
    : "/login";

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}${errorPath}?error=${reason}`);

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
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail("enlace_vencido");
    return response;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code!);
  if (error) return fail("enlace_vencido");
  return response;
}
