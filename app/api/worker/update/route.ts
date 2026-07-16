import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const workerId = String(body.workerId ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const username = String(body.username ?? "").trim().toLowerCase();
  const role = body.role ? String(body.role) : null;
  const password = body.password ? String(body.password) : null;

  if (!workerId || !fullName || !username) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      { error: "El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo." },
      { status: 400 },
    );
  }
  if (password !== null && password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }

  const admin = createAdminClient();

  // El cliente admin salta RLS: hay que verificar manualmente que el trabajador
  // pertenece al negocio de quien hace la petición.
  const { data: worker } = await admin
    .from("profiles")
    .select("id, is_worker, workspace_id")
    .eq("id", workerId)
    .single();
  if (!worker || !worker.is_worker || worker.workspace_id !== user.id) {
    return NextResponse.json({ error: "No tienes permiso para editar este trabajador." }, { status: 403 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, worker_username: username, worker_role: role })
    .eq("id", workerId);
  if (profileError) {
    const isDuplicate = profileError.code === "23505";
    return NextResponse.json(
      { error: isDuplicate ? "Ese usuario ya existe en tu negocio. Elige otro." : profileError.message },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  if (password) {
    const { error: pwError } = await admin.auth.admin.updateUserById(workerId, { password });
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
