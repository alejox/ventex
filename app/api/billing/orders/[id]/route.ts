import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import {
  reconcileOrderFromEpayco,
  type BillingOrderRow,
} from "@/services/subscription-billing.server";

/**
 * Estado de una orden de pago (polling del checkout).
 *
 * Si la orden sigue `pending`, se RELEE la transacción en ePayco antes de
 * contestar. Es lo que hace que el flujo no dependa del webhook: en desarrollo
 * `localhost` no es alcanzable para ePayco, y en producción una notificación se
 * puede perder. Con esto, abrir la pantalla alcanza para resolver el pago.
 *
 * No hace falta que la orden tenga guardada una referencia de la pasarela: se
 * consulta por NUESTRA referencia (`order_id`), que existe desde que se creó la
 * orden. Por eso el pago se resuelve aunque no haya llegado NUNCA una sola
 * notificación.
 *
 * Autorización:
 *  - Con sesión de dueño: la orden tiene que ser suya.
 *  - Sin sesión (invitado de la landing): hay que presentar el correo con el que
 *    se creó la orden. El id es un UUID de 128 bits, así que conocer ambos
 *    equivale a haber iniciado ese checkout.
 */

const PUBLIC_SELECT =
  "id, order_id, status, amount, currency, method, payment_method_type, period_name, period_months, plan_id, error, created_at, paid_at";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = await requireSelectedWorkspaceOwner();
  const { id } = await params;

  const admin = createAdminClient();

  const scoped = admin
    .from("billing_orders")
    .select(
      `${PUBLIC_SELECT}, user_id, guest_email, payer_name, epayco_ref, epayco_transaction_id, epayco_status_code`,
    )
    .eq("id", id);

  if (owner) {
    scoped.eq("user_id", owner.user.id);
  } else {
    const email = (request.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    scoped.eq("guest_email", email);
  }

  const { data: order, error } = await scoped.maybeSingle();
  if (error || !order) {
    return NextResponse.json({ error: "Orden no encontrada." }, { status: 404 });
  }

  if (order.status === "pending") {
    try {
      await reconcileOrderFromEpayco(admin, order as BillingOrderRow);
    } catch (reconcileError) {
      // Reconciliar es un extra: si ePayco no contesta, devolvemos el estado
      // guardado y el próximo intento del polling reintenta.
      console.error("reconcile order failed", id, reconcileError);
    }

    const { data: fresh } = await admin
      .from("billing_orders")
      .select(PUBLIC_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (fresh) return NextResponse.json({ order: fresh });
  }

  // Se listan los campos a devolver en vez de descartar los internos: así una
  // columna nueva (otro token, un dato del pagador) NO se filtra sola por
  // haberse agregado al select.
  return NextResponse.json({
    order: {
      id: order.id,
      order_id: order.order_id,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      method: order.method,
      payment_method_type: order.payment_method_type,
      period_name: order.period_name,
      period_months: order.period_months,
      plan_id: order.plan_id,
      error: order.error,
      created_at: order.created_at,
      paid_at: order.paid_at,
    },
  });
}
