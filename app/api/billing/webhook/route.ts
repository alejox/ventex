import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  getPayment,
  notificationPaymentId,
  verifyNotification,
} from "@/services/dlocalgo.service";
import {
  applyPaymentToOrder,
  BILLING_ORDER_SELECT,
  type BillingOrderRow,
} from "@/services/subscription-billing.server";

/**
 * Notificación (IPN) de dLocal Go.
 *
 * El cuerpo trae SÓLO `{ "payment_id": "DP-…" }`: no hay estado ni monto, así
 * que hay que releer el pago con `GET /v1/payments/{id}` antes de tocar nada.
 * Eso también evita confiar en un cuerpo que podría venir manipulado.
 *
 * Códigos de respuesta, que definen si dLocal reintenta (cada 10 min por 30
 * días mientras no reciba un 2xx):
 *  - 401 firma inválida — no reintentar, no es nuestro emisor.
 *  - 200 orden inexistente o pago aún pendiente — no hay nada que hacer.
 *  - 5xx no pudimos acreditar una orden YA COBRADA — que reintente, es la
 *    única red que impide cobrar sin activar la licencia.
 */

export async function POST(request: NextRequest) {
  // El cuerpo se lee como texto crudo porque la firma se calcula sobre los
  // bytes exactos: parsear y volver a serializar la rompe.
  const rawBody = await request.text();

  if (!verifyNotification(request.headers.get("authorization"), rawBody)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const paymentId = notificationPaymentId(payload);
  if (!paymentId) return NextResponse.json({ ok: true });

  const admin = createAdminClient();

  let payment;
  try {
    payment = await getPayment(paymentId);
  } catch (error) {
    // No sabemos el estado real: pedir reintento en vez de cerrar el caso.
    console.error("dlocalgo getPayment failed", paymentId, error);
    return NextResponse.json({ error: "No pudimos consultar el pago." }, { status: 503 });
  }

  const { data: order } = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT)
    .eq("order_id", payment.order_id ?? "")
    .maybeSingle();

  if (!order) {
    // Puede ser un pago que no nació en Ventex. Cerrar con 200 para que dLocal
    // no reintente 30 días contra una orden que no existe.
    return NextResponse.json({ ok: true });
  }

  try {
    await applyPaymentToOrder(admin, order as BillingOrderRow, payment);
  } catch (error) {
    console.error("apply payment failed", order.id, error);
    return NextResponse.json({ error: "No pudimos acreditar el pago." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
