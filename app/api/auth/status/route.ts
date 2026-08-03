import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Estado de sesión para el landing: decide si el botón de pago abre el
 * checkout o deriva al registro. Público a propósito (solo dice si hay sesión).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ authenticated: Boolean(user) });
}
