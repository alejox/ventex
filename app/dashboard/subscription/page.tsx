"use client";

import { useEffect, useState } from "react";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { useSettingsStore } from "@/stores/settings.store";
import type { Plan, PlanPeriod } from "@/services/subscription.service";
import {
  formatMoney,
  formatSalesLimit,
  usagePercent,
  planAccent,
  SUBSCRIPTION_STATUS_LABELS,
  paymentMethodLabel,
} from "@/config/plans";
import { whatsappUrl } from "@/config/contact";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { useSubscriptionBillingStore } from "@/stores/subscription-billing.store";
import type { BillingStatus } from "@/services/subscription-billing.service";
import { useSearchParam, stripSearchParams } from "@/lib/useUrlState";
import { formatLongDate, planValidity, type PlanValidity } from "@/lib/planValidity";

export default function SubscriptionPage() {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const plans = useSubscriptionStore((s) => s.plans);
  const periods = useSubscriptionStore((s) => s.periods);
  const loading = useSubscriptionStore((s) => s.loading);
  const error = useSubscriptionStore((s) => s.error);
  const fetchAll = useSubscriptionStore((s) => s.fetchAll);

  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  const billing = useSubscriptionBillingStore((s) => s.billing);
  const loadBilling = useSubscriptionBillingStore((s) => s.loadBilling);
  const claim = useSubscriptionBillingStore((s) => s.claim);
  const setRecurring = useSubscriptionBillingStore((s) => s.setRecurring);
  const billingBusy = useSubscriptionBillingStore((s) => s.submitting);
  const billingError = useSubscriptionBillingStore((s) => s.error);

  const currency = settings?.currency ?? "COP";
  const businessName = settings?.business_profile?.businessName?.trim() || "";

  const [payPeriod, setPayPeriod] = useState<PlanPeriod | null>(null);
  const [payPlanName, setPayPlanName] = useState("");

  useEffect(() => {
    fetchAll();
    if (!settings) fetchSettings();
  }, [fetchAll, fetchSettings, settings]);

  /**
   * Red de seguridad del pago hecho como invitado. Corre siempre porque alguien
   * pudo pagar en la landing sin sesión y entrar después por su cuenta; es
   * idempotente, así que si no hay nada que reclamar no hace nada. Sólo se
   * recarga el plan cuando efectivamente activó algo.
   */
  useEffect(() => {
    void claim().then((activated) => {
      if (activated > 0) fetchAll();
    });
    void loadBilling();
  }, [claim, fetchAll, loadBilling]);

  /** Vuelta del checkout: `?pay=<orderId>` reabre el modal en modo polling. */
  const returningOrderId = useSearchParam("pay");
  const [dismissedReturn, setDismissedReturn] = useState(false);
  const payOrderId = dismissedReturn ? null : returningOrderId;

  const closeModal = () => {
    setPayPeriod(null);
    setPayPlanName("");
    setDismissedReturn(true);
    stripSearchParams("pay", "paid");
  };

  const openPayment = (planName: string, selectedPeriod: PlanPeriod) => {
    setPayPlanName(planName);
    setPayPeriod(selectedPeriod);
    setDismissedReturn(true);
    stripSearchParams("pay", "paid");
  };

  const handlePaid = () => {
    fetchAll();
    void loadBilling();
  };

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

      {(error || billingError) && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error ?? billingError}
        </div>
      )}

      {loading && !subscription ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando tu plan…</p>
      ) : subscription ? (
        <>
          <CurrentPlanCard
            subscription={subscription}
            periods={periods.filter((p) => p.plan_id === subscription.plan_id && p.is_active)}
            currency={currency}
            signature={signature}
            billing={billing}
            onPay={(p) => openPayment(subscription.plan_name, p)}
          />

          {billing && (
            <BillingCard
              billing={billing}
              currency={currency}
              busy={billingBusy}
              onToggleRecurring={(enabled) => void setRecurring(enabled).catch(() => {})}
            />
          )}

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
                  onPay={(per) => openPayment(p.name, per)}
                />
              ))}
          </div>
          <p className="text-xs text-on-surface-variant mt-6 text-center">
            Cambiá o renová tu plan pagando acá con Nequi, PSE, tarjeta o
            efectivo. El cambio queda activo en el momento.
          </p>
        </>
      ) : null}

      {(payPeriod || payOrderId) && (
        <PaymentModal
          key={payPeriod?.id ?? payOrderId ?? "pay"}
          open
          period={payPeriod}
          planName={payPlanName}
          initialOrderId={payPeriod ? null : payOrderId}
          onClose={closeModal}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}

function CurrentPlanCard({
  subscription,
  periods,
  currency,
  signature,
  billing,
  onPay,
}: {
  subscription: NonNullable<ReturnType<typeof useSubscriptionStore.getState>["subscription"]>;
  periods: PlanPeriod[];
  currency: string;
  signature: string;
  billing: BillingStatus | null;
  onPay: (period: PlanPeriod) => void;
}) {
  const accent = planAccent(subscription.plan_id);
  const statusLabel = SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status;
  /** El plan Gratis no se cobra: no hay nada que renovar. */
  const canPayOnline = subscription.price > 0;
  const mensual = periods.find((p) => p.months === 1) ?? periods[0];
  /**
   * La vigencia es lo primero que se busca después de pagar, así que vive acá
   * arriba y no escondida en la tarjeta de cobro. El inicio del periodo sale del
   * último cobro: sirve para la barra de avance y, si falta, la barra no se
   * dibuja.
   */
  const validity = canPayOnline
    ? planValidity(
        billing?.currentPeriodEnd,
        billing?.lastChargeAt ?? billing?.lastPayment?.paidAt ?? null,
      )
    : null;
  const expiringSoon = validity != null && validity.tone !== "ok";

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-6">
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

      {validity && (
        <ValidityStrip
          validity={validity}
          recurring={Boolean(billing?.recurring)}
        />
      )}

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
          {!canPayOnline
            ? "¿Necesitás ayuda con tu cuenta? Escribinos y te atendemos."
            : validity?.tone === "expired"
              ? "Renovalo ahora y recuperás el acceso completo en el momento."
              : expiringSoon
                ? "Renovalo ahora y los días que te quedan se suman al nuevo periodo."
                : "Renová tu plan en línea con Nequi, PSE, tarjeta o efectivo."}
        </p>
        {/* WhatsApp quedó SOLO para soporte: la renovación se paga acá. */}
        <div className="flex flex-wrap gap-3 shrink-0">
          {canPayOnline && mensual && (
            <button
              onClick={() => onPay(mensual)}
              className={`inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap text-white shadow-lg ${
                validity?.tone === "expired" || validity?.tone === "urgent"
                  ? "bg-error hover:bg-error/90 shadow-error/20"
                  : "bg-primary hover:bg-primary-dim shadow-primary/20"
              }`}
            >
              {validity?.tone === "expired" ? "Reactivar mi plan" : "Renovar en línea"}
            </button>
          )}
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

/**
 * Paleta de la vigencia. Un solo lugar decide el color: la urgencia se calcula
 * en `planValidity` y acá sólo se pinta, así que el texto y el fondo nunca
 * pueden contar cosas distintas.
 */
const VALIDITY_TONES = {
  ok: {
    box: "bg-surface-container-low border-outline-variant/20",
    icon: "text-primary",
    chip: "bg-[#10b981]/15 text-[#10b981]",
    bar: "bg-primary",
  },
  soon: {
    box: "bg-amber-500/10 border-amber-500/25",
    icon: "text-amber-500",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  urgent: {
    box: "bg-error-container/20 border-error-container/30",
    icon: "text-error",
    chip: "bg-error-container/30 text-error-dim",
    bar: "bg-error",
  },
  expired: {
    box: "bg-error-container/20 border-error-container/30",
    icon: "text-error",
    chip: "bg-error-container/30 text-error-dim",
    bar: "bg-error",
  },
} as const;

/**
 * Vigencia del plan en el encabezado: hasta cuándo está pago, cuánto falta y
 * si se renueva solo. Es la respuesta a "pagué, ¿hasta cuándo tengo?", así que
 * va antes que el consumo del mes.
 */
function ValidityStrip({
  validity,
  recurring,
}: {
  validity: PlanValidity;
  recurring: boolean;
}) {
  const tone = VALIDITY_TONES[validity.tone];

  return (
    <div className={`mb-8 rounded-2xl border px-4 py-4 sm:px-5 ${tone.box}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <CalendarIcon className={`w-5 h-5 shrink-0 mt-0.5 ${tone.icon}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              {validity.headline}
            </p>
            <p className="text-base sm:text-lg font-bold text-on-surface mt-0.5 break-words">
              {validity.dateLabel}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${tone.chip}`}
        >
          {validity.remainingLabel}
        </span>
      </div>

      {/* La barra necesita saber cuándo arrancó el periodo; sin ese dato no se
          dibuja en lugar de inventar un largo. */}
      {validity.progress != null && validity.tone !== "expired" && (
        <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden mt-3">
          <div
            className={`h-full rounded-full transition-all ${tone.bar}`}
            style={{ width: `${Math.max(validity.progress, 3)}%` }}
          />
        </div>
      )}

      <p className="text-[13px] text-on-surface-variant leading-relaxed mt-3">
        {validity.tone === "expired"
          ? "Tu plan venció. Renovalo para volver a usar todas las funciones."
          : recurring
            ? "Se renueva solo ese día con tu medio de pago guardado. No tenés que hacer nada."
            : validity.daysLeft === 0
              ? "Vence hoy: renovalo para no quedarte sin acceso mañana."
              : "Después de esa fecha se corta el acceso. Si renovás antes, los días que te quedan se suman al nuevo periodo."}
      </p>
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3v3m8-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}

/**
 * Estado del cobro automático: cuándo se cobra, con qué se pagó la última vez y
 * el botón de baja.
 *
 * El cobro recurrente lo inicia el comercio, así que "dar de baja"
 * es dejar de cobrar: el plan sigue vivo hasta el fin del periodo ya pagado, y
 * eso es justo lo que dice el texto para que nadie crea que pierde los días que
 * pagó.
 */
function BillingCard({
  billing,
  currency,
  busy,
  onToggleRecurring,
}: {
  billing: BillingStatus;
  currency: string;
  busy: boolean;
  onToggleRecurring: (enabled: boolean) => void;
}) {
  const methodLabel = paymentMethodLabel(billing.lastPayment?.methodType);

  return (
    <div className="mt-6 bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            Cobro automático
          </p>
          <p className="text-lg font-bold text-on-surface">
            {billing.recurring ? "Activo" : "Desactivado"}
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
            billing.recurring
              ? "bg-[#10b981]/15 text-[#10b981]"
              : "bg-surface-container-high text-on-surface-variant"
          }`}
        >
          {billing.recurring ? "Se renueva solo" : "Renovación manual"}
        </span>
      </div>

      {billing.error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-5">
          {billing.error}
        </div>
      )}

      {/* La fecha de vencimiento ya se muestra arriba, en el plan actual: acá
          sólo va el próximo COBRO, que es otra cosa y sólo existe con la
          renovación activa. */}
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        {billing.recurring && (
          <div>
            <dt className="text-on-surface-variant mb-0.5">Próximo cobro</dt>
            <dd className="font-semibold text-on-surface">
              {formatLongDate(billing.nextChargeAt)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-on-surface-variant mb-0.5">Último pago</dt>
          <dd className="font-semibold text-on-surface">
            {billing.lastPayment
              ? `${formatMoney(billing.lastPayment.amount, currency)} · ${formatLongDate(billing.lastPayment.paidAt)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-on-surface-variant mb-0.5">Medio de pago</dt>
          <dd className="font-semibold text-on-surface">{methodLabel}</dd>
        </div>
      </dl>

      <div className="mt-6 pt-5 border-t border-outline-variant/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[13px] text-on-surface-variant leading-relaxed">
          {billing.recurring
            ? "Si das de baja, tu plan sigue activo hasta la fecha de vencimiento y después no se renueva."
            : billing.hasSavedMethod
              ? "Podés volver a activar la renovación automática con el mismo medio de pago."
              : "Pagá una vez en línea y la renovación automática queda disponible."}
        </p>
        {(billing.recurring || billing.hasSavedMethod) && (
          <button
            onClick={() => onToggleRecurring(!billing.recurring)}
            disabled={busy}
            className={`shrink-0 inline-flex items-center justify-center py-2.5 px-5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-50 ${
              billing.recurring
                ? "border border-outline-variant/20 text-on-surface hover:bg-surface-container-high"
                : "bg-primary text-white hover:bg-primary-dim"
            }`}
          >
            {busy
              ? "Guardando…"
              : billing.recurring
                ? "Dar de baja la renovación"
                : "Activar renovación"}
          </button>
        )}
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
  onPay,
}: {
  plan: Plan;
  periods: PlanPeriod[];
  currency: string;
  current: boolean;
  onPay: (period: PlanPeriod) => void;
}) {
  const accent = planAccent(plan.id);
  /** Tiempos de más de un mes: son la oferta de ahorro del plan. */
  const longer = periods.filter((p) => p.months > 1);
  const mensual = periods.find((p) => p.months === 1) ?? periods[0];
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

      {/* Contratar y renovar se hace SIEMPRE en el checkout; WhatsApp quedó
          solo para soporte. Sin periodo mensual activo no hay nada que cobrar. */}
      {plan.price > 0 && mensual && (
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => onPay(mensual)}
            className={`inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap ${
              current
                ? "border border-outline-variant/20 text-on-surface hover:bg-surface-container-high"
                : "bg-primary text-white hover:bg-primary-dim shadow-lg shadow-primary/20"
            }`}
          >
            {current ? "Renovar" : `Pagar ${mensual.name.toLowerCase()}`}
          </button>
          {/* Un botón por tiempo largo: pago único con descuento. */}
          {longer.map((p) => (
            <button
              key={p.id}
              onClick={() => onPay(p)}
              className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap border border-outline-variant/20 text-on-surface hover:bg-surface-container-high"
            >
              Pagar {p.name.toLowerCase()} · {formatMoney(p.price, currency)}
            </button>
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
