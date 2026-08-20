import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { EPAYCO_TEST_MODE, epaycoSecrets } from "@/services/epayco.service";
import {
  confirmationCode,
  confirmationOutcome,
  isTestTransaction,
  verifyConfirmation,
  type ConfirmationFields,
} from "@/services/epayco-protocol";
import {
  applyObservationToOrder,
  BILLING_ORDER_SELECT,
  type BillingOrderRow,
  type EpaycoObservation,
} from "@/services/subscription-billing.server";

/**
 * URL de confirmación de ePayco.
 *
 * El cuerpo trae la transacción entera (~30 campos `x_`) firmada. Eso NO
 * significa que se le pueda creer entero:
 *
 *  - La firma cubre referencia, transacción, monto y moneda. **No cubre el
 *    estado.** Que la firma valide no dice que el pago esté aprobado.
 *  - Que el monto no haya sido manipulado en tránsito tampoco dice que sea el
 *    monto de ESTA orden. Ese cruce lo hace `applyObservationToOrder`.
 *
 * Códigos de respuesta, que definen si ePayco reintenta:
 *  - 401 firma inválida — no es nuestro emisor, no hay nada que reintentar.
 *  - 200 orden inexistente, duplicado o pago aún pendiente — nada que hacer.
 *  - 5xx no pudimos acreditar una orden YA COBRADA — que reintente. Es la única
 *    red que impide cobrarle a alguien sin activarle la licencia, y por eso NO
 *    se contesta 200 antes de terminar de acreditar: un 200 apresurado cancela
 *    el reintento y convierte un fallo transitorio en plata cobrada sin
 *    servicio.
 */

/**
 * ePayco postea la confirmación como formulario, pero hay integraciones que la
 * reciben en JSON. Se aceptan las dos: equivocarse acá no da un error visible,
 * da un webhook que nunca encuentra la orden.
 */
function parseConfirmation(raw: string, contentType: string): ConfirmationFields | null {
  if (!raw.trim()) return null;

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value != null && typeof value !== "object") fields[key] = String(value);
      }
      return fields as unknown as ConfirmationFields;
    } catch {
      return null;
    }
  }

  const params = new URLSearchParams(raw);
  const fields: Record<string, string> = {};
  for (const [key, value] of params.entries()) fields[key] = value;
  return Object.keys(fields).length ? (fields as unknown as ConfirmationFields) : null;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const fields = parseConfirmation(raw, request.headers.get("content-type") ?? "");

  if (!fields) return NextResponse.json({ ok: true });

  if (!verifyConfirmation(fields, epaycoSecrets())) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  // Una confirmación de PRUEBA llegando a un deploy de producción no puede
  // activar nada. Al revés (producción sobre un deploy de prueba) tampoco, pero
  // eso ya lo corta la firma: las llaves son distintas.
  if (isTestTransaction(fields) && !EPAYCO_TEST_MODE) {
    console.warn("epayco test confirmation on production deploy", fields.x_ref_payco);
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  // `extras.extra1` lleva el uuid de la orden y resuelve por clave primaria;
  // `invoice` lleva el `order_id`. Se intenta el uuid primero porque es el
  // camino exacto, y el `order_id` queda de respaldo por si ePayco no devuelve
  // los extras en algún medio de pago.
  const orderUuid = (fields.x_extra1 ?? "").trim();
  const invoice = (fields.x_id_invoice ?? fields.x_id_factura ?? "").trim();

  const query = admin.from("billing_orders").select(BILLING_ORDER_SELECT);
  const { data: order } = orderUuid
    ? await query.eq("id", orderUuid).maybeSingle()
    : invoice
      ? await query.eq("order_id", invoice).maybeSingle()
      : { data: null };

  if (!order) {
    // Puede ser un cobro que no nació en Ventex. Cerrar con 200 para que ePayco
    // no reintente contra una orden que no existe.
    return NextResponse.json({ ok: true });
  }

  const row = order as BillingOrderRow;
  const code = confirmationCode(fields);
  const ref = (fields.x_ref_payco ?? "").trim() || null;

  // La confirmación puede llegar varias veces para la misma referencia, y con
  // estados distintos (primero Pendiente, después Aceptada). Se corta sólo el
  // duplicado EXACTO sobre una orden ya resuelta: si el estado cambió, o la
  // orden sigue pendiente, hay que procesarlo.
  if (row.epayco_ref === ref && row.epayco_status_code === code && row.status !== "pending") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const observation: EpaycoObservation = {
    outcome: confirmationOutcome(code),
    ref,
    transactionId: (fields.x_transaction_id ?? "").trim() || null,
    statusCode: code || null,
    // El monto va como LLEGÓ, sin normalizar: el cruce compara en centavos y
    // reformatearlo acá sólo agregaría una oportunidad de equivocarse.
    amount: fields.x_amount ?? null,
    currency: (fields.x_currency_code ?? "").trim() || null,
    methodLabel: (fields.x_franchise ?? "").trim() || null,
    reason: (fields.x_response_reason_text ?? fields.x_response ?? "").trim() || null,
  };

  try {
    await applyObservationToOrder(admin, row, observation);
  } catch (error) {
    console.error("apply observation failed", row.id, error);
    return NextResponse.json({ error: "No pudimos acreditar el pago." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
