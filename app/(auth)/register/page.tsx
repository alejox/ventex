"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useSearchParam } from "@/lib/useUrlState";
import { GoogleButton } from "@/components/GoogleButton";
import { whatsappUrl } from "@/config/contact";
import { resendSignupEmail, signup, type SignupState } from "@/utils/supabase/actions";
import { defaultModulesForType, type BusinessType, type Modules } from "@/config/business";
import { BusinessTypeCards, ModulePicker } from "@/components/onboarding/BusinessTypeCards";
import { onboardingPath, sanitizeMonths, sanitizePlanId } from "@/lib/signup-intent";

/** Segundos entre reenvíos del correo de confirmación. */
const RESEND_COOLDOWN_S = 60;
const MIN_PASSWORD = 6;

/**
 * Registro en DOS pasos (B8): qué negocio tienes → correo y contraseña.
 *
 * El nombre del negocio, el tuyo y el teléfono ya no se piden acá: los pide el
 * `OnboardingModal` al entrar por primera vez, que es el mismo paso que ya
 * hacía quien se registra con Google. Así los dos caminos terminan igual, y el
 * rubro y los módulos elegidos acá viajan en el enlace de vuelta para que el
 * modal los traiga precargados (ver `lib/signup-intent.ts`).
 */
export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1);
  // Sin preselección silenciosa: el usuario debe tocar su tarjeta antes de
  // continuar. El tipo de negocio es obligatorio.
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [modules, setModules] = useState<Modules>(defaultModulesForType(null));

  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Controlado: React 19 resetea el `<form action>` al terminar la acción y los
  // inputs no controlados volvían vacíos tras un error del servidor.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signup, {
    success: false,
    error: null,
  });
  /** Envío que el usuario descartó con "¿Escribiste mal tu correo? Volver". */
  const [dismissedSentAt, setDismissedSentAt] = useState<number | null>(null);

  /**
   * Vuelta del checkout de invitado (`?paid=1&email=`): el pago ya está
   * acreditado y esperando atado a ese correo. Se precarga el campo para que la
   * cuenta se cree con el MISMO correo, que es lo que después le permite a
   * `claim_guest_orders` reconocer el pago como de este usuario.
   */
  const paidCheckout = useSearchParam("paid") === "1";
  const paidEmail = useSearchParam("email");
  const email = emailInput ?? paidEmail ?? "";

  /**
   * "Empezar con {plan}" de la landing (B14): se registra primero y, al terminar
   * el onboarding, va derecho al checkout de ese plan. El nombre solo se usa
   * para el aviso; el id es lo que viaja y se valida.
   */
  const plan = sanitizePlanId(useSearchParam("plan"));
  const months = sanitizeMonths(useSearchParam("meses"));
  const planName = (useSearchParam("nombre") ?? "").slice(0, 30);

  const next = onboardingPath({
    businessType: businessType || null,
    modules,
    plan,
    months,
  });

  const selectBusinessType = (type: BusinessType) => {
    setBusinessType(type);
    setModules(defaultModulesForType(type));
  };

  const showConfirmation =
    state.success && state.sentAt !== undefined && state.sentAt !== dismissedSentAt;

  if (showConfirmation) {
    return (
      <CheckEmail
        email={state.email ?? email}
        next={state.next ?? next}
        key={state.sentAt}
        onBack={() => setDismissedSentAt(state.sentAt ?? null)}
      />
    );
  }

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {paidCheckout && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5">
          <p className="text-[13px] font-bold text-primary mb-1">
            ¡Tu pago ya está confirmado!
          </p>
          <p className="text-[12px] text-on-surface-variant leading-relaxed">
            Completa tu registro con{" "}
            <strong className="text-on-surface">{email || "el mismo correo del pago"}</strong>{" "}
            y tu plan queda activo al confirmar la cuenta. Si usas otro correo,
            escríbenos y lo movemos.
          </p>
        </div>
      )}

      {plan && !paidCheckout && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5">
          <p className="text-[13px] font-bold text-primary mb-1">
            {planName ? `Elegiste el plan ${planName}` : "Elegiste un plan de pago"}
          </p>
          <p className="text-[12px] text-on-surface-variant leading-relaxed">
            Crea tu cuenta y, apenas termines de configurar tu negocio, te llevamos
            al pago de ese plan.
          </p>
        </div>
      )}

      {/* Volver: en el primer paso sale al login; en el segundo retrocede. */}
      <div className="mb-6">
        {step === 1 ? (
          <Link
            href="/login"
            className="inline-flex items-center gap-2 h-10 -ml-2 px-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <BackArrow />
            Volver al inicio de sesión
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-2 h-10 -ml-2 px-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <BackArrow />
            Atrás
          </button>
        )}
      </div>

      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-8">
            <h2 className="text-[28px] font-bold text-on-surface mb-2 tracking-tight">
              ¿Qué negocio tienes?
            </h2>
            <p className="text-on-surface-variant text-[15px]">
              Así preparamos tu panel con las herramientas que necesitas.
            </p>
          </div>

          <div className="mb-8">
            <BusinessTypeCards value={businessType} onChange={selectBusinessType} />
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!businessType}
            className="w-full bg-primary hover:bg-primary-dim disabled:bg-surface-container-high disabled:text-on-surface-variant/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)] flex justify-center items-center gap-2"
          >
            Continuar
          </button>
          {!businessType && (
            <p className="mt-2 text-center text-[12px] text-on-surface-variant">
              Elige un tipo de negocio para continuar.
            </p>
          )}

          <div className="mt-6 flex flex-col items-center">
            <span className="text-[13px] text-on-surface-variant font-medium mb-4">
              Paso 1 de 2: Tu negocio
            </span>
            {/* En pestaña nueva a propósito: navegar fuera para leer un
                documento legal le borraría al visitante lo que ya eligió. */}
            <div className="flex gap-4 text-[12px] text-on-surface-variant/70">
              <Link href="/terminos" target="_blank" rel="noreferrer" className="hover:text-on-surface transition-colors">Términos y Condiciones</Link>
              <Link href="/privacidad" target="_blank" rel="noreferrer" className="hover:text-on-surface transition-colors">Privacidad</Link>
              <a
                href={whatsappUrl("Hola, necesito ayuda para registrarme en Ventex.")}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-on-surface transition-colors"
              >
                Ayuda
              </a>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="text-center lg:text-left mb-6">
            <h2 className="text-[28px] font-bold text-on-surface mb-2 tracking-tight">
              Crea tu cuenta
            </h2>
            <p className="text-on-surface-variant text-[15px]">
              Solo tu correo y una contraseña. El nombre de tu negocio lo pones al entrar.
            </p>
          </div>

          <div className="mb-6">
            <ModulePicker
              businessType={businessType}
              modules={modules}
              onChange={setModules}
              idPrefix="reg"
            />
          </div>

          <div className="mb-6">
            {/* Google conserva el rubro, los módulos y el plan: van en `next`. */}
            <GoogleButton label="Registrarme con Google" next={next} />
            <div className="flex items-center gap-3 mt-6">
              <div className="h-px flex-1 bg-outline-variant/20" />
              <span className="text-[12px] text-on-surface-variant">o con tu correo</span>
              <div className="h-px flex-1 bg-outline-variant/20" />
            </div>
          </div>

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="business_type" value={businessType} />
            <input type="hidden" name="modules" value={JSON.stringify(modules)} />
            {plan && <input type="hidden" name="plan" value={plan} />}
            {months && <input type="hidden" name="months" value={months} />}
            {state.error && (
              <div
                role="alert"
                className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30"
              >
                {state.error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="reg-email" className="text-[13px] font-semibold text-on-surface block">
                Correo electrónico
              </label>
              <div className="relative">
                <input
                  id="reg-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="nombre@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  required
                />
                <svg aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
                  <polyline points="3 7 12 13 21 7" />
                </svg>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="text-[13px] font-semibold text-on-surface block">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="reg-password-hint"
                  aria-invalid={passwordTooShort || undefined}
                  className={`w-full bg-surface-container-lowest border rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:ring-1 transition-all placeholder:text-on-surface-variant/50 ${
                    passwordTooShort
                      ? "border-error/60 focus:border-error focus:ring-error"
                      : "border-outline-variant/30 focus:border-primary focus:ring-primary"
                  }`}
                  required
                  minLength={MIN_PASSWORD}
                  autoComplete="new-password"
                />
                <svg aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface transition-colors"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              {/* B19: el requisito se dice ANTES de chocar con él. */}
              <p
                id="reg-password-hint"
                className={`text-[12px] pl-1 ${passwordTooShort ? "text-error" : "text-on-surface-variant"}`}
              >
                {passwordTooShort
                  ? `Te faltan ${MIN_PASSWORD - password.length} caracteres (mínimo ${MIN_PASSWORD}).`
                  : `Mínimo ${MIN_PASSWORD} caracteres. Usa el ojo para revisarla.`}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1 pb-2">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    // React no sincroniza `defaultChecked` de un checkbox
                    // controlado: el reset del form lo desmarcaría. Se espeja a
                    // mano para que el reset lo conserve.
                    e.currentTarget.defaultChecked = e.currentTarget.checked;
                    setAcceptedTerms(e.currentTarget.checked);
                  }}
                  required
                  className="peer appearance-none w-4 h-4 border border-outline-variant/40 rounded bg-surface-container-lowest checked:bg-primary checked:border-primary transition-colors cursor-pointer"
                />
                <svg aria-hidden className="absolute w-3 h-3 left-0.5 top-0.5 text-on-primary pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <label htmlFor="terms" className="text-[12px] text-on-surface-variant cursor-pointer select-none">
                Acepto los{" "}
                <Link href="/terminos" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link href="/privacidad" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Política de Privacidad
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-primary hover:bg-primary-dim disabled:bg-primary/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)] flex justify-center items-center gap-2"
            >
              {pending ? (
                <Spinner />
              ) : (
                <>
                  Crear mi cuenta
                  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
            <div className="mt-4 flex flex-col items-center">
              <span className="text-[13px] text-on-surface-variant font-medium">
                Paso 2 de 2: Tu cuenta
              </span>
            </div>
          </form>

          <div className="mt-8 text-center text-[13px] text-on-surface-variant">
            ¿Ya tienes una cuenta?{" "}
            <Link
              href="/login"
              className="text-primary font-semibold hover:text-primary-dim transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Revisa tu correo" (B13): reenviar con cooldown y volver a corregir el correo
 * sin perder lo elegido (el formulario sigue montado en el padre con su estado).
 */
function CheckEmail({
  email,
  next,
  onBack,
}: {
  email: string;
  next: string;
  onBack: () => void;
}) {
  // El cooldown corre con el reloj de ESTE navegador: `sentAt` lo marca el
  // servidor y un desfase de reloj alargaría o anularía la espera.
  const [lastSentAt, setLastSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(lastSentAt);
  const [resending, startResend] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const remaining = Math.max(0, Math.ceil((lastSentAt + RESEND_COOLDOWN_S * 1000 - now) / 1000));

  // Reloj del cooldown. El `setNow` corre en el callback del intervalo, no en
  // el cuerpo del efecto, así que no hay render en cascada.
  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [remaining]);

  const resend = () => {
    setFeedback(null);
    startResend(async () => {
      const result = await resendSignupEmail(email, next);
      const sent = Date.now();
      if (result.ok) {
        setLastSentAt(sent);
        setFeedback({ ok: true, text: "Te enviamos un correo nuevo." });
      } else {
        setFeedback({ ok: false, text: result.error ?? "No pudimos reenviar el correo." });
      }
      setNow(sent);
    });
  };

  return (
    <div className="w-full max-w-[420px] mx-auto text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
        {/* Sobre: dice "correo" de un vistazo (antes era un pulso). */}
        <svg aria-hidden className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </div>
      <h2 className="text-[28px] font-bold text-on-surface mb-2">Revisa tu correo</h2>
      <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
        Te enviamos un enlace de confirmación a{" "}
        <strong className="text-on-surface break-all">{email}</strong>. Ábrelo para
        activar tu cuenta y terminar de configurar tu negocio.
      </p>

      <div className="bg-surface-container-low rounded-xl p-4 mb-6 text-left">
        <p className="text-xs text-on-surface-variant font-medium mb-2">¿No encuentras el correo?</p>
        <ul className="text-xs text-on-surface-variant space-y-1.5 list-disc list-inside">
          <li>Revisa tu carpeta de spam o correo no deseado.</li>
          <li>Puede tardar uno o dos minutos en llegar.</li>
        </ul>
      </div>

      <button
        type="button"
        onClick={resend}
        disabled={resending || remaining > 0}
        className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-3 text-[15px] font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
      >
        {resending
          ? "Reenviando…"
          : remaining > 0
            ? `Reenviar correo (${remaining} s)`
            : "Reenviar correo"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-[1.25rem] text-[12px] ${feedback && !feedback.ok ? "text-error" : "text-on-surface-variant"}`}
      >
        {feedback?.text ?? ""}
      </p>

      <p className="mt-4 text-[13px] text-on-surface-variant">
        ¿Escribiste mal tu correo?{" "}
        <button
          type="button"
          onClick={onBack}
          className="font-semibold text-primary hover:underline"
        >
          Volver
        </button>
      </p>

      <Link
        href="/login"
        className="mt-6 inline-block text-[13px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
      >
        Ir a iniciar sesión
      </Link>
    </div>
  );
}

function BackArrow() {
  return (
    <svg aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg aria-hidden fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
    </svg>
  ) : (
    <svg aria-hidden fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
