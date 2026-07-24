"use client";

import { useState } from "react";
import { BUSINESS_ICONS, MODULE_ICONS, RocketIcon } from "@/app/assets/icons/BusinessIcons";
import {
  MODULES_BY_TYPE,
  REGISTER_BUSINESS_OPTIONS,
  type BusinessType,
} from "@/config/business";
import { signout } from "@/utils/supabase/actions";
import { completeOnboarding } from "./actions";

/**
 * Modal bloqueante para los dueños que entraron por OAuth (Google): el proveedor
 * no entrega tipo ni nombre de negocio, así que el perfil queda incompleto y el
 * gating de navegación no tiene de dónde agarrarse.
 *
 * No se puede cerrar (sin backdrop clickeable, sin Escape): sin tipo de negocio
 * el dashboard no sabe qué mostrar. La única salida es completarlo o cerrar
 * sesión. Los pasos y las opciones son los mismos del registro por correo
 * (REGISTER_BUSINESS_OPTIONS + MODULES_BY_TYPE), de una sola fuente.
 */
export function OnboardingModal({ defaultName }: { defaultName: string }) {
  // Con un único rubro habilitado no tiene sentido obligar a elegirlo.
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState(
    REGISTER_BUSINESS_OPTIONS.length === 1 ? REGISTER_BUSINESS_OPTIONS[0].id : "",
  );
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const moduleOptions = MODULES_BY_TYPE[businessType as BusinessType] ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.set("business_type", businessType);
    fd.set("business_name", businessName);
    fd.set("modules", JSON.stringify(Object.keys(modules).filter((id) => modules[id])));

    // La action redirige a /dashboard/pos en el éxito; solo vuelve con un error.
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
      <div className="w-full max-w-[480px] my-auto bg-surface-container-low border border-outline-variant/20 rounded-[28px] shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-7 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-container-high border border-outline-variant/10 flex items-center justify-center text-primary mb-5 shadow-sm">
            <RocketIcon />
          </div>
          <h2
            id="onboarding-title"
            className="text-[24px] sm:text-[26px] font-bold text-on-surface mb-2 tracking-tight"
          >
            {step === 1 ? "Personaliza tu experiencia" : "Potencia tu negocio"}
          </h2>
          <p className="text-on-surface-variant text-[14px]">
            {step === 1
              ? "Selecciona el tipo de negocio que mejor te describe para configurar tu panel."
              : "Selecciona las herramientas que necesitas y dale un nombre a tu negocio."}
          </p>
        </div>

        {error && (
          <div className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30 mb-5">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-3 mb-7">
              {REGISTER_BUSINESS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setBusinessType(option.id)}
                  className={`w-full py-4 px-6 rounded-[20px] border flex flex-col items-center justify-center gap-3 transition-all duration-300 ${
                    businessType === option.id
                      ? "bg-primary/5 border-primary ring-1 ring-primary/50 shadow-[0_0_20px_rgba(96,99,238,0.1)]"
                      : "bg-surface-container-lowest border-outline-variant/10 hover:bg-surface-container hover:border-outline-variant/20"
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all duration-300 ${
                      businessType === option.id
                        ? "bg-primary border-primary text-on-primary shadow-md"
                        : "bg-surface-container-highest border-outline-variant/20 text-on-surface-variant"
                    }`}
                  >
                    {BUSINESS_ICONS[option.id]}
                  </div>
                  <span
                    className={`text-[15px] font-semibold transition-colors ${
                      businessType === option.id ? "text-primary" : "text-on-surface"
                    }`}
                  >
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!businessType}
              className="w-full bg-primary hover:bg-primary-dim disabled:bg-surface-container-high disabled:text-on-surface-variant/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)]"
            >
              Continuar
            </button>

            <p className="text-center text-[13px] text-on-surface-variant font-medium mt-5">
              Paso 1 de 2: Perfil de Negocio
            </p>
          </div>
        )}

        {step === 2 && (
          <form
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
            onSubmit={handleSubmit}
          >
            {moduleOptions.length > 0 && (
              <div className="space-y-3 mb-6">
                {moduleOptions.map((mod) => {
                  const isOn = !mod.comingSoon && !!modules[mod.id];
                  return (
                    <div
                      key={mod.id}
                      className={`p-4 rounded-[20px] border transition-all duration-300 ${
                        mod.comingSoon
                          ? "bg-surface-container-lowest/50 border-outline-variant/10 opacity-70"
                          : isOn
                            ? "bg-primary/5 border-primary/40"
                            : "bg-surface-container-lowest border-outline-variant/10"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                            isOn
                              ? "bg-primary text-on-primary border-primary"
                              : "bg-surface-container-highest border-outline-variant/20 text-on-surface-variant"
                          }`}
                        >
                          {MODULE_ICONS[mod.id]}
                        </div>
                        {mod.comingSoon ? (
                          <span className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant bg-surface-container-highest border border-outline-variant/20 px-2.5 py-1 rounded-full">
                            Próximamente
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Activar ${mod.label}`}
                            aria-pressed={isOn}
                            onClick={() => setModules({ ...modules, [mod.id]: !modules[mod.id] })}
                            className={`w-11 h-6 rounded-full relative transition-colors duration-300 focus:outline-none ${
                              isOn
                                ? "bg-primary"
                                : "bg-surface-container-highest border border-outline-variant/20"
                            }`}
                          >
                            <span
                              className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${
                                isOn ? "left-[22px]" : "left-[2px]"
                              }`}
                            />
                          </button>
                        )}
                      </div>
                      <h3 className="text-[16px] font-bold text-on-surface mb-1.5">{mod.label}</h3>
                      <p className="text-[13px] text-on-surface-variant leading-relaxed">
                        {mod.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-1.5 mb-6">
              <label
                htmlFor="onboarding-business-name"
                className="text-[13px] font-semibold text-on-surface block"
              >
                Nombre del negocio
              </label>
              <div className="relative">
                <input
                  id="onboarding-business-name"
                  type="text"
                  placeholder="Mi Tienda"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  required
                />
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !businessType || !businessName.trim()}
              className="w-full bg-primary hover:bg-primary-dim disabled:bg-primary/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)] flex justify-center items-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                "Entrar a mi negocio"
              )}
            </button>

            {REGISTER_BUSINESS_OPTIONS.length > 1 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-[13px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors mt-3 py-2"
              >
                Atrás
              </button>
            )}

            <p className="text-center text-[13px] text-on-surface-variant font-medium mt-5">
              Paso 2 de 2: Módulos y nombre
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
