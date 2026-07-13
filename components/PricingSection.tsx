import Link from "next/link";
import type { Plan } from "@/services/subscription.service";
import {
  annualFreeMonths,
  annualPrice,
  formatMoney,
  formatSalesLimit,
  hasAnnual,
} from "@/config/plans";

/**
 * Precios de la landing. Server Component: los planes vienen de la tabla
 * `plans`, así que lo que el super admin publica en /admin/plans es lo que ve
 * el visitante, sin tocar código.
 */
export function PricingSection({ plans }: { plans: Plan[] }) {
  if (plans.length === 0) return null;

  return (
    <section id="precios" className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <p className="text-sm font-bold text-primary mb-3">PRECIOS</p>
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">
          Un plan para cada etapa
        </h2>
        <p className="mt-4 text-on-surface-variant">
          Empieza gratis y crece cuando lo necesites. Paga el año y llévate meses
          de regalo.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const free = plan.price <= 0;
  const annual = hasAnnual(plan);
  const freeMonths = annualFreeMonths(plan);

  return (
    <div
      className={`relative flex flex-col rounded-3xl border p-8 ${
        annual
          ? "border-primary/40 bg-surface-container shadow-lg shadow-primary/5"
          : "border-outline-variant/10 bg-surface-container-low"
      }`}
    >
      <h3 className="text-lg font-bold text-on-surface">{plan.name}</h3>

      <div className="mt-4">
        <span className="text-4xl font-black tracking-tight text-on-surface">
          {free ? "Gratis" : formatMoney(plan.price)}
        </span>
        {!free && <span className="text-sm text-on-surface-variant"> /mes</span>}
      </div>

      {annual ? (
        <div className="mt-3 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2">
          <p className="text-sm font-semibold text-primary">
            {formatMoney(annualPrice(plan))} al año
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Pagas {plan.annual_charged_months} meses ·{" "}
            <strong className="text-on-surface">
              {freeMonths} {freeMonths === 1 ? "mes" : "meses"} de regalo
            </strong>
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-on-surface-variant">
          {free ? "Para siempre, sin tarjeta." : "Facturación mensual."}
        </p>
      )}

      <ul className="mt-6 space-y-3 text-sm text-on-surface-variant flex-1">
        <Feature>
          {plan.max_collaborators === 0
            ? "Solo tú"
            : `Hasta ${plan.max_collaborators} colaborador${plan.max_collaborators === 1 ? "" : "es"}`}
        </Feature>
        <Feature>
          Ventas al mes: {formatSalesLimit(plan.max_monthly_sales)}
        </Feature>
        <Feature>POS, inventario, finanzas y clientes</Feature>
      </ul>

      <Link
        href="/register"
        className={`mt-8 block text-center px-6 py-3 rounded-xl font-bold transition-colors ${
          annual
            ? "bg-primary text-on-primary shadow-lg shadow-primary/25 hover:bg-primary-dim"
            : "bg-surface-container-high border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
        }`}
      >
        {free ? "Empieza gratis" : `Elegir ${plan.name}`}
      </Link>
    </div>
  );
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
