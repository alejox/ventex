"use client";

import { useState } from "react";
import { RocketIcon } from "@/app/assets/icons/BusinessIcons";
import {
  defaultModulesForType,
  REGISTER_BUSINESS_OPTIONS,
  type BusinessType,
  type Modules,
} from "@/config/business";
import { signout } from "@/utils/supabase/actions";
import { useSearchParam } from "@/lib/useUrlState";
import { sanitizeBusinessType, sanitizeMonths, sanitizeModules, sanitizePlanId } from "@/lib/signup-intent";
import { businessNamePlaceholder } from "@/components/LandingBusinessCopy";
import { BusinessTypeCards, ModulePicker } from "./BusinessTypeCards";
import { completeOnboarding } from "./actions";

/**
 * Modal bloqueante del primer ingreso de un dueño: lo ven TODOS los dueños
 * nuevos, entren por Google o por correo (el registro por correo ya no pide
 * nombre del negocio, nombre ni teléfono — B8).
 *
 * Lo ya elegido en el registro (rubro, módulos y plan) llega en la query de la
 * URL (`?rubro=&modulos=&plan=&meses=`, ver `lib/signup-intent.ts`) y se
 * precarga: con rubro conocido el modal arranca directo en el paso del nombre
 * (B5). Si la URL no trae nada —entró con Google desde el login, o abrió un
 * enlace viejo— pregunta el rubro como siempre.
 *
 * No se puede cerrar (sin backdrop clickeable, sin Escape): sin tipo de negocio
 * el dashboard no sabe qué mostrar. La única salida es completarlo o cerrar
 * sesión.
 */
