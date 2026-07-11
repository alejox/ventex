"use client";

import { useEffect } from "react";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { useSettingsStore } from "@/stores/settings.store";
import type { Plan } from "@/services/subscription.service";
import {
  formatMoney,
  formatSalesLimit,
  usagePercent,
  planAccent,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/config/plans";

export default function SubscriptionPage() {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const plans = useSubscriptionStore((s) => s.plans);
  const loading = useSubscriptionStore((s) => s.loading);
  const error = useSubscriptionStore((s) => s.error);
  const fetchAll = useSubscriptionStore((s) => s.fetchAll);

  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  const currency = settings?.currency ?? "COP";

  useEffect(() => {
    fetchAll();
    if (!settings) fetchSettings();
  }, [fetchAll, fetchSettings, settings]);

  return (
    <div className="w-full max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Mi Plan</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Consulta tu plan actual, tu consumo del mes y los planes disponibles.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error}
        </div>
      )}

      {loading && !subscription ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando tu plan…</p>
      ) : subscription ? (
        <>
          <CurrentPlanCard subscription={subscription} currency={currency} />
          <h2 className="text-lg font-bold text-on-surface mt-10 mb-4">Planes disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans
              .filter((p) => p.is_active)
              .map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  currency={currency}
                  current={p.id === subscription.plan_id}
                />
              ))}
          </div>
          <p className="text-xs text-on-surface-variant mt-6 text-center">
            Para cambiar de plan, contacta al administrador de la plataforma.
          </p>
        </>
      ) : null}
    </div>
  );
}

function CurrentPlanCard({
  subscription,
  currency,
}: {
  subscription: NonNullable<ReturnType<typeof useSubscriptionStore.getState>["subscription"]>;
  currency: string;
}) {
  const accent = planAccent(subscription.plan_id);
  const statusLabel = SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status;

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            Plan actual
          </p>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${accent.text}`}>{subscription.plan_name}</span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                subscription.status === "active"
                  ? "bg-[#10b981]/15 text-[#10b981]"
                  : "bg-error-container/20 text-error-dim"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        <span className={`shrink-0 text-sm font-bold px-3 py-1.5 rounded-xl ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}>
          {subscription.price > 0 ? `${formatMoney(subscription.price, currency)}/mes` : "Gratis"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <UsageBar
          label="Colaboradores"
          used={subscription.staff_count}
          max={subscription.max_collaborators}
          format={(n) => String(n)}
        />
        <UsageBar
          label="Ventas del mes"
          used={subscription.monthly_sales}
          max={subscription.max_monthly_sales}
          format={(n) => formatMoney(n, currency)}
        />
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  max,
  format,
}: {
  label: string;
  used: number;
  max: number | null;
  format: (n: number) => string;
}) {
  const pct = usagePercent(used, max);
  const atLimit = max != null && used >= max;
  const nearLimit = pct >= 80;

  const barColor = atLimit
    ? "bg-error"
    : nearLimit
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold text-on-surface">{label}</span>
        <span className="text-sm text-on-surface-variant tabular-nums">
          {format(used)}
          <span className="text-on-surface-variant/60"> / {max == null ? "∞" : format(max)}</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-surface-container-high overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: max == null ? "12%" : `${Math.max(pct, 3)}%` }}
        />
      </div>
      {atLimit && (
        <p className="text-xs text-error-dim mt-2">
          Has alcanzado el límite de tu plan. Sube de plan para ampliarlo.
        </p>
      )}
    </div>
  );
}

function PlanCard({ plan, currency, current }: { plan: Plan; currency: string; current: boolean }) {
  const accent = planAccent(plan.id);
  return (
    <div
      className={`rounded-3xl p-6 border transition-colors ${
        current
          ? `${accent.bg} ring-2 ${accent.ring} border-transparent`
          : "bg-surface-container-lowest border-outline-variant/10 hover:bg-surface-container-low"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className={`text-lg font-bold ${current ? accent.text : "text-on-surface"}`}>
          {plan.name}
        </span>
        {current && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${accent.text} ${accent.ring}`}>
            Actual
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-on-surface mb-6">
        {plan.price > 0 ? formatMoney(plan.price, currency) : "Gratis"}
        {plan.price > 0 && <span className="text-sm font-medium text-on-surface-variant">/mes</span>}
      </p>
      <ul className="space-y-3 text-sm">
        <li className="flex items-center gap-2 text-on-surface-variant">
          <Check /> Hasta <strong className="text-on-surface">{plan.max_collaborators}</strong>{" "}
          colaborador{plan.max_collaborators === 1 ? "" : "es"}
        </li>
        <li className="flex items-center gap-2 text-on-surface-variant">
          <Check /> Ventas/mes:{" "}
          <strong className="text-on-surface">{formatSalesLimit(plan.max_monthly_sales, currency)}</strong>
        </li>
      </ul>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-[#10b981] shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
