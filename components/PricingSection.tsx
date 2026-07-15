import Link from "next/link";
import type { Plan, PlanPeriod } from "@/services/subscription.service";
import { formatMoney, formatSalesLimit } from "@/config/plans";
import { whatsappUrl } from "@/config/contact";

/**
 * Precios de la landing. Server Component: planes y tiempos vienen de la base,
 * así que lo que el super admin publica en /admin/plans es lo que ve el
 * visitante, sin tocar código.
 */
export function PricingSection({
  plans,
  periods,
}: {
  plans: Plan[];
  periods: PlanPeriod[];
}) {
  if (plans.length === 0) return null;

  return (
    <section id="precios" className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <p className="text-sm font-bold text-primary mb-3">PRECIOS</p>
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface">
          Un plan para cada etapa
        </h2>
        <p className="mt-4 text-on-surface-variant">
          Empieza gratis y crece cuando lo necesites. Paga por más tiempo y ahorra.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            periods={periods.filter((p) => p.plan_id === plan.id)}
          />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan, periods }: { plan: Plan; periods: PlanPeriod[] }) {
  const free = plan.price <= 0;
  /** Tiempos más largos que el mes: son la oferta de ahorro del plan. */
  const longer = periods.filter((p) => p.months > 1);

  return (
    <div
      className={`relative flex flex-col rounded-3xl border p-8 ${
        longer.length > 0
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

      {longer.length > 0 ? (
        <div className="mt-3 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2 space-y-1">
          {longer.map((p) => (
            <p key={p.id} className="text-sm text-on-surface-variant">
              <strong className="text-primary font-semibold">{p.name}</strong>:{" "}
              {formatMoney(p.price)} por {p.months} meses
            </p>
          ))}
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

      {free ? (
        <Link
          href="/register"
          className="mt-8 block text-center px-6 py-3 rounded-xl font-bold transition-colors bg-surface-container-high border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
        >
          Empieza gratis
        </Link>
      ) : (
        <a
          href={whatsappUrl(`Hola, estoy interesado en comprar el plan ${plan.name}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 block text-center px-6 py-3 rounded-xl font-bold transition-colors bg-primary text-on-primary shadow-lg shadow-primary/25 hover:bg-primary-dim"
        >
          Comprar {plan.name}
        </a>
      )}
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
