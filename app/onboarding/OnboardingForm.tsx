"use client";

import { useState } from "react";
import { LogoVertical } from "@/components/Logo";
import { REGISTER_BUSINESS_OPTIONS } from "@/config/business";
import { completeOnboarding } from "./actions";

/**
 * Captura lo que OAuth no trae: tipo y nombre del negocio. Con un solo rubro
 * habilitado (tienda) viene preseleccionado; la lista sale de la misma fuente
 * que el registro por correo (REGISTER_BUSINESS_OPTIONS).
 */
export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [businessType, setBusinessType] = useState(
    REGISTER_BUSINESS_OPTIONS.length === 1 ? REGISTER_BUSINESS_OPTIONS[0].id : "",
  );
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.set("business_type", businessType);
    fd.set("business_name", businessName);

    // La action redirige a /dashboard/pos en el éxito; solo vuelve con un error.
    const res = await completeOnboarding(fd);
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[440px]">
      <div className="flex justify-center mb-8">
        <LogoVertical className="w-[140px] h-[38px]" />
      </div>

      <div className="text-center mb-8">
        <h1 className="text-[26px] font-bold text-on-surface mb-2 tracking-tight">
          Un último paso
        </h1>
        <p className="text-on-surface-variant text-sm">
          Contanos de tu negocio para terminar de configurar tu cuenta.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[13px] font-semibold text-on-surface block">
            Tipo de negocio
          </label>
          <div className="grid grid-cols-1 gap-2.5">
            {REGISTER_BUSINESS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setBusinessType(option.id)}
                className={`text-left px-4 py-3.5 rounded-xl border transition-all ${
                  businessType === option.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                }`}
              >
                <span className="text-[15px] font-semibold">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-on-surface block">
            Nombre del negocio
          </label>
          <input
            type="text"
            placeholder="Mi Tienda"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
            required
          />
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
        {defaultName ? (
          <p className="text-center text-[12px] text-on-surface-variant">
            Ingresaste como <strong className="text-on-surface">{defaultName}</strong>.
          </p>
        ) : null}
      </form>
    </div>
  );
}
