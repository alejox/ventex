import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";

/**
 * Prende o apaga la renovación automática mensual.
 *
 * En dLocal Go el cobro recurrente lo inicia el comercio (no hay suscripción
 * viva del lado de dLocal que haya que cancelar): dar de baja es, literalmente,
 * dejar de cobrar. El plan sigue activo hasta `current_period_end` y recién ahí
 * se vence.
 *
 * Sólo el dueño del workspace: `requireSelectedWorkspaceOwner` devuelve null
 * para trabajadores, así que un empleado no puede tocar la facturación.
 */
export async function POST(request: Request) {
  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const enabled = Boolean(body?.recurring);

  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("billing_provider_ref, current_period_end")
    .eq("user_id", owner.user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "No encontramos tu suscripción." }, { status: 404 });
  }

  // Reactivar exige un medio de cobro guardado: sin token no hay con qué cobrar
  // y dejarlo en `true` sólo lograría que el cron lo saltee en silencio.
  if (enabled && !sub.billing_provider_ref) {
    return NextResponse.json(
      {
        error:
          "No tenemos un medio de pago guardado. Pagá una vez en línea y la renovación automática queda activa.",
      },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      billing_recurring: enabled,
      billing_next_charge_at: enabled ? sub.current_period_end : null,
      billing_failed_attempts: 0,
      billing_error: null,
    })
    .eq("user_id", owner.user.id);

  if (error) {
    return NextResponse.json({ error: "No pudimos guardar el cambio." }, { status: 500 });
  }

  return NextResponse.json({
    recurring: enabled,
    nextChargeAt: enabled ? sub.current_period_end : null,
  });
}
