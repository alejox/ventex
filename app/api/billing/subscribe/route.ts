import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import {
  DLOCAL_CONFIGURED,
  DLOCAL_CURRENCY,
  createPayment,
  DlocalApiError,
} from "@/services/dlocalgo.service";
import { markOrderFailed } from "@/services/subscription-billing.server";

/**
 * Inicia el cobro de un periodo (`plan_periods`) con dLocal Go.
 *
 * El checkout de dLocal Go es HOSTEADO: acá no se elige medio de pago ni se
 * tocan datos de tarjeta. Se crea el pago, se devuelve `redirectUrl` y el
 * pagador elige allá entre Nequi, PSE, tarjeta o efectivo. El resultado vuelve
 * por dos vías independientes: la notificación al webhook y el polling de la
 * orden al volver del checkout.
 *
 * Dos modos:
 *  - Con sesión de dueño: la orden se ata al usuario y la licencia se activa al
 *    acreditarse (`apply_billing_charge`).
 *  - Sin sesión (INVITADO de la landing): la orden queda con `guest_email`; al
 *    registrarse con ese mismo correo, `claim_guest_orders` la reclama y activa
 *    la licencia.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Base pública del sitio: dLocal tiene que poder alcanzar estas URLs. */
function publicBase(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  if (!DLOCAL_CONFIGURED) {
    return NextResponse.json(
      { error: "Los pagos en línea no están disponibles por ahora. Escribinos por WhatsApp." },
      { status: 503 },
    );
  }

  const owner = await requireSelectedWorkspaceOwner();

  const body = await request.json().catch(() => null);
  const planPeriodId = String(body?.planPeriodId ?? "");
  const payerRaw = (body?.payer ?? {}) as Record<string, unknown>;
  const rawGuestEmail = body?.email ? String(body.email).trim().toLowerCase() : "";

  if (!planPeriodId) {
    return NextResponse.json({ error: "Falta el periodo del plan." }, { status: 400 });
  }

  const isGuest = !owner;
  if (isGuest && !EMAIL_PATTERN.test(rawGuestEmail)) {
    return NextResponse.json(
      { error: "Ingresá un correo válido: es donde vas a recibir el acceso a tu cuenta." },
      { status: 400 },
    );
  }

  const payerName = String(payerRaw.name ?? "").trim();
  const payerDocument = String(payerRaw.document ?? "").trim();
  const payerPhone = String(payerRaw.phone ?? "").replace(/\D/g, "");
  const payerEmail = owner ? (owner.user.email ?? "") : rawGuestEmail;

  if (!payerName) {
    return NextResponse.json({ error: "Ingresá el nombre del titular." }, { status: 400 });
  }
  if (!payerEmail) {
    return NextResponse.json(
      { error: "Tu cuenta no tiene un correo asociado. Escribinos por WhatsApp." },
      { status: 400 },
    );
  }
  if (!/^\d{6,11}$/.test(payerDocument)) {
    return NextResponse.json(
      { error: "Ingresá el documento del titular (CC o NIT, 6 a 11 dígitos)." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: period } = await admin
    .from("plan_periods")
    .select("id, plan_id, name, months, price, is_active")
    .eq("id", planPeriodId)
    .maybeSingle();
  if (!period || !period.is_active) {
    return NextResponse.json({ error: "Ese periodo ya no está disponible." }, { status: 400 });
  }

  const { data: plan } = await admin
    .from("plans")
    .select("id, name")
    .eq("id", period.plan_id)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: "El plan no existe." }, { status: 400 });
  }

  // El precio SIEMPRE sale de la base, nunca del cliente: es lo que impide que
  // alguien mande su propio monto.
  const amount = Number(period.price);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "El plan Gratis no requiere pago." }, { status: 400 });
  }

  const userId = owner?.user.id ?? null;
  const orderId = `ventex-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const periodName = `${plan.name} ${period.name}`;

  const { data: order, error: orderError } = await admin
    .from("billing_orders")
    .insert({
      order_id: orderId,
      user_id: userId,
      guest_email: isGuest ? rawGuestEmail : null,
      plan_id: plan.id,
      plan_period_id: period.id,
      period_name: periodName,
      period_months: period.months,
      amount,
      currency: DLOCAL_CURRENCY,
      method: "checkout",
      status: "pending",
      payer_name: payerName,
      payer_document: payerDocument,
      payer_phone: payerPhone || null,
      payer_email: payerEmail,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "No se pudo crear la orden de pago." }, { status: 500 });
  }

  const base = publicBase(request);
  // Al volver del checkout, `?pay=<id>` reabre el modal en modo polling.
  const returnPath = owner ? "/dashboard/subscription" : "/";
  const separator = returnPath.includes("?") ? "&" : "?";

  try {
    const payment = await createPayment({
      amount,
      orderId,
      description: `Ventex · ${periodName}`,
      notificationUrl: `${base}/api/billing/webhook`,
      successUrl: `${base}${returnPath}${separator}pay=${order.id}`,
      backUrl: `${base}${returnPath}`,
      payer: {
        name: payerName,
        email: payerEmail,
        document: payerDocument,
        document_type: payerDocument.length > 10 ? "NIT" : "CC",
        ...(payerPhone ? { phone: payerPhone } : {}),
      },
    });

    await admin
      .from("billing_orders")
      .update({
        dlocal_payment_id: payment.id,
        checkout_token: payment.merchant_checkout_token ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (!payment.redirect_url) {
      await markOrderFailed(admin, order.id, "dLocal no devolvió el checkout.", userId);
      return NextResponse.json(
        { error: "No pudimos abrir el checkout. Intentá de nuevo en un momento." },
        { status: 502 },
      );
    }

    // Los datos del titular quedan guardados para la próxima renovación, pero
    // sólo cuando hay usuario: un invitado todavía no tiene suscripción.
    if (userId) {
      await admin
        .from("subscriptions")
        .update({
          billing_payer_name: payerName,
          billing_payer_document: payerDocument,
          billing_payer_phone: payerPhone || null,
          billing_payer_email: payerEmail,
          billing_error: null,
        })
        .eq("user_id", userId);
    }

    return NextResponse.json({
      action: "redirect",
      redirectUrl: payment.redirect_url,
      orderId: order.id,
    });
  } catch (error) {
    const message =
      error instanceof DlocalApiError || error instanceof Error
        ? error.message
        : "No se pudo procesar el pago.";
    await markOrderFailed(admin, order.id, message, userId);
    const status = error instanceof DlocalApiError ? error.status : 502;
    return NextResponse.json({ error: message }, { status: status >= 500 ? status : 502 });
  }
}
