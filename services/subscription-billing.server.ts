import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  getPayment,
  isPaidStatus,
  isRejectedStatus,
  type DlocalPayment,
} from "@/services/dlocalgo.service";
import { sendGuestCheckoutEmail } from "@/services/guest-checkout-email.server";

/**
 * Acreditación de un pago de dLocal Go, compartida por los tres caminos que
 * pueden enterarse de que una orden se pagó:
 *
 *  1. el webhook (`/api/billing/webhook`),
 *  2. el polling del checkout (`/api/billing/orders/[id]`),
 *  3. el cron de renovaciones (`/api/billing/recurring`).
 *
 * Que el polling también reconcilie no es redundancia: la notificación de
 * dLocal Go trae sólo un `payment_id` y puede perderse o no llegar nunca (en
 * desarrollo, `localhost` no es alcanzable). Con esto el estado del pago se
 * resuelve igual con sólo abrir la pantalla. `apply_billing_charge` es
 * idempotente, así que los tres caminos pueden pisarse sin acreditar dos veces.
 */

type Admin = ReturnType<typeof createAdminClient>;

export const BILLING_ORDER_SELECT =
  "id, order_id, user_id, guest_email, payer_name, period_name, status, dlocal_payment_id, checkout_token";

export interface BillingOrderRow {
  id: string;
  order_id: string;
  user_id: string | null;
  guest_email: string | null;
  payer_name: string | null;
  period_name: string;
  status: string;
  dlocal_payment_id: string | null;
  checkout_token: string | null;
}

export type ReconcileOutcome = "paid" | "failed" | "pending";

export async function markOrderFailed(
  admin: Admin,
  orderId: string,
  error: string,
  userId: string | null,
): Promise<void> {
  await admin
    .from("billing_orders")
    .update({ status: "failed", error, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending");

  // `.eq('user_id', null)` no matchea nada en PostgREST: sin este guard, una
  // orden de invitado terminaba escribiendo sobre ninguna fila y el error se
  // perdía en silencio.
  if (userId) {
    await admin
      .from("subscriptions")
      .update({ billing_error: error })
      .eq("user_id", userId);
  }
}

/**
 * Aplica el estado de un pago de dLocal sobre su orden.
 *
 * Lanza si `apply_billing_charge` falla: el pago está cobrado y la licencia no,
 * así que el llamador tiene que devolver un 5xx para que dLocal reintente la
 * notificación en vez de dar el caso por cerrado.
 */
export async function applyPaymentToOrder(
  admin: Admin,
  order: BillingOrderRow,
  payment: DlocalPayment,
  options: { planName?: string | null } = {},
): Promise<ReconcileOutcome> {
  const status = String(payment.status ?? "");

  if (isPaidStatus(status)) {
    // El token va a la orden ANTES de acreditar: `apply_billing_charge` lee
    // `checkout_token` de la fila para dejarlo como medio de cobro de la
    // suscripción. Si se guardara después, la renovación quedaría sin token.
    await admin
      .from("billing_orders")
      .update({
        dlocal_payment_id: payment.id,
        checkout_token: payment.merchant_checkout_token ?? order.checkout_token,
        payment_method_type: payment.payment_method_type ?? null,
        method: payment.payment_method_type ?? "checkout",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // La función resuelve el dueño leyendo la orden, así que no se le pasa: el
    // `user_id` que tenemos acá es de una lectura anterior y puede haber quedado
    // viejo (un registro con `claim_guest_orders` en el medio), además de que su
    // nulabilidad no se podía expresar en los tipos generados.
    const { data: charged, error: chargeError } = await admin.rpc("apply_billing_charge", {
      p_order_id: order.id,
    });

    if (chargeError) {
      throw new Error(`apply_billing_charge falló: ${chargeError.message}`);
    }

    const result = charged as { applied?: boolean; guest?: boolean } | null;
    const applied = result?.applied === true;

    // Sólo el PRIMER PAID de una orden de invitado manda el correo: en los
    // reintentos `applied` ya vuelve false. Que siga siendo de invitado lo dice
    // la función (`guest`), no la fila que leímos antes: si la cuenta se creó
    // mientras el pago viajaba, la orden ya tiene dueño y la licencia se activó.
    if (applied && result?.guest === true && order.guest_email) {
      await sendGuestCheckoutEmail({
        email: order.guest_email,
        fullName: order.payer_name,
        planName: options.planName ?? order.period_name,
      }).catch((error) => {
        // El pago ya está acreditado y la landing muestra el paso siguiente en
        // pantalla, así que un correo caído no puede tumbar la notificación.
        console.error("guest checkout email failed", error);
      });
    }

    return "paid";
  }

  if (isRejectedStatus(status)) {
    await markOrderFailed(
      admin,
      order.id,
      payment.status_detail ?? `El pago no se completó (${status}).`,
      order.user_id,
    );
    return "failed";
  }

  return "pending";
}

/**
 * Relee el pago en dLocal y reconcilia la orden. Devuelve null si la orden no
 * tiene un pago asociado todavía (nunca llegó a crearse en dLocal).
 */
export async function reconcileOrderFromDlocal(
  admin: Admin,
  order: BillingOrderRow,
): Promise<ReconcileOutcome | null> {
  if (!order.dlocal_payment_id) return null;
  const payment = await getPayment(order.dlocal_payment_id);
  return applyPaymentToOrder(admin, order, payment);
}
