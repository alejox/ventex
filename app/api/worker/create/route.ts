import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { email, password, fullName, role, staffId } = await req.json();
  if (!email || !password || !fullName) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, is_worker: true },
  });

  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
  if (!authData.user) return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 });

  const workerId = authData.user.id;
  const staffIdToUse = staffId || null;

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: workerId,
    full_name: fullName,
    is_worker: true,
    workspace_id: user.id,
    staff_id: staffIdToUse,
    worker_permissions: {},
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(workerId);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ userId: workerId });
}
