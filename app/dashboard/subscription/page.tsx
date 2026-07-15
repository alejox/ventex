"use client";

import { useEffect } from "react";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { useSettingsStore } from "@/stores/settings.store";
import type { Plan, PlanPeriod } from "@/services/subscription.service";
import {
  formatMoney,
  formatSalesLimit,
  usagePercent,
  planAccent,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/config/plans";
import { whatsappUrl } from "@/config/contact";

export default function SubscriptionPage() {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const plans = useSubscriptionStore((s) => s.plans);
  const periods = useSubscriptionStore((s) => s.periods);
  const loading = useSubscriptionStore((s) => s.loading);
  const error = useSubscriptionStore((s) => s.error);
  const fetchAll = useSubscriptionStore((s) => s.fetchAll);

  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  const currency = settings?.currency ?? "COP";
  const businessName = settings?.business_profile?.businessName?.trim() || "";

  useEffect(() => {
    fetchAll();
    if (!settings) fetchSettings();
  }, [fetchAll, fetchSettings, settings]);

  /** Firma del negocio para que el asesor sepa a quién le recarga la licencia. */
  const signature = businessName ? ` Mi negocio es "${businessName}".` : "";

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
          <CurrentPlanCard
            subscription={subscription}
            currency={currency}
            signature={signature}
          />
          <h2 className="text-lg font-bold text-on-surface mt-10 mb-4">Planes disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans
              .filter((p) => p.is_active)
              .map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  periods={periods.filter((x) => x.plan_id === p.id && x.is_active)}
                  currency={currency}
                  current={p.id === subscription.plan_id}
                  signature={signature}
                />
              ))}
          </div>
          <p className="text-xs text-on-surface-variant mt-6 text-center">
            Los cambios de plan y las renovaciones se gestionan por WhatsApp con
            un asesor.
          </p>
        </>
      ) : null}
    </div>
  );
}

function CurrentPlanCard({
  subscription,
  currency,
  signature,
}: {
  subscription: NonNullable<ReturnType<typeof useSubscriptionStore.getState>["subscription"]>;
  currency: string;
  signature: string;
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

      <div className="mt-8 pt-6 border-t border-outline-variant/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-on-surface-variant">
          ¿Necesitas renovar, subir de plan o resolver una duda? Escríbenos por
          WhatsApp y te atendemos.
        </p>
        <div className="flex flex-wrap gap-3 shrink-0">
          <WhatsAppButton
            message={`Hola, quiero renovar mi plan ${subscription.plan_name} en Ventex.${signature}`}
          >
            Renovar plan
          </WhatsAppButton>
          <WhatsAppButton
            variant="ghost"
            message={`Hola, necesito ayuda con mi cuenta de Ventex (plan ${subscription.plan_name}).${signature}`}
          >
            Soporte
          </WhatsAppButton>
        </div>
      </div>
    </div>
  );
}

/** Botón que abre WhatsApp con el mensaje ya escrito. */
function WhatsAppButton({
  message,
  children,
  variant = "solid",
}: {
  message: string;
  children: React.ReactNode;
  variant?: "solid" | "ghost" | "outline";
}) {
  const styles = {
    solid:
      "bg-[#25D366] text-white hover:bg-[#1ebe57] shadow-lg shadow-[#25D366]/20",
    ghost:
      "border border-outline-variant/20 text-on-surface hover:bg-surface-container-high",
    outline:
      "border border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/10",
  }[variant];

  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap ${styles}`}
    >
      <WhatsAppIcon />
      {children}
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.688 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z" />
    </svg>
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

function PlanCard({
  plan,
  periods,
  currency,
  current,
  signature,
}: {
  plan: Plan;
  periods: PlanPeriod[];
  currency: string;
  current: boolean;
  signature: string;
}) {
  const accent = planAccent(plan.id);
  /** Tiempos de más de un mes: son la oferta de ahorro del plan. */
  const longer = periods.filter((p) => p.months > 1);
  return (
    <div
      className={`flex flex-col rounded-3xl p-6 border transition-colors ${
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
      <div className="mb-6">
        <p className="text-2xl font-bold text-on-surface">
          {plan.price > 0 ? formatMoney(plan.price, currency) : "Gratis"}
          {plan.price > 0 && <span className="text-sm font-medium text-on-surface-variant">/mes</span>}
        </p>
        {longer.map((p) => (
          <p key={p.id} className="text-sm text-on-surface-variant mt-1">
            o <span className="text-primary font-semibold">{p.name}</span>:{" "}
            {formatMoney(p.price, currency)} por {p.months} meses
          </p>
        ))}
      </div>
      <ul className="space-y-3 text-sm flex-1">
        <li className="flex items-center gap-2 text-on-surface-variant">
          <Check /> Hasta <strong className="text-on-surface">{plan.max_collaborators}</strong>{" "}
          colaborador{plan.max_collaborators === 1 ? "" : "es"}
        </li>
        <li className="flex items-center gap-2 text-on-surface-variant">
          <Check /> Ventas/mes:{" "}
          <strong className="text-on-surface">{formatSalesLimit(plan.max_monthly_sales, currency)}</strong>
        </li>
      </ul>

      {plan.price > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <WhatsAppButton
            variant={current ? "outline" : "solid"}
            message={
              current
                ? `Hola, quiero renovar mi plan ${plan.name} en Ventex.${signature}`
                : `Hola, quiero contratar el plan ${plan.name} en Ventex.${signature}`
            }
          >
            {current ? "Renovar" : `Quiero el plan ${plan.name}`}
          </WhatsAppButton>
          {/* Un botón por tiempo largo: el mensaje ya lleva el precio acordado. */}
          {longer.map((p) => (
            <WhatsAppButton
              key={p.id}
              variant="ghost"
              message={`Hola, quiero el plan ${plan.name} en modalidad ${p.name} (${formatMoney(p.price, currency)} por ${p.months} meses).${signature}`}
            >
              Contratar {p.name.toLowerCase()}
            </WhatsAppButton>
          ))}
        </div>
      )}
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
