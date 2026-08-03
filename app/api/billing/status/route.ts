import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";

/**
 * Estado de cobro del dueño: si la renovación está activa, cuándo es el próximo
 * cobro, con qué medio se pagó y el último error.
 *
 * Va por ruta y no por la RPC `my_subscription` porque esos campos son sólo del
 * dueño: `my_subscription` la leen también los trabajadores (para los topes del
 * plan) y no tienen por qué ver la facturación.
 */
export async function GET() {
  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) {
    return NextResponse.json({ billing: null });
  }

  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select(
      "billing_provider, billing_recurring, billing_next_charge_at, billing_last_charge_at, billing_error, billing_provider_ref, current_period_end",
    )
    .eq("user_id", owner.user.id)
    .maybeSingle();

  if (!sub) return NextResponse.json({ billing: null });

  const { data: lastOrder } = await admin
    .from("billing_orders")
    .select("payment_method_type, paid_at, amount, currency, period_name")
    .eq("user_id", owner.user.id)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    billing: {
      provider: sub.billing_provider,
      recurring: Boolean(sub.billing_recurring),
      /** Sin medio guardado no se puede reactivar la renovación. */
      hasSavedMethod: Boolean(sub.billing_provider_ref),
      nextChargeAt: sub.billing_next_charge_at,
      lastChargeAt: sub.billing_last_charge_at,
      currentPeriodEnd: sub.current_period_end,
      error: sub.billing_error,
      lastPayment: lastOrder
        ? {
            methodType: lastOrder.payment_method_type,
            paidAt: lastOrder.paid_at,
            amount: Number(lastOrder.amount),
            currency: lastOrder.currency,
            periodName: lastOrder.period_name,
          }
        : null,
    },
  });
}
