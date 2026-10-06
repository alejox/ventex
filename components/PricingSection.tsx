"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Plan, PlanPeriod } from "@/services/subscription.service";
import { collaboratorsLabel, FEATURED_PLAN_ID, formatMoney, formatSalesLimit } from "@/config/plans";
import { whatsappUrl } from "@/config/contact";
import { useSubscriptionBillingStore } from "@/stores/subscription-billing.store";
import { PaymentModal, GUEST_EMAIL_KEY } from "@/components/billing/PaymentModal";
import { useSearchParam, useStoredValue, stripSearchParams } from "@/lib/useUrlState";
import { sanitizeMonths, sanitizePlanId } from "@/lib/signup-intent";

/**
 * Precios de la landing. Los planes y sus tiempos vienen de la base, así que lo
 * que el super admin publica en /admin/plans es lo que ve el visitante.
 *
 * Es Client Component porque el visitante ELIGE la duración antes de comprar:
 * esa elección cambia los precios de todas las tarjetas.
 *
 * B14: sin sesión, el CTA principal de un plan pago es "Empezar con {plan}" →
 * `/register?plan=…`: se crea la cuenta primero y, al terminar el onboarding,
 * vuelve acá con `?plan=&meses=` y el checkout de ESE plan se abre solo. Pagar
 * como invitado queda como opción secundaria: si después se registra con otro
 * correo, el pago no se reclama solo. Con sesión, el botón abre el checkout
 * directo. La compra se cierra SIEMPRE en el checkout, nunca por WhatsApp.
 *
 * El `?pay=` con el que se vuelve del checkout se lee ACÁ, en el cliente, y no como
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

  /**
   * Vuelta del registro (`?plan=oro&meses=3`): con sesión, se abre el checkout
   * de ese plan sin que tenga que buscarlo otra vez. Derivado, no sembrado en
   * un efecto; deja de contar cuando se cierra el modal (`dismissedReturn`).
   */
  const intentPlanId = sanitizePlanId(useSearchParam("plan"));
  const intentMonths = sanitizeMonths(useSearchParam("meses")) ?? 1;
  const intentPlan =
    !dismissedReturn && checkoutAuthed === true && intentPlanId
      ? plans.find((p) => p.id === intentPlanId && Number(p.price) > 0) ?? null
      : null;
  const intentPeriod = intentPlan
    ? periods.find((p) => p.plan_id === intentPlan.id && p.months === intentMonths) ??
      periods.find((p) => p.plan_id === intentPlan.id && p.months === 1) ??
      null
    : null;

  // Lo que se muestra en el modal: un pago iniciado acá, la vuelta del checkout
  // o la vuelta del registro con un plan elegido, en ese orden.
  const modalPeriod = payPeriod ?? (payOrderId ? null : intentPeriod);
  const modalPlanName = payPeriod ? payPlanName : (intentPlan?.name ?? "");
  const modalGuest = payPeriod ? payGuest : payOrderId ? returningAsGuest : false;

  if (plans.length === 0) return null;

  /** Si la duración elegida ya no existe, se cae al mes (siempre presente). */
  const selected = options.find((o) => o.months === months) ?? options[0];

  const closeModal = () => {
    setPayPeriod(null);
    setPayPlanName("");
    setPayGuest(false);
    setDismissedReturn(true);
    stripSearchParams("pay", "plan", "meses");
  };

  /**
   * Un invitado que acaba de pagar va al registro con su correo ya cargado: al
   * completarlo, `claim_guest_orders` ata el pago a la cuenta nueva. Quien ya
   * tenía sesión va directo a ver su plan.
   */
  const handlePaid = () => {
    // `payGuest` sólo está seteado si el pago arrancó en esta pantalla; al
    // volver del checkout el modo lo dice la sesión (`returningAsGuest`).
    const asGuest = modalGuest;
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
    stripSearchParams("pay", "plan", "meses");
  };

  /** "Pagar sin cuenta": checkout de invitado, la opción secundaria (B14). */
  const startGuestPayment = (planName: string, selectedPeriod: PlanPeriod) => {
    setPayPlanName(planName);
    setPayPeriod(selectedPeriod);
    setPayGuest(true);
    setDismissedReturn(true);
    stripSearchParams("pay", "plan", "meses");
  };


  return (
    <section id="precios" className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <p className="text-sm font-bold text-accent-pos mb-3">PRECIOS</p>
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

      <div className={`grid items-stretch gap-6 ${plans.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            periods={periods.filter((p) => p.plan_id === plan.id)}
            months={selected?.months ?? 1}
            featured={plan.id === featuredId}
            authed={checkoutAuthed === true}
            onPay={(p) => void startPayment(plan.name, p)}
            onPayAsGuest={(p) => startGuestPayment(plan.name, p)}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-on-surface-variant">
        Paga con Nequi, PSE, tarjeta o efectivo, por el periodo que elijas y sin
        renovación automática: te avisamos antes del vencimiento.{" "}
        <a
          href={whatsappUrl(
            "Hola, tengo una duda sobre los planes de Ventex antes de contratar.",
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-pos font-semibold hover:underline"
        >
          ¿Dudas? Escríbenos
        </a>
        .
      </p>

      {(modalPeriod || payOrderId) && (
        <PaymentModal
          key={modalPeriod?.id ?? payOrderId ?? "pay"}
          open
          period={modalPeriod}
          planName={modalPlanName}
          initialOrderId={modalPeriod ? null : payOrderId}
          guest={modalGuest}
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
                  // Activo: el lavado `bg-on-primary/20` dejaba el blanco en 3.29:1
                  // sobre el botón. Sin fondo, el mismo blanco sube a 4.65:1.
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                    active
                      ? "text-on-primary ring-1 ring-on-primary/40"
                      : "bg-accent-fin text-background"
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
  authed,
  onPay,
  onPayAsGuest,
}: {
  plan: Plan;
  periods: PlanPeriod[];
  months: number;
  featured: boolean;
  /** Con sesión el checkout se abre directo; sin ella, primero el registro. */
  authed: boolean;
  onPay: (period: PlanPeriod) => void;
  onPayAsGuest: (period: PlanPeriod) => void;
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
              por {span} meses, en un solo pago
            </p>
            {savings > 0 && (
              <p className="mt-1 inline-block text-xs font-bold text-background bg-accent-fin rounded-md px-2 py-0.5">
                Ahorras {formatMoney(savings)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-on-surface-variant">
            {/* Sin "cancela cuando quieras": no hay nada que cancelar porque el
                cobro recurrente no existe (AGENTS.md → Subscription billing). */}
            Pago por periodo. Sin renovación automática: renuevas cuando quieras.
          </p>
        )}
      </div>

      <ul className="mt-6 space-y-3 text-sm text-on-surface-variant flex-1">
        <Feature>{collaboratorsLabel(plan.max_collaborators)}</Feature>
        <Feature>
          {plan.max_monthly_sales === null ? (
            <strong className="font-semibold text-on-surface">Ventas ilimitadas</strong>
          ) : (
            <>
              Hasta{" "}
              <strong className="font-semibold text-on-surface">
                {formatSalesLimit(plan.max_monthly_sales)}
              </strong>{" "}
              en ventas por mes
              {/* B15: decir qué pasa en el tope, no solo el número. */}
              <span className="mt-1 block text-xs leading-relaxed text-on-surface-variant">
                Al llegar al tope, el punto de venta deja de registrar ventas nuevas
                hasta el mes siguiente o hasta que subas de plan. Tus datos no se
                pierden.
              </span>
            </>
          )}
        </Feature>
        <Feature>Punto de venta, inventario, finanzas y clientes</Feature>
        <Feature>Citas, reservas online y comisiones, según tu negocio</Feature>
      </ul>

      {free ? (
        <Link
          href="/register"
          className="mt-8 block text-center px-6 py-3 rounded-xl font-bold transition-colors bg-surface-container-high border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest"
        >
          Empieza gratis
        </Link>
      ) : authed ? (
        /* Con sesión: checkout directo. La compra se cierra SIEMPRE en el
           checkout, nunca por WhatsApp (que quedó solo para soporte). */
        <button
          type="button"
          onClick={() => period && onPay(period)}
          disabled={!period}
          className={`mt-8 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors w-full disabled:opacity-50 ${ctaClass(featured)}`}
        >
          {period && span > 1 ? `Pagar ${formatMoney(total)}` : "Pagar ahora"}
        </button>
      ) : (
        /* B14: sin sesión, primero la cuenta y después el pago de ESTE plan
           (`/register?plan=` → onboarding → checkout). Pagar como invitado
           sigue disponible, pero como opción secundaria. */
        <div className="mt-8">
          <Link
            href={`/register?${new URLSearchParams({
              plan: plan.id,
              meses: String(span),
              nombre: plan.name,
            }).toString()}`}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors w-full ${ctaClass(featured)}`}
          >
            Empezar con {plan.name}
          </Link>
          <button
            type="button"
            onClick={() => period && onPayAsGuest(period)}
            disabled={!period}
            className="mt-2 w-full py-1.5 text-center text-xs font-semibold text-on-surface-variant underline-offset-2 transition-colors hover:text-on-surface hover:underline disabled:opacity-50"
          >
            {period && span > 1
              ? `O paga ${formatMoney(total)} sin cuenta y regístrate después`
              : "O paga sin cuenta y regístrate después"}
          </button>
        </div>
      )}
    </div>
  );
}

