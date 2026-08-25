import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/proxy";
import { isSafeNext } from "@/lib/safe-next";

export async function proxy(request: NextRequest) {
  const supabaseResponse = await updateSession(request);

  const {
    data: { user },
  } = await supabaseResponse.supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname === "/workspace";

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // A dónde iba, para poder devolverlo ahí después de entrar.
    //
    // Caso real que esto arregla: se vuelve del checkout de ePayco a
    // `/dashboard/subscription?pay=<orden>` con la sesión vencida (o, en
    // desarrollo, perdida porque ePayco devuelve a `127.0.0.1` y la cookie es
    // de `localhost`). Antes se aterrizaba en el POS y la orden recién pagada
    // quedaba huérfana: nadie volvía a mirarla.
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    // Quien YA tiene sesión y cae en /login con un destino pendiente va ahí, no
    // al dashboard: es el mismo regreso del checkout, sólo que la cookie sí
    // viajó. Se valida igual que en el login — un `next` sin validar es un
    // redirect abierto, y esta URL la arma un tercero.
    if (next && isSafeNext(next)) {
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return supabaseResponse.response;
}
