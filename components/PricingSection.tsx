"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Plan, PlanPeriod } from "@/services/subscription.service";
import { formatMoney, formatSalesLimit } from "@/config/plans";
import { whatsappUrl } from "@/config/contact";
import { useSubscriptionBillingStore } from "@/stores/subscription-billing.store";
import { PaymentModal, GUEST_EMAIL_KEY } from "@/components/billing/PaymentModal";
import { useSearchParam, useStoredValue, stripSearchParams } from "@/lib/useUrlState";

/**
 * Precios de la landing. Los planes y sus tiempos vienen de la base, así que lo
 * que el super admin publica en /admin/plans es lo que ve el visitante.
 *
 * Es Client Component porque el visitante ELIGE la duración antes de comprar:
 * esa elección cambia los precios de todas las tarjetas. Con la pasarela activa
 * el botón abre el checkout de dLocal Go; sin sesión se paga como INVITADO (se
 * pide el correo y al volver se crea la cuenta, que reclama el pago). Sin
 * pasarela configurada, la venta se cierra por WhatsApp como antes.
 *
 * El `?pay=` con el que vuelve dLocal se lee ACÁ, en el cliente, y no como
 * `searchParams` de la página: leerlo en el server convertía la landing en
 * dinámica y anulaba su `revalidate = 300`.
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

  const checkoutAuthed = useSubscriptionBillingStore((s) => s.checkoutAuthed);
  const checkAuth = useSubscriptionBillingStore((s) => s.checkAuth);
  const [payPeriod, setPayPeriod] = useState<PlanPeriod | null>(null);
  const [payPlanName, setPayPlanName] = useState("");
  const [payGuest, setPayGuest] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Vuelta del checkout: `?pay=<orderId>` reabre el modal en modo polling.
   * El id se toma de la URL (no de un estado sembrado en un efecto) y sólo deja
   * de contar cuando el usuario cierra el modal — así refrescar la pantalla no
   * lo reabre y no hay render en cascada al montar.
   */
  const returningOrderId = useSearchParam("pay");
  const storedGuestEmail = useStoredValue(GUEST_EMAIL_KEY);
  const [dismissedReturn, setDismissedReturn] = useState(false);
  /**
   * El modo de la vuelta lo decide la SESIÓN, no el correo guardado en este
   * navegador: ese valor sobrevive al registro, así que un dueño con sesión que
   * pagaba desde la landing volvía marcado como invitado y terminaba en
   * `/register` en vez de en su panel, con su plan ya activo. El correo guardado
   * sólo sirve como credencial para consultar la orden de un invitado.
   */
  const returningAsGuest = checkoutAuthed === false;
  // Hasta saber si hay sesión no se abre el polling: consultar con la identidad
  // equivocada da un 403 seguro y le muestra el texto del invitado a un dueño.
  const payOrderId = dismissedReturn || checkoutAuthed === null ? null : returningOrderId;

  if (plans.length === 0) return null;

  /** Si la duración elegida ya no existe, se cae al mes (siempre presente). */
  const selected = options.find((o) => o.months === months) ?? options[0];

  const closeModal = () => {
    setPayPeriod(null);
    setPayPlanName("");
    setPayGuest(false);
    setDismissedReturn(true);
    stripSearchParams("pay");
  };

  /**
   * Un invitado que acaba de pagar va al registro con su correo ya cargado: al
   * completarlo, `claim_guest_orders` ata el pago a la cuenta nueva. Quien ya
   * tenía sesión va directo a ver su plan.
   */
  const handlePaid = () => {
    // `payGuest` sólo está seteado si el pago arrancó en esta pantalla; al
    // volver del checkout el modo lo dice la sesión (`returningAsGuest`).
    const asGuest = payPeriod ? payGuest : returningAsGuest;
    if (!asGuest) {
      window.location.href = "/dashboard/subscription";
      return;
    }
    window.location.href = storedGuestEmail
      ? `/register?paid=1&email=${encodeURIComponent(storedGuestEmail)}`
      : "/register?paid=1";
  };

  /**
   * Abre el checkout. Si todavía no sabemos si hay sesión (`null`), se resuelve
   * antes de decidir: abrirlo asumiendo "con sesión" haría que un anónimo saltee
   * el paso del correo y el pago se rechace por falta de correo.
   */
  const startPayment = async (planName: string, selectedPeriod: PlanPeriod) => {
    let authed = checkoutAuthed;
    if (authed === null) {
      await checkAuth();
      authed = useSubscriptionBillingStore.getState().checkoutAuthed;
    }
    setPayPlanName(planName);
    setPayPeriod(selectedPeriod);
    setPayGuest(authed !== true);
    // Un pago nuevo tiene prioridad sobre un `?pay=` viejo que siguiera en la URL.
    setDismissedReturn(true);
    stripSearchParams("pay");
  };

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
            onPay={(p) => void startPayment(plan.name, p)}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-on-surface-variant">
        Paga con Nequi, PSE, tarjeta o efectivo. ¿Todavía no tienes cuenta? Paga
        primero y la creas enseguida con el mismo correo.{" "}
        <a
          href={whatsappUrl(
            "Hola, tengo una duda sobre los planes de Ventex antes de contratar.",
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-semibold hover:underline"
        >
          ¿Dudas? Escríbenos
        </a>
        .
      </p>

      {(payPeriod || payOrderId) && (
        <PaymentModal
          key={payPeriod?.id ?? payOrderId ?? "pay"}
          open
          period={payPeriod}
          planName={payPlanName}
          initialOrderId={payPeriod ? null : payOrderId}
          guest={payPeriod ? payGuest : returningAsGuest}
          onClose={closeModal}
          onPaid={handlePaid}
        />
      )}
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
  onPay,
}: {
  plan: Plan;
  periods: PlanPeriod[];
  months: number;
  featured: boolean;
  onPay: (period: PlanPeriod) => void;
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
        /* La compra se cierra SIEMPRE en el checkout, nunca por WhatsApp (que
           quedó solo para soporte). Sin sesión también se puede pagar: el modal
           pide el correo y la cuenta se crea después. */
        <button
          onClick={() => period && onPay(period)}
          disabled={!period}
          className={`mt-8 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors w-full disabled:opacity-50 ${
            featured
              ? "bg-primary text-on-primary shadow-lg shadow-primary/25 hover:bg-primary-dim"
              : "bg-surface-container-high border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
          }`}
        >
          {period && span > 1 ? `Pagar ${formatMoney(total)}` : "Pagar ahora"}
        </button>
      )}
    </div>
  );
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

