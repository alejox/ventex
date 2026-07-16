import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const username = String(body.username ?? "").trim().toLowerCase();
  const { password, fullName, role, staffId } = body;

  if (!username || !password || !fullName) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      { error: "El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // El trabajador inicia sesión con la llave del negocio: asegúrate de que el dueño
  // tenga una, generándola si aún no existe.
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("business_key")
    .eq("id", user.id)
    .single();
  if (!ownerProfile?.business_key) {
    const { data: newKey } = await admin.rpc("generate_business_key");
    if (newKey) {
      await admin.from("profiles").update({ business_key: newKey }).eq("id", user.id);
    }
  }

  // El correo del trabajador es sintético (nunca lo usa: entra con usuario + llave).
  const syntheticEmail = `w-${crypto.randomUUID()}@workers.ventex.app`;

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, is_worker: true },
  });

  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
  if (!authData.user) return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 });

  const workerId = authData.user.id;
  const staffIdToUse = staffId || null;

  // El trigger on_auth_user_created ya insertó un perfil (is_worker=false). Se actualiza
  // con el cliente admin porque la RLS de `profiles` no deja al dueño escribir esa fila.
  const { error: profileError } = await admin.from("profiles").upsert({
    id: workerId,
    full_name: fullName,
    is_worker: true,
    workspace_id: user.id,
    staff_id: staffIdToUse,
    worker_username: username,
    worker_role: role || null,
    worker_permissions: {},
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(workerId);
    const isDuplicate = profileError.code === "23505";
    return NextResponse.json(
      { error: isDuplicate ? "Ese usuario ya existe en tu negocio. Elige otro." : profileError.message },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ userId: workerId });
}
