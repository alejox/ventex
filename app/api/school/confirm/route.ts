import { type NextRequest, NextResponse } from "next/server";
import { confirmLessonByToken } from "@/services/school-family.server";

/**
 * POST-only, sin sesión (anon): es el ÚNICO camino que consume el token de
 * confirmación. `app/school/c/[token]/page.tsx` renderiza con un GET y NUNCA
 * llama esto — así un preview de WhatsApp (que hace GET) jamás confirma ni
 * consume nada.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Falta el token." }, { status: 400 });
  }

  try {
    const result = await confirmLessonByToken(token);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo confirmar la clase.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
