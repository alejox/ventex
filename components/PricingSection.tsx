"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Plan, PlanPeriod } from "@/services/subscription.service";
import { formatMoney, formatSalesLimit } from "@/config/plans";
import { whatsappUrl } from "@/config/contact";

/**
 * Precios de la landing. Los planes y sus tiempos vienen de la base, así que lo
 * que el super admin publica en /admin/plans es lo que ve el visitante.
 *
 * Es Client Component porque el visitante ELIGE la duración antes de comprar:
 * esa elección cambia los precios de todas las tarjetas y viaja dentro del
 * mensaje de WhatsApp, que es donde se cierra la venta (no hay checkout).
 */
export function PricingSection({
  plans,
  periods,
}: {
  plans: Plan[];
  periods: PlanPeriod[];
}) {
  const options = useMemo(() => buildPeriodOptions(plans, periods), [plans, periods]);
  const featuredId = useMemo(() => findFeaturedPlan(plans), [plans]);
  const [months, setMonths] = useState(1);

  if (plans.length === 0) return null;

  /** Si la duración elegida ya no existe, se cae al mes (siempre presente). */
  const selected = options.find((o) => o.months === months) ?? options[0];

  return (
    <section id="precios" className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <p className="text-sm font-bold text-primary mb-3">PRECIOS</p>
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">
          Un plan para cada etapa
        </h2>
        <p className="mt-4 text-on-surface-variant">
          Empieza gratis y crece cuando lo necesites. Paga por más tiempo y ahorra.
        </p>
      </div>

      {options.length > 1 && (
        <PeriodSwitch options={options} value={selected?.months ?? 1} onChange={setMonths} />
      )}

      <div className="grid gap-6 md:grid-cols-3 items-start">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            periods={periods.filter((p) => p.plan_id === plan.id)}
            months={selected?.months ?? 1}
            featured={plan.id === featuredId}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-on-surface-variant">
        Sin tarjeta ni pagos automáticos. Escríbenos por WhatsApp con el plan que
        elegiste y activamos tu licencia el mismo día.
      </p>
    </section>
  );
}

