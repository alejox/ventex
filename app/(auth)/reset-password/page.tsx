"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoVertical } from "@/components/Logo";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="w-full max-w-[420px] mx-auto text-center">
        <div className="flex justify-center mb-8 lg:hidden">
          <LogoVertical className="w-[120px] h-[32px]" />
        </div>
        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h2 className="text-[28px] font-bold text-on-surface mb-2">
          Revisa tu correo
        </h2>
        <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
          Te enviamos un enlace para restablecer tu contraseña a <strong className="text-on-surface">{email}</strong>.
        </p>
        <Link
          href="/login"
          className="inline-block w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] text-center"
        >
          Volver a Iniciar Sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px] mx-auto">
      <div className="flex justify-center mb-8 lg:hidden">
        <LogoVertical className="w-[120px] h-[32px]" />
      </div>

      <div className="text-center lg:text-left mb-8">
        <h2 className="text-[28px] font-bold text-on-surface mb-2">
          Restablecer contraseña
        </h2>
        <p className="text-on-surface-variant text-sm">
          Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleReset}>
        {error && (
          <div className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-on-surface block">
            Correo electrónico
          </label>
          <div className="relative">
            <input
              type="email"
              placeholder="nombre@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
              <polyline points="3 7 12 13 21 7" />
            </svg>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-dim disabled:bg-primary/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(96,99,238,0.15)] flex justify-center items-center gap-2"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            "Enviar enlace"
          )}
        </button>
      </form>

      <div className="mt-8 text-center text-[13px] text-on-surface-variant">
        <Link
          href="/login"
          className="text-primary font-semibold hover:text-primary-dim transition-colors"
        >
          Volver a Iniciar Sesión
        </Link>
      </div>
    </div>
  );
}
