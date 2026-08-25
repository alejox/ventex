import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import { EPAYCO_CONFIGURED } from "@/services/epayco.service";
import { reconcilePendingOrders } from "@/services/subscription-billing.server";

/**
 * Barrido de las órdenes PENDIENTES del dueño: las relee en ePayco y acredita
 * las que estén pagadas.
 *
 * Por qué hace falta una ruta aparte teniendo ya el polling: el polling sólo
 * mira UNA orden y sólo si la pantalla se abrió con `?pay=<uuid>`. Todo pago
 * cuya notificación se perdiera y cuyo pagador no volviera por ese link exacto
 * quedaba cobrado y sin licencia, sin nada en el sistema que volviera a
 * mirarlo. Esto es esa red.
 *
 * Es idempotente —`apply_billing_charge` sólo toma órdenes `pending`— así que
 * la pantalla puede llamarla en cada carga sin efecto cuando no hay nada que
 * conciliar.
 *
 * Sólo el dueño: `requireSelectedWorkspaceOwner` devuelve null para
 * trabajadores, y la facturación no es asunto suyo.
 */
export async function POST() {
  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Sin llaves no hay a quién preguntarle. Se contesta 200 con cero: no es un
  // error del usuario ni algo que la pantalla deba mostrar como falla.
  if (!EPAYCO_CONFIGURED) {
    return NextResponse.json({ checked: 0, activated: 0 });
  }

  try {
    const result = await reconcilePendingOrders(createAdminClient(), owner.user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("reconcile sweep failed", owner.user.id, error);
    return NextResponse.json({ error: "No pudimos revisar tus pagos." }, { status: 502 });
  }
}