export function OnboardingModal({ defaultName }: { defaultName: string }) {
  // Lo que trae la URL. `null` durante el render del servidor; el valor real
  // entra al hidratar (useSyncExternalStore), sin efectos ni renders extra.
  const intentType = sanitizeBusinessType(useSearchParam("rubro"));
  const intentModulesRaw = useSearchParam("modulos");
  const plan = sanitizePlanId(useSearchParam("plan"));
  const months = sanitizeMonths(useSearchParam("meses"));

  /**
   * Elecciones del usuario EN el modal. `null` = no tocó nada todavía y manda lo
   * que vino en la URL. Derivar en vez de copiar la URL a estado evita el
   * `setState` en un efecto y que la hidratación pise lo que el usuario cambió.
   */
  const [stepChoice, setStepChoice] = useState<1 | 2 | null>(null);
  const [typeChoice, setTypeChoice] = useState<BusinessType | null>(null);
  const [modulesChoice, setModulesChoice] = useState<Modules | null>(null);

  const businessType: BusinessType | "" = typeChoice ?? intentType ?? "";
  const step = stepChoice ?? (intentType ? 2 : 1);
  const modules: Modules =
    modulesChoice ??
    (typeChoice === null && intentType && intentModulesRaw !== null
      ? sanitizeModules(intentType, intentModulesRaw.split(",").filter(Boolean))
      : defaultModulesForType(businessType || null));

  const [businessName, setBusinessName] = useState("");
  // Precargado: a quien entró con Google se lo trajo el proveedor; a quien se
  // registró por correo, el perfil le pone la parte local del correo como
  // nombre provisorio — por eso se muestra editable en vez de darlo por bueno.
  const [fullName, setFullName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  const selectBusinessType = (type: BusinessType) => {
    setTypeChoice(type);
    setModulesChoice(defaultModulesForType(type));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessType) return;
    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.set("business_type", businessType);
    fd.set("business_name", businessName);
    fd.set("phone", phone);
    fd.set("full_name", fullName);
    fd.set("modules", JSON.stringify(Object.keys(modules).filter((id) => modules[id as keyof Modules])));
    if (plan) fd.set("plan", plan);
    if (months) fd.set("months", String(months));

    // La action redirige en el éxito (POS, o el checkout del plan elegido);
    // solo vuelve con un error.
    const res = await completeOnboarding(fd);
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-6"
    >
      <div className="my-auto w-full max-w-[480px] rounded-[28px] border border-outline-variant/20 bg-surface-container-low p-6 shadow-2xl sm:p-8">
        <div className="text-center mb-7 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-container-high border border-outline-variant/10 flex items-center justify-center text-primary mb-5 shadow-sm">
            <RocketIcon />
          </div>
          <h2
            id="onboarding-title"
            className="text-[24px] sm:text-[26px] font-bold text-on-surface mb-2 tracking-tight"
          >
            {step === 1 ? "¿Qué negocio tienes?" : "Ponle nombre a tu negocio"}
          </h2>
          <p className="text-on-surface-variant text-[14px]">
            {step === 1
              ? "Así preparamos tu panel con las herramientas que necesitas."
              : "Es lo último que falta para entrar a tu panel."}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30 mb-5"
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-7">
              <BusinessTypeCards
                value={businessType}
                onChange={selectBusinessType}
                surface="lowest"
              />
            </div>

            <button
              type="button"
              onClick={() => setStepChoice(2)}
              disabled={!businessType}
              className="w-full bg-primary hover:bg-primary-dim disabled:bg-surface-container-high disabled:text-on-surface-variant/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)]"
            >
              Continuar
            </button>

            <p className="text-center text-[13px] text-on-surface-variant font-medium mt-5">
              Paso 1 de 2: Tu negocio
            </p>
          </div>
        )}

        {step === 2 && (
          <form
            className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-5"
            onSubmit={handleSubmit}
          >
            <Field
              id="onboarding-business-name"
              label="Nombre del negocio"
              hint="Así aparecerá tu negocio dentro de Ventex."
            >
              <input
                id="onboarding-business-name"
                type="text"
                autoComplete="organization"
                placeholder={businessNamePlaceholder(businessType)}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                aria-describedby="onboarding-business-name-hint"
                className={inputClass}
                required
                autoFocus
              />
            </Field>

            <Field id="onboarding-full-name" label="Tu nombre">
              <input
                id="onboarding-full-name"
                type="text"
                autoComplete="name"
                placeholder="Ej: Juan Pérez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                required
              />
            </Field>

            <Field id="onboarding-phone" label="Teléfono" optional>
              <input
                id="onboarding-phone"
                type="tel"
                autoComplete="tel"
                placeholder="300 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </Field>

            <ModulePicker
              businessType={businessType}
              modules={modules}
              onChange={setModulesChoice}
              idPrefix="onboarding"
            />

            <button
              type="submit"
              disabled={loading || !businessType || !businessName.trim() || !fullName.trim()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.15)] transition-all hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-primary/50"
            >
              {loading ? (
                <svg aria-hidden className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : plan ? (
                "Continuar al pago"
              ) : (
                "Entrar a mi negocio"
              )}
            </button>

            {REGISTER_BUSINESS_OPTIONS.length > 1 && (
              <button
                type="button"
                onClick={() => setStepChoice(1)}
                className="w-full text-[13px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors py-2"
              >
                Cambiar tipo de negocio
              </button>
            )}

            <p className="text-center text-[13px] text-on-surface-variant font-medium">
              Paso 2 de 2: Datos del negocio
            </p>
          </form>
        )}

        {/* Sin tipo de negocio no hay dashboard que mostrar: la única alternativa
            a completar el paso es salir de la cuenta. */}
        <div className="mt-6 pt-5 border-t border-outline-variant/15 text-center text-[12px] text-on-surface-variant">
          {defaultName ? (
            <>
              Ingresaste como <strong className="text-on-surface">{defaultName}</strong>.{" "}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => signout()}
            className="text-primary font-semibold hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "min-h-12 w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 text-sm text-on-surface transition-all placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none";

function Field({
  id,
  label,
  hint,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-semibold text-on-surface">
        {label}
        {optional && <span className="font-normal text-on-surface-variant/70"> (opcional)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] leading-relaxed text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  );
}
