import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { EPAYCO_TEST_MODE, findTransactionByReference } from "@/services/epayco.service";
import {
  amountMatches,
  outcomeFromStatusText,
  type EpaycoOutcome,
  type TransactionRow,
} from "@/services/epayco-protocol";
import { sendGuestCheckoutEmail } from "@/services/guest-checkout-email.server";

/**
 * Acreditación de un pago de ePayco, compartida por los caminos que pueden
 * enterarse de que una orden se pagó:
 *
 *  1. la confirmación (`/api/billing/webhook`),
 *  2. el polling del checkout (`/api/billing/orders/[id]`).
 *
 * Que el polling también reconcilie NO es redundancia, y con ePayco importa más
 * que antes: `x_ref_payco` no existe hasta que alguien paga, así que si la
 * confirmación se pierde no queda ningún identificador con el que preguntar.
 * Lo que rescata el caso es consultar por NUESTRA referencia
 * (`findTransactionByReference`), que funciona sin haber recibido nada.
 *
 * `apply_billing_charge` es idempotente, así que los dos caminos pueden pisarse
 * sin acreditar dos veces.
 */

type Admin = ReturnType<typeof createAdminClient>;

export const BILLING_ORDER_SELECT =
  "id, order_id, user_id, guest_email, payer_name, period_name, amount, currency, status, epayco_ref, epayco_transaction_id, epayco_status_code";

export interface BillingOrderRow {
  id: string;
  order_id: string;
  user_id: string | null;
  guest_email: string | null;
  payer_name: string | null;
  period_name: string;
  amount: number;
  currency: string;
  status: string;
  epayco_ref: string | null;
  epayco_transaction_id: string | null;
  epayco_status_code: string | null;
}

/**
 * `mismatch` no es un pago fallido: es una confirmación bien firmada cuyo monto
 * o moneda NO son los de esta orden. Merece su propio valor porque el
 * tratamiento es distinto — no se acredita, pero tampoco se marca la orden como
 * "el pago no se completó", que es mentira y esconde el problema.
 */
export type ReconcileOutcome =
  | "paid"
  | "failed"
  | "pending"
  | "reversed"
  | "mismatch"
  | "test_rejected";

/** Lo que se pudo observar de una transacción, venga de donde venga. */
export interface EpaycoObservation {
  outcome: EpaycoOutcome;
  ref: string | null;
  transactionId: string | null;
  statusCode: string | null;
  amount: string | number | null;
  currency: string | null;
  methodLabel: string | null;
  reason: string | null;
  /**
   * ¿La transacción se hizo en modo PRUEBA? El listado lo devuelve como
   * `test: true` y la confirmación como `x_test_request: "TRUE"`.
   */
  test: boolean;
}

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

/** Normaliza una fila del listado de transacciones a una observación. */
export function observationFromTransaction(row: TransactionRow): EpaycoObservation {
  return {
    outcome: outcomeFromStatusText(row.status),
    ref: row.referencePayco != null ? String(row.referencePayco) : null,
    transactionId: null,
    statusCode: null,
    amount: row.amount ?? null,
    currency: row.currency ?? null,
    methodLabel: row.paymentMethod ?? row.franchise ?? null,
    reason: row.response ?? null,
    // El listado trae `test` y hasta ahora NADIE lo leía: el tipo lo declaraba
    // y la observación lo tiraba. Ver la guarda en `applyObservationToOrder`.
    test: row.test === true,
  };
}

/**
 * Aplica una observación sobre su orden.
 *
 * Lanza si `apply_billing_charge` falla: el pago está cobrado y la licencia no,
 * así que el llamador tiene que devolver un 5xx para que ePayco reintente la
 * notificación en vez de dar el caso por cerrado.
 */
