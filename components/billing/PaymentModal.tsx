"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSubscriptionBillingStore } from "@/stores/subscription-billing.store";
import { formatMoney } from "@/config/plans";
import { formatLongDate } from "@/lib/planValidity";
import type { PlanPeriod } from "@/services/subscription.service";

/**
 * Checkout de suscripción con dLocal Go.
 *
 * El checkout es HOSTEADO: acá sólo se piden los datos del titular (y el correo
 * si es un invitado de la landing) y se redirige a dLocal, donde el pagador
 * elige Nequi, PSE, tarjeta o efectivo. Ningún dato de tarjeta pasa por Ventex,
 * así que no hay Smart Fields ni superficie PCI.
 *
 * Al volver, dLocal manda a `?pay=<orderId>` y el modal reabre en modo polling.
 * El polling consulta `/api/billing/orders/[id]`, que además RELEE el pago en
 * dLocal si sigue pendiente: por eso el flujo cierra aunque la notificación
 * nunca llegue.
 */

/** Clave del correo del invitado, compartida con la landing. */
export const GUEST_EMAIL_KEY = "ventex_guest_email";

const POLL_MS = 4_000;
/** ~4 min: alcanza para un Nequi/PSE aprobado en el momento. */
const MAX_POLLS = 60;

const inputClass =
  "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PaymentModal({
  open,
  onClose,
  planName,
  period = null,
  initialOrderId = null,
  guest = false,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  planName?: string;
  period?: PlanPeriod | null;
  /** Orden a retomar al volver del checkout (`?pay=`). */
  initialOrderId?: string | null;
  /** Checkout de la landing sin sesión: pide el correo y paga como invitado. */
  guest?: boolean;
  onPaid: () => void;
}) {
  const submitting = useSubscriptionBillingStore((s) => s.submitting);
  const subscribe = useSubscriptionBillingStore((s) => s.subscribe);
  const pollOrder = useSubscriptionBillingStore((s) => s.pollOrder);
  /**
   * Vigencia recién comprada. `onPaid` dispara la recarga del estado de cobro,
   * que marca `billingLoading` de forma síncrona: por eso alcanza con no pintar
   * nada mientras carga para no mostrar la fecha VIEJA durante un instante.
   */
  const periodEnd = useSubscriptionBillingStore((s) => s.billing?.currentPeriodEnd ?? null);
  const billingLoading = useSubscriptionBillingStore((s) => s.billingLoading);

  const [name, setName] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [phone, setPhone] = useState("");

  const [phase, setPhase] = useState<"form" | "redirecting" | "waiting" | "done">(
    initialOrderId ? "waiting" : "form",
  );
  const [error, setError] = useState<string | null>(null);
  /**
   * La orden a consultar es siempre la del prop; no se copia a estado. Los
   * padres montan este componente con `key`, así que cambiar de objetivo
   * (dejar de esperar una orden y arrancar un pago nuevo) lo remonta limpio en
   * lugar de dejar el `phase` y el id anteriores pegados.
   */
  const orderId = initialOrderId;
  const [guestEmail, setGuestEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(GUEST_EMAIL_KEY) ?? "";
  });
  const [guestEmailInput, setGuestEmailInput] = useState("");

  const pollsRef = useRef(0);

  const recurring = period?.months === 1;
  const total = period ? formatMoney(period.price) : "";
  const needEmailStep = guest && phase === "form" && !guestEmail.trim();
  /**
   * Invitado que vuelve en otro navegador (o borró el storage): la orden sólo se
   * puede consultar presentando el correo con el que se creó, y ese correo vive
   * en el `localStorage` donde arrancó el pago. Sin él el polling daría 403 en
   * los 60 intentos, así que no se consulta y se muestra el paso que sí sirve:
   * registrarse con ese mismo correo, que `claim_guest_orders` ata el pago solo.
   */
  const missingGuestEmail = Boolean(orderId) && guest && !guestEmail.trim();

  const storeGuestEmail = (email: string) => {
    setGuestEmail(email);
    try {
      window.localStorage.setItem(GUEST_EMAIL_KEY, email);
    } catch {
      // Modo privado o storage lleno: no es crítico, sólo se pierde la
      // comodidad de retomar el pago al volver.
    }
  };

  // ---- Polling mientras se espera la confirmación ----
  useEffect(() => {
    if (!open || phase !== "waiting" || !orderId || missingGuestEmail) return;
    pollsRef.current = 0;
    let cancelled = false;

    const tick = async () => {
      pollsRef.current += 1;
      try {
        const result = await pollOrder(orderId, guest ? guestEmail : undefined);
        if (cancelled) return;
        if (result.status === "paid") {
          setPhase("done");
          onPaid();
          return true;
        }
        if (result.status === "failed" || result.status === "cancelled") {
          setError(
            result.status === "cancelled"
              ? "El pago fue cancelado. Podés intentarlo de nuevo."
              : (result.error ?? "El pago no pudo completarse. Intentá de nuevo."),
          );
          setPhase("form");
          return true;
        }
        if (pollsRef.current >= MAX_POLLS) {
          setError(
            "El pago sigue pendiente de confirmación. Si ya lo aprobaste, esperá unos minutos y volvé a abrir esta pantalla.",
          );
          setPhase("form");
          return true;
        }
      } catch {
        // Sin red: seguir intentando hasta agotar los reintentos.
      }
      return false;
    };

    const interval = setInterval(async () => {
      if (await tick()) clearInterval(interval);
    }, POLL_MS);
    // Primera consulta inmediata: al volver del checkout el pago suele estar
    // resuelto ya, y esperar 4s se siente roto.
    void tick().then((finished) => {
      if (finished) clearInterval(interval);
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, phase, orderId, pollOrder, onPaid, guest, guestEmail, missingGuestEmail]);

  if (!open) return null;

  const validate = (): string | null => {
    if (!name.trim()) return "Ingresá el nombre del titular.";
    if (!/^\d{6,11}$/.test(docNumber.trim())) {
      return "Ingresá el documento del titular (CC o NIT, 6 a 11 dígitos).";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!period) return;
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    try {
      const result = await subscribe({
        planPeriodId: period.id,
        payer: {
          name: name.trim(),
          document: docNumber.trim(),
          ...(phone ? { phone: phone.replace(/\D/g, "") } : {}),
        },
        email: guest ? guestEmail.trim() : undefined,
      });
      setPhase("redirecting");
      window.location.href = result.redirectUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar el pago.");
    }
  };

  const title = period
    ? `Pagar ${planName ?? ""}`.trim()
    : missingGuestEmail
      ? "Tu pago quedó registrado"
      : "Confirmando tu pago";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-on-surface">{title}</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {period ? (
                <>
                  {period.name} · {total}
                  {recurring
                    ? " · se renueva automáticamente cada mes"
                    : ` · acceso por ${period.months} meses`}
                </>
              ) : missingGuestEmail ? (
                "Falta un paso para activarlo."
              ) : (
                "Estás volviendo del checkout. Esperá un momento…"
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-on-surface-variant hover:text-on-surface transition-colors p-1 -m-1"
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {phase === "done" ? (
          <SuccessState
            guest={guest}
            guestEmail={guestEmail}
            planName={planName}
            recurring={Boolean(recurring)}
            validUntil={billingLoading ? null : periodEnd}
            onClose={onClose}
          />
        ) : phase === "waiting" ? (
          missingGuestEmail ? (
            <GuestOtherDeviceState />
          ) : (
            <WaitingState onCancel={onClose} />
          )
        ) : phase === "redirecting" ? (
          <div className="text-center py-10">
            <Spinner size="lg" />
            <p className="text-sm text-on-surface-variant mt-5">
              Te estamos llevando al checkout seguro de dLocal…
            </p>
          </div>
        ) : !period ? (
          <div className="text-center py-8">
            <p className="text-sm text-on-surface-variant mb-6">
              {error ?? "Tu pago está en proceso. Se actualiza solo cuando se confirma."}
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dim transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-5">
                {error}
              </div>
            )}

            {needEmailStep ? (
              <div>
                <h3 className="text-base font-bold text-on-surface mb-1">
                  ¿A qué correo enviamos tu acceso?
                </h3>
                <p className="text-sm text-on-surface-variant mb-5 leading-relaxed">
                  Pagás ahora y enseguida creás tu cuenta con ese correo. Tu plan
                  {planName ? ` ${planName}` : ""} queda activo al registrarte.
                </p>
                <Field label="Correo electrónico" htmlFor="pay-guest-email">
                  <input
                    id="pay-guest-email"
                    type="email"
                    className={inputClass}
                    value={guestEmailInput}
                    onChange={(e) => setGuestEmailInput(e.target.value.trim())}
                    placeholder="nombre@ejemplo.com"
                    autoComplete="email"
                    required
                  />
                </Field>
                <button
                  onClick={() => {
                    if (!EMAIL_PATTERN.test(guestEmailInput.trim())) {
                      setError("Ingresá un correo válido.");
                      return;
                    }
                    setError(null);
                    storeGuestEmail(guestEmailInput.trim());
                  }}
                  className="w-full mt-6 py-3 rounded-xl bg-primary text-white font-bold transition-colors hover:bg-primary-dim"
                >
                  Continuar al pago
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <Field label="Nombre del titular" htmlFor="pay-name">
                    <input
                      id="pay-name"
                      className={inputClass}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre y apellido"
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Documento (CC o NIT)" htmlFor="pay-document">
                    <input
                      id="pay-document"
                      className={inputClass}
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="Ej: 1012345678"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Celular (opcional)" htmlFor="pay-phone">
                    <input
                      id="pay-phone"
                      className={inputClass}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Ej: 3001234567"
                      inputMode="numeric"
                      autoComplete="tel"
                    />
                  </Field>
                </div>

                <div className="mt-5 rounded-xl bg-surface-container-low border border-outline-variant/20 px-4 py-3">
                  <p className="text-[13px] text-on-surface-variant leading-relaxed">
                    En el siguiente paso elegís cómo pagar:{" "}
                    <strong className="text-on-surface">Nequi, PSE, tarjeta o efectivo</strong>.
                  </p>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full mt-5 py-3 rounded-xl bg-primary text-white font-bold transition-colors hover:bg-primary-dim disabled:bg-primary/50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Spinner /> Procesando…
                    </>
                  ) : (
                    `Continuar al pago · ${total}`
                  )}
                </button>

                {recurring && (
                  <p className="text-[11px] text-on-surface-variant mt-3 text-center leading-relaxed">
                    Se renueva cada mes por {total}. Podés dar de baja la renovación
                    cuando quieras desde tu panel.
                  </p>
                )}

                <p className="text-[11px] text-on-surface-variant mt-3 text-center leading-relaxed">
                  Pagos procesados de forma segura por dLocal Go. Los datos de tu
                  pago se comparten con dLocal.{" "}
                  <a
                    href="https://www.dlocal.com/legal/privacy-hub/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Política de privacidad
                  </a>
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SuccessState({
  guest,
  guestEmail,
  planName,
  recurring,
  validUntil,
  onClose,
}: {
  guest: boolean;
  guestEmail: string;
  planName?: string;
  recurring: boolean;
  /** Fin del periodo ya recargado. Null mientras no se pueda afirmar. */
  validUntil: string | null;
  onClose: () => void;
}) {
  return (
    <div className="text-center py-8">
      <div className="mx-auto w-14 h-14 rounded-full bg-[#10b981]/15 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" className="w-7 h-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-on-surface mb-1">¡Pago confirmado!</h3>
      {guest ? (
        <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
          Ahora creá tu cuenta con{" "}
          <strong className="text-on-surface">{guestEmail}</strong> y tu plan
          {planName ? ` ${planName}` : ""} queda activo al instante. También te
          enviamos el enlace a ese correo.
        </p>
      ) : (
        <>
          <p className={`text-sm text-on-surface-variant ${validUntil ? "mb-4" : "mb-6"}`}>
            Tu plan {planName ?? "de Ventex"} ya está activo
            {recurring ? " con renovación automática" : ""}.
          </p>
          {/* Lo primero que se quiere ver después de pagar: hasta cuándo. */}
          {validUntil && (
            <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 px-4 py-3 mb-6 text-left">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {recurring ? "Próximo cobro" : "Vigente hasta"}
              </p>
              <p className="text-base font-bold text-on-surface mt-0.5">
                {formatLongDate(validUntil)}
              </p>
            </div>
          )}
        </>
      )}
      <button
        onClick={onClose}
        className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dim transition-colors"
      >
        {guest ? "Crear mi cuenta" : "Listo"}
      </button>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-on-surface mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Invitado que volvió del checkout sin el correo del pago a mano. No se puede
 * confirmar el estado desde acá (haría falta ese correo para autorizar la
 * consulta), pero el pago está cobrado igual: registrarse con él lo reclama.
 */
function GuestOtherDeviceState() {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
        Este pago empezó en otro navegador, así que no podemos mostrar su estado
        acá. Creá tu cuenta con el mismo correo con el que pagaste y tu plan queda
        activo al instante. También te enviamos el enlace a ese correo.
      </p>
      <Link
        href="/register?paid=1"
        className="block w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dim transition-colors"
      >
        Crear mi cuenta
      </Link>
    </div>
  );
}

function WaitingState({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="text-center py-8">
      <Spinner size="lg" />
      <h3 className="text-lg font-bold text-on-surface mt-5 mb-1">
        Confirmando tu pago
      </h3>
      <p className="text-sm text-on-surface-variant leading-relaxed">
        Estamos esperando la confirmación de dLocal. Si pagaste con Nequi o PSE
        puede tardar unos segundos.
      </p>
      <button
        onClick={onCancel}
        className="text-[13px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors mt-6 py-2"
      >
        Cerrar y revisar más tarde
      </button>
    </div>
  );
}

function Spinner({ size = "md" }: { size?: "md" | "lg" }) {
  const dims = size === "lg" ? "w-12 h-12 border-4" : "w-4 h-4 border-2";
  return (
    <span
      className={`inline-block ${dims} rounded-full border-primary/30 border-t-primary animate-spin`}
      aria-hidden
    />
  );
}
