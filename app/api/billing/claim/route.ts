import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Reclama los pagos que el usuario hizo como INVITADO antes de tener cuenta.
 *
 * Se llama con la sesión del propio usuario, no con el service role: la RPC
 * `claim_guest_orders` está concedida a `authenticated` y verifica adentro que
 * el correo pedido sea el de `auth.uid()`. Así nadie puede reclamar el pago de
 * otro ni siquiera conociendo su correo.
 *
 * A propósito NO usa `requireSelectedWorkspaceOwner`: quien acaba de pagar como
 * invitado todavía puede no tener workspace, y ese es justo el caso que hay que
 * atender. Es idempotente: sólo toma órdenes con `user_id` nulo.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("claim_guest_orders", {
    p_email: user.email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = (data ?? {}) as { claimed?: number; activated?: number };
  return NextResponse.json({
    claimed: result.claimed ?? 0,
    activated: result.activated ?? 0,
  });
}