/** Segmentado de duración: una sola elección que reprecia todas las tarjetas. */
function PeriodSwitch({
  options,
  value,
  onChange,
}: {
  options: PeriodOption[];
  value: number;
  onChange: (months: number) => void;
}) {
  return (
    <div className="flex justify-center mb-10">
      <div
        role="group"
        aria-label="Duración del plan"
        className="inline-flex gap-1 p-1 rounded-2xl bg-surface-container-low border border-outline-variant/15"
      >
        {options.map((option) => {
          const active = option.months === value;
          return (
            <button
              key={option.months}
              type="button"
              onClick={() => onChange(option.months)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-[13px] sm:text-sm font-bold transition-colors ${
                active
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              {option.name}
              {option.discount > 0 && (
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                    active ? "bg-on-primary/20 text-on-primary" : "bg-primary/10 text-primary"
                  }`}
                >
                  −{option.discount}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  periods,
  months,
  featured,
}: {
  plan: Plan;
  periods: PlanPeriod[];
  months: number;
  featured: boolean;
}) {
  const monthlyPrice = Number(plan.price);
  const free = monthlyPrice <= 0;
  /** Tiempo elegido; si este plan no lo vende, se cobra por mes. */
  const period = periods.find((p) => p.months === months);
  const total = period ? Number(period.price) : monthlyPrice;
  const span = period?.months ?? 1;
  const perMonth = Math.round(total / span);
  const savings = monthlyPrice * span - total;

  return (
    <div
      /* En móvil el recomendado va primero: el gratis empujaba la venta bajo el pliegue. */
      className={`relative flex flex-col rounded-3xl border p-8 md:order-none ${
        featured
          ? "order-first border-primary/40 bg-surface-container shadow-lg shadow-primary/5"
          : "border-outline-variant/10 bg-surface-container-low"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-primary text-on-primary text-xs font-bold shadow-lg shadow-primary/25">
          Más elegido
        </span>
      )}

      <h3 className="text-lg font-bold text-on-surface">{plan.name}</h3>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-black tracking-tight text-on-surface">
          {free ? "Gratis" : formatMoney(perMonth)}
        </span>
        {!free && <span className="text-sm text-on-surface-variant">/mes</span>}
      </div>

      {/* Alto fijo: mantiene alineados precio, features y CTA entre tarjetas. */}
      <div className="mt-2 min-h-[3.5rem]">
        {free ? (
          <p className="text-sm text-on-surface-variant">Para siempre, sin tarjeta.</p>
        ) : span > 1 ? (
          <>
            <p className="text-sm text-on-surface-variant">
              Pagas <strong className="text-on-surface font-semibold">{formatMoney(total)}</strong>{" "}
              cada {span} meses
            </p>
            {savings > 0 && (
              <p className="mt-1 inline-block text-xs font-bold text-primary bg-primary/10 rounded-md px-2 py-0.5">
                Ahorras {formatMoney(savings)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-on-surface-variant">
            Facturación mensual. Cancela cuando quieras.
          </p>
        )}
      </div>

      <ul className="mt-6 space-y-3 text-sm text-on-surface-variant flex-1">
        <Feature>
          {plan.max_collaborators === 0
            ? "Solo tú"
            : `Hasta ${plan.max_collaborators} colaborador${plan.max_collaborators === 1 ? "" : "es"}`}
        </Feature>
        <Feature>Ventas al mes: {formatSalesLimit(plan.max_monthly_sales)}</Feature>
        <Feature>POS, inventario, finanzas y clientes</Feature>
      </ul>

      {free ? (
        <Link
          href="/register"
          className="mt-8 block text-center px-6 py-3 rounded-xl font-bold transition-colors bg-surface-container-high border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
        >
          Empieza gratis
        </Link>
      ) : (
        <a
          href={whatsappUrl(buildPurchaseMessage(plan.name, period, total, span))}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-8 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors ${
            featured
              ? "bg-primary text-on-primary shadow-lg shadow-primary/25 hover:bg-primary-dim"
              : "bg-surface-container-high border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
          }`}
        >
          <WhatsAppIcon />
          Quiero {plan.name}
        </a>
      )}
    </div>
  );
}

/**
 * El mensaje lleva plan, modalidad y precio ya redactados: quien atiende no
 * tiene que preguntar nada para recargar la licencia.
 */
function buildPurchaseMessage(
  planName: string,
  period: PlanPeriod | undefined,
  total: number,
  span: number,
): string {
  const modality = period?.name ?? "Mensual";
  const price =
    span > 1
      ? `${formatMoney(total)} por ${span} meses`
      : `${formatMoney(total)} al mes`;
  return `Hola, quiero contratar el plan ${planName} de Ventex en modalidad ${modality} (${price}). ¿Cómo activo mi cuenta?`;
}

/**
 * Plan que lleva el badge y el botón sólido: el de pago más caro, que es el
 * tope de la escalera y lo que se quiere empujar. Sale del dato, así que si en
 * /admin/plans se agrega un plan superior, el destaque se mueve solo.
 */
function findFeaturedPlan(plans: Plan[]): string | null {
  const paid = plans.filter((p) => Number(p.price) > 0);
  if (paid.length === 0) return null;
  return paid.reduce((best, p) => (Number(p.price) > Number(best.price) ? p : best)).id;
}

/** Opción del selector: agrupa por duración los tiempos de todos los planes. */
interface PeriodOption {
  months: number;
  name: string;
  /**
   * Descuento (%) que esta duración garantiza. Es el MENOR entre los planes: el
   * porcentaje del chip debe cumplirse en cualquier tarjeta, nunca prometer de
   * más en la que menos ahorra.
   */
  discount: number;
}

function buildPeriodOptions(plans: Plan[], periods: PlanPeriod[]): PeriodOption[] {
  const byMonths = new Map<number, PeriodOption>();

  for (const period of periods) {
    const plan = plans.find((p) => p.id === period.plan_id);
    if (!plan) continue;

    const fullPrice = Number(plan.price) * period.months;
    const discount =
      fullPrice > 0 ? Math.max(0, Math.round((1 - Number(period.price) / fullPrice) * 100)) : 0;

    const existing = byMonths.get(period.months);
    if (existing) {
      existing.discount = Math.min(existing.discount, discount);
    } else {
      byMonths.set(period.months, { months: period.months, name: period.name, discount });
    }
  }

  // El mes siempre es una opción, aunque ningún plan lo tenga como fila.
  if (!byMonths.has(1)) byMonths.set(1, { months: 1, name: "Mensual", discount: 0 });

  return [...byMonths.values()].sort((a, b) => a.months - b.months);
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg
        className="w-4 h-4 mt-0.5 shrink-0 text-primary"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.02h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.23 8.23 0 0 1 0 16.47z" />
    </svg>
  );
}
