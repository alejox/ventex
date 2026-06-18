import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/proxy";

export async function proxy(request: NextRequest) {
  const supabaseResponse = await updateSession(request);

  const {
    data: { user },
  } = await supabaseResponse.supabase.auth.getUser();

  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboard && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse.response;
}
