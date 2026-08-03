import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  DLOCAL_CONFIGURED,
  DLOCAL_CURRENCY,
  chargeRecurring,
  DlocalApiError,
} from "@/services/dlocalgo.service";
import {
  applyPaymentToOrder,
  BILLING_ORDER_SELECT,
  markOrderFailed,
  type BillingOrderRow,
} from "@/services/subscription-billing.server";

/**
 * Cobra las renovaciones mensuales vencidas con el `merchant_checkout_token`
 * que dejó el primer pago (`POST /v1/payments/recurring/{token}`). Se invoca
 * una vez por día desde el cron de Vercel (`vercel.json`).
 *
 * Autorización: SIEMPRE `Authorization: Bearer <CRON_SECRET>`.
 * Vercel inyecta ese header solo cuando `CRON_SECRET` existe como variable de
 * entorno. La versión anterior aceptaba cualquier request que trajera el header
 * `x-vercel-cron`, que es falsificable: bastaba mandarlo para disparar cobros
 * reales contra las tarjetas guardadas. Sin `CRON_SECRET` configurado la ruta
 * se niega a correr, en vez de quedar abierta.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Reintentos diarios antes de abandonar el cobro automático. */
const MAX_ATTEMPTS = 4;
/** Tope de suscripciones por corrida, para no exceder el tiempo de la función. */
const BATCH = 50;

interface SubToCharge {
  user_id: string;
  plan_id: string;
  billing_provider_ref: string | null;
  billing_failed_attempts: number | null;
  billing_payer_name: string | null;
  billing_payer_document: string | null;
  billing_payer_phone: string | null;
  billing_payer_email: string | null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!DLOCAL_CONFIGURED) {
    return NextResponse.json({ error: "dLocal no está configurado." }, { status: 503 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: subs, error: subsError } = await admin
    .from("subscriptions")
    .select(
      "user_id, plan_id, billing_provider_ref, billing_failed_attempts, billing_payer_name, billing_payer_document, billing_payer_phone, billing_payer_email",
    )
    .eq("billing_recurring", true)
    .not("billing_provider_ref", "is", null)
    .lte("billing_next_charge_at", nowIso)
    .order("billing_next_charge_at", { ascending: true })
    .limit(BATCH);

  if (subsError) {
    return NextResponse.json({ error: subsError.message }, { status: 500 });
  }

  let paid = 0;
  let failed = 0;
  let skipped = 0;
  let abandoned = 0;

  for (const sub of (subs ?? []) as SubToCharge[]) {
    const token = sub.billing_provider_ref;
    if (!token) {
      skipped += 1;
      continue;
    }

    // Una licencia de revendedor manda sobre el cobro online: el revendedor la
    // recarga con créditos, así que cobrar acá sería cobrar dos veces.
    const { data: license } = await admin
      .from("client_licenses")
      .select("user_id")
      .eq("user_id", sub.user_id)
      .maybeSingle();
    if (license) {
      await admin
        .from("subscriptions")
        .update({ billing_recurring: false, billing_next_charge_at: null })
        .eq("user_id", sub.user_id);
      skipped += 1;
      continue;
    }

    const { data: period } = await admin
      .from("plan_periods")
      .select("id, name, months, price")
      .eq("plan_id", sub.plan_id)
      .eq("months", 1)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!period) {
      await admin
        .from("subscriptions")
        .update({
          billing_error: "El plan no tiene un periodo mensual activo.",
          billing_recurring: false,
          billing_next_charge_at: null,
        })
        .eq("user_id", sub.user_id);
      skipped += 1;
      continue;
    }

    const amount = Number(period.price);
    const orderId = `ventex-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const periodName = `Renovación ${period.name.toLowerCase()}`;

    const { data: created, error: orderError } = await admin
      .from("billing_orders")
      .insert({
        order_id: orderId,
        user_id: sub.user_id,
        plan_id: sub.plan_id,
        plan_period_id: period.id,
        period_name: periodName,
        period_months: period.months,
        amount,
        currency: DLOCAL_CURRENCY,
        method: "checkout",
        status: "pending",
        checkout_token: token,
        payer_name: sub.billing_payer_name,
        payer_document: sub.billing_payer_document,
        payer_phone: sub.billing_payer_phone,
        payer_email: sub.billing_payer_email,
      })
      .select(BILLING_ORDER_SELECT)
      .single();

    if (orderError || !created) {
      failed += 1;
      continue;
    }
    const order = created as BillingOrderRow;

    /**
     * Un fallo reintenta al día siguiente, pero no para siempre: al llegar al
     * tope se apaga la recurrencia y el plan se vence solo. Así una tarjeta
     * muerta no genera una orden por día indefinidamente.
     */
    const registerFailure = async (message: string) => {
      const attempts = (sub.billing_failed_attempts ?? 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await markOrderFailed(admin, order.id, message, sub.user_id);
      await admin
        .from("subscriptions")
        .update({
          billing_failed_attempts: attempts,
          billing_error: giveUp
            ? `No pudimos cobrar la renovación después de ${attempts} intentos: ${message}`
            : message,
          billing_recurring: !giveUp,
          billing_next_charge_at: giveUp
            ? null
            : new Date(Date.now() + DAY_MS).toISOString(),
        })
        .eq("user_id", sub.user_id);
      if (giveUp) abandoned += 1;
      else failed += 1;
    };

    try {
      const payment = await chargeRecurring(token, {
        amount,
        description: `Ventex · ${periodName}`,
        orderId,
      });

      // `applyPaymentToOrder` acredita y, vía `sync_billing_schedule`, reagenda
      // el próximo cobro al nuevo fin de periodo y resetea el contador.
      const outcome = await applyPaymentToOrder(admin, order, payment);

      if (outcome === "paid") {
        paid += 1;
      } else if (outcome === "failed") {
        await registerFailure(payment.status_detail ?? "El cobro fue rechazado.");
      } else {
        // Quedó pendiente (ej. un medio que confirma después): el webhook y el
        // polling lo van a resolver. No se reagenda ni se cuenta como fallo.
        skipped += 1;
      }
    } catch (error) {
      const message =
        error instanceof DlocalApiError || error instanceof Error
          ? error.message
          : "Error de red con dLocal.";
      await registerFailure(message);
    }
  }

  return NextResponse.json({
    processed: paid + failed + skipped + abandoned,
    paid,
    failed,
    abandoned,
    skipped,
    // Si se llenó el lote quedan vencidas para la próxima corrida: decirlo en
    // vez de dar la impresión de que se cobró todo.
    truncated: (subs?.length ?? 0) === BATCH,
  });
}
