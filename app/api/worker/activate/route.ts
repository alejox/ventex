import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!user.email_confirmed_at) {
    return NextResponse.json(
      { error: "Primero debés verificar tu correo." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const membershipId = String(body?.membershipId ?? "");
  if (!membershipId) {
    return NextResponse.json(
      { error: "Falta la invitación que querés aceptar." },
      { status: 400 },
    );
  }

  type Rpc = (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("accept_workspace_invitation", {
    p_membership_id: membershipId,
  });
  if (error) {
    return NextResponse.json(
      { error: "La invitación no está disponible para este correo." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, membership: data });
}
