import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { WORKER_PERMISSION_LABELS, type WorkerPermission, type WorkerPermissions } from "@/config/business";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

/**
 * Filtra los permisos del body a las claves conocidas y valores booleanos: el
 * cliente admin escribe sin RLS, así que nada del JSON entra crudo al perfil.
 */
function sanitizePermissions(raw: unknown): WorkerPermissions {
  if (!raw || typeof raw !== "object") return {};
  const valid = Object.keys(WORKER_PERMISSION_LABELS) as WorkerPermission[];
  const out: WorkerPermissions = {};
  for (const key of valid) {
    if ((raw as Record<string, unknown>)[key] === true) out[key] = true;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const username = String(body.username ?? "").trim().toLowerCase();
  const { password, fullName, role, staffId } = body;
  const permissions = sanitizePermissions(body.permissions);

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

  // El cliente admin salta RLS y crea usuarios de Auth: hay que verificar a mano
  // que quien llama sea el DUEÑO del negocio. Sin esto, cualquier sesión (un
  // trabajador, o cualquier cuenta) podía acuñar usuarios sin límite, y el gate
  // de app/dashboard/settings/trabajadores/layout.tsx no cubre la API.
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("business_key, is_worker")
    .eq("id", user.id)
    .single();
  if (!ownerProfile || ownerProfile.is_worker) {
    return NextResponse.json(
      { error: "Solo el dueño del negocio puede crear trabajadores." },
      { status: 403 },
    );
  }

  // El trabajador inicia sesión con la llave del negocio: asegúrate de que el dueño
  // tenga una, generándola si aún no existe.
  if (!ownerProfile.business_key) {
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
  // con el cliente admin porque `is_worker`, `workspace_id`, `worker_username` y
  // `worker_role` solo son escribibles por el service_role (ver la migración
  // restrict_profiles_column_grants).
  const { error: profileError } = await admin.from("profiles").upsert({
    id: workerId,
    full_name: fullName,
    is_worker: true,
    workspace_id: user.id,
    staff_id: staffIdToUse,
    worker_username: username,
    worker_role: role || null,
    worker_permissions: permissions,
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
