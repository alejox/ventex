import { redirect } from "next/navigation";
import { resolveLandingPath } from "@/services/getting-started.server";

/**
 * Aterrizaje después del login: el ÚNICO destino por defecto del login con
 * correo (`login` en `utils/supabase/actions.ts`), del enlace de confirmación y
 * de Google (`/auth/confirm`). Así los dos caminos terminan en la misma regla
 * (`resolveLandingPath`) en vez de repetirla.
 *
 * Un `next` explícito y seguro (p. ej. el regreso de ePayco a
 * `/dashboard/subscription?pay=…`) nunca pasa por acá: gana antes.
 *
 * Cuelga de `/dashboard` para que `proxy.ts` lo proteja igual que al resto.
 * Lee la sesión (cookies), así que corre en cada pedido: no se cachea.
 */

export async function GET() {
  redirect((await resolveLandingPath()) ?? "/login");
}