export async function applyObservationToOrder(
  admin: Admin,
  order: BillingOrderRow,
  observation: EpaycoObservation,
  options: { planName?: string | null } = {},
): Promise<ReconcileOutcome> {
  // Las referencias se estampan SIEMPRE, incluso con el pago pendiente: es lo
  // que permite consultar después por `getTransaction` y lo que hace que un
  // reclamo de soporte con una ref de ePayco encuentre su orden.
  const stamp: {
    updated_at: string;
    epayco_ref?: string;
    epayco_transaction_id?: string;
    epayco_status_code?: string;
    payment_method_type?: string;
    method?: string;
  } = { updated_at: new Date().toISOString() };
  if (observation.ref) stamp.epayco_ref = observation.ref;
  if (observation.transactionId) stamp.epayco_transaction_id = observation.transactionId;
  if (observation.statusCode) stamp.epayco_status_code = observation.statusCode;
  if (observation.methodLabel) {
    stamp.payment_method_type = observation.methodLabel;
    stamp.method = observation.methodLabel;
  }
  await admin.from("billing_orders").update(stamp).eq("id", order.id);

  if (observation.outcome === "paid") {
    // Una transacción de PRUEBA no activa nada en un deploy de producción.
    //
    // El webhook ya cortaba esto, pero el polling NO: el listado devuelve
    // `test: true`, `TransactionRow` lo declaraba, y la observación lo
    // descartaba en silencio. O sea que el mismo pago de prueba se rechazaba si
    // llegaba por notificación y se acreditaba si se leía por polling — bastaba
    // con volver a la pantalla con `?pay=` para cobrarse una licencia real con
    // la tarjeta de pruebas. La guarda va ACÁ, en el único punto por el que
    // pasan los dos caminos, para que un tercero no pueda volver a olvidarla.
    if (observation.test && !EPAYCO_TEST_MODE) {
      console.error("epayco test transaction on production deploy", order.id, observation.ref);
      await admin
        .from("billing_orders")
        .update({
          error: "Transacción de PRUEBA recibida en producción. No se activó ninguna licencia.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      return "test_rejected";
    }

    // La firma prueba que el mensaje es auténtico, NO que el monto sea el que
    // esta orden tenía que cobrar. Sin este cruce, una confirmación legítima de
    // un pago chico podría activar el plan más caro.
    const okAmount = amountMatches(observation.amount, Number(order.amount));
    const okCurrency =
      !observation.currency ||
      observation.currency.toUpperCase() === String(order.currency).toUpperCase();

    if (!okAmount || !okCurrency) {
      const detail = `Se esperaba ${order.amount} ${order.currency} y llegó ${observation.amount} ${observation.currency ?? "?"}.`;
      console.error("epayco amount mismatch", order.id, observation.ref, detail);
      // NO se marca "failed": el pago pudo ser perfectamente exitoso, lo que no
      // cuadra es a qué orden se lo están imputando. Se deja pendiente y se
      // registra, que es lo que permite que alguien lo mire.
      await admin
        .from("billing_orders")
        .update({ error: `Monto no coincide. ${detail}`, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      return "mismatch";
    }

    // La función resuelve el dueño leyendo la orden, así que no se le pasa: el
    // `user_id` que tenemos acá es de una lectura anterior y puede haber quedado
    // viejo (un registro con `claim_guest_orders` en el medio).
    const { data: charged, error: chargeError } = await admin.rpc("apply_billing_charge", {
      p_order_id: order.id,
    });

    if (chargeError) {
      throw new Error(`apply_billing_charge falló: ${chargeError.message}`);
    }

    const result = charged as { applied?: boolean; guest?: boolean } | null;
    const applied = result?.applied === true;

    // Sólo el PRIMER pago acreditado de una orden de invitado manda el correo:
    // en los reintentos `applied` ya vuelve false. Que siga siendo de invitado
    // lo dice la función (`guest`), no la fila que leímos antes.
    if (applied && result?.guest === true && order.guest_email) {
      await sendGuestCheckoutEmail({
        email: order.guest_email,
        fullName: order.payer_name,
        planName: options.planName ?? order.period_name,
      }).catch((error) => {
        // El pago ya está acreditado y la pantalla muestra el paso siguiente, así
        // que un correo caído no puede tumbar la notificación.
        console.error("guest checkout email failed", error);
      });
    }

    return "paid";
  }

  if (observation.outcome === "failed") {
    await markOrderFailed(
      admin,
      order.id,
      observation.reason ?? "El pago no se completó.",
      order.user_id,
    );
    return "failed";
  }

  if (observation.outcome === "reversed") {
    // Devolución sobre un pago YA acreditado. NO se revoca la licencia sola:
    // quitarle el acceso a alguien de forma automática por un mensaje del
    // proveedor es una decisión de negocio, no de este código. Se registra para
    // que se vea, que es lo que hoy no existiría.
    console.error("epayco reversal", order.id, observation.ref, observation.reason);
    await admin
      .from("billing_orders")
      .update({
        error: `Pago reversado en ePayco. ${observation.reason ?? ""}`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return "reversed";
  }

  return "pending";
}

/**
 * Relee la transacción en ePayco por NUESTRA referencia y reconcilia la orden.
 * Devuelve null si ePayco todavía no tiene ninguna transacción para ella (nadie
 * llegó a pagar).
 */
export async function reconcileOrderFromEpayco(
  admin: Admin,
  order: BillingOrderRow,
): Promise<ReconcileOutcome | null> {
  const row = await findTransactionByReference(order.order_id);
  if (!row) return null;
  return applyObservationToOrder(admin, order, observationFromTransaction(row));
}

/** Ventana y tope del barrido: ni revisar el historial entero ni castigar a ePayco. */
const SWEEP_WINDOW_DAYS = 30;
const SWEEP_MAX_ORDERS = 5;

/**
 * Relee TODAS las órdenes pendientes recientes de un dueño.
 *
 * Existe porque hasta ahora una orden pendiente sólo se reconciliaba si la
 * persona volvía a caer en la pantalla CON `?pay=<uuid>` en la URL. Quien pagaba
 * y cerraba la pestaña —o volvía al día siguiente por su cuenta— no tenía
 * absolutamente nada que mirara su orden: ni cron, ni barrido, ni el webhook si
 * esa notificación se había perdido. La orden quedaba pendiente PARA SIEMPRE con
 * la plata ya cobrada, que es el peor final posible de este flujo.
 *
 * Depender de que el usuario conserve un parámetro de query es apoyar la
 * acreditación de un pago en la navegación del navegador. Esto lo desacopla: con
 * abrir la pantalla de suscripción alcanza.
 *
 * Se recorre en serie a propósito: son llamadas de red a un tercero y el
 * paralelo acá sólo serviría para que ePayco nos limite por ráfaga.
 */
export async function reconcilePendingOrders(
  admin: Admin,
  userId: string,
): Promise<{ checked: number; activated: number }> {
  const since = new Date(
    Date.now() - SWEEP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: orders } = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT)
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(SWEEP_MAX_ORDERS);

  if (!orders?.length) return { checked: 0, activated: 0 };

  let activated = 0;
  for (const order of orders as BillingOrderRow[]) {
    try {
      if ((await reconcileOrderFromEpayco(admin, order)) === "paid") activated += 1;
    } catch (error) {
      // Una orden que ePayco no puede resolver no puede tumbar el barrido de
      // las demás: la siguiente puede ser justamente la que sí está pagada.
      console.error("sweep reconcile failed", order.id, order.order_id, error);
    }
  }

  return { checked: orders.length, activated };
}