function ctaClass(featured: boolean): string {
  return featured
    ? "bg-primary text-on-primary shadow-lg shadow-primary/25 hover:bg-primary-dim"
    : "bg-surface-container-high border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest";
}

/**
 * Plan que lleva el badge «Más elegido» y el botón sólido: el que se quiere
 * empujar. Por defecto Oro (`FEATURED_PLAN_ID`); si ese plan no existe o se
 * desactiva, el de pago más caro, para que nunca quede la fila sin destaque.
 */
function findFeaturedPlan(plans: Plan[]): string | null {
  const paid = plans.filter((p) => Number(p.price) > 0);
  if (paid.length === 0) return null;
  if (paid.some((p) => p.id === FEATURED_PLAN_ID)) return FEATURED_PLAN_ID;
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

/**
 * Fila de característica. Con `excluded` muestra lo que el plan NO tiene.
 *
 * Decir el techo en voz alta ahorra la decepción de descubrirlo cobrando: todos
 * los planes traen los mismos módulos, y lo que separa a uno del siguiente son
 * los colaboradores y el tope de ventas. La X va en gris, no en rojo — es un
 * límite del plan, no un error del visitante.
 */
function Feature({ children, excluded = false }: { children: React.ReactNode; excluded?: boolean }) {
  return (
    <li className={`flex items-start gap-2.5${excluded ? " text-on-surface-variant/70" : ""}`}>
      <svg
        className={`w-4 h-4 mt-0.5 shrink-0 ${excluded ? "text-on-surface-variant" : "text-accent-fin"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
        aria-hidden
      >
        {excluded ? (
          <>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </>
        ) : (
          <polyline points="20 6 9 17 4 12" />
        )}
      </svg>
      <span>
        <span className="sr-only">{excluded ? "No incluye: " : "Incluye: "}</span>
        {children}
      </span>
    </li>
  );
}

