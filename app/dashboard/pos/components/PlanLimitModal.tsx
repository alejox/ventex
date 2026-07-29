"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { formatMoney, formatSalesLimit } from "@/config/plans";
import { whatsappUrl } from "@/config/contact";
import { backdropProps } from "@/components/modal";

/**
 * Se abre cuando `create_sale` rechaza la venta por tope del plan.
 *
 * No es un toast a propósito: la caja queda trabada hasta que suban de plan, y
 * un aviso que se desvanece dejaría al cajero apretando "Cobrar" sin entender
 * por qué no pasa nada. Los planes salen de la base, no de código, así que lo
 * que se ofrece acá es lo mismo que hay publicado.
 */
export function PlanLimitModal({ onClose }: { onClose: () => void }) {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const plans = useSubscriptionStore((s) => s.plans);
  const fetchAll = useSubscriptionStore((s) => s.fetchAll);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const current = subscription?.plan_id;
  /** Solo tiene sentido ofrecer planes que vendan MÁS que el actual. */
  const upgrades = plans.filter((p) => {
    if (p.id === current) return false;
    const actual = subscription?.max_monthly_sales;
    if (actual == null) return false;
    return p.max_monthly_sales == null || Number(p.max_monthly_sales) > Number(actual);
  });

  const message =
    `Hola, alcancé el tope de ventas de mi plan ${subscription?.plan_name ?? ""} en Ventex ` +
    `y necesito subir de plan para seguir vendiendo.`;

  return (
    <div
      {...backdropProps(onClose)}
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto border border-outline-variant/10 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
      >
        <div className="p-6 text-center border-b border-outline-variant/10">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/15 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">
            Alcanzaste el tope de ventas de tu plan
          </h2>
          <p className="text-sm text-on-surface-variant">
            {subscription?.max_monthly_sales != null ? (
              <>
                Tu plan <strong className="text-on-surface">{subscription.plan_name}</strong> permite
                vender hasta{" "}
                <strong className="text-on-surface">
                  {formatSalesLimit(subscription.max_monthly_sales)}
                </strong>{" "}
                al mes. Sube de plan para seguir cobrando hoy mismo.
              </>
            ) : (
              <>Sube de plan para seguir cobrando hoy mismo.</>
            )}
          </p>
        </div>

        {upgrades.length > 0 && (
          <div className="p-6 space-y-3">
            {upgrades.map((plan) => (
              <div
                key={plan.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/15 bg-surface-container-low p-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-on-surface">{plan.name}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Ventas al mes: {formatSalesLimit(plan.max_monthly_sales)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-on-surface tabular-nums">
                    {formatMoney(Number(plan.price))}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">/mes</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-6 pt-0 flex flex-col gap-2">
          <a
            href={whatsappUrl(message)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-center hover:bg-primary-dim transition-colors"
          >
            Subir de plan por WhatsApp
          </a>
          <Link
            href="/dashboard/subscription"
            className="w-full py-3 rounded-xl border border-outline-variant/20 text-on-surface font-semibold text-center hover:bg-surface-container-high transition-colors"
          >
            Ver todos los planes
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
