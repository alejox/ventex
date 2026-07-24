"use client";

import Link from "next/link";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LogoVertical } from "@/components/Logo";
import { authMessage } from "@/lib/errors";

type SessionStatus = "checking" | "ready" | "invalid";

function UpdatePasswordForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState<SessionStatus>("checking");
  const started = useRef(false);

  useEffect(() => {
    // El canje del código es de un solo uso: si se dispara dos veces (React
    // StrictMode monta y desmonta los efectos en desarrollo) el segundo intento
    // falla y deja al usuario con un error falso.
    if (started.current) return;
    started.current = true;

    (async () => {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();

      // Cuando el enlace falla del lado de Supabase, el motivo llega en el
      // fragmento (#error=…), que nunca viaja al servidor. Hay que leerlo acá.
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const hashError = hash.get("error_description") ?? hash.get("error");

      // Camino PKCE heredado: el enlace del correo cae directo en esta página
      // con `?code=`. Con `/auth/confirm` la sesión ya viene en la cookie.
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(authMessage(error));
          setStatus("invalid");
          return;
        }
      }

      // Sin sesión de recuperación, `updateUser` revienta con "Auth session
      // missing!" recién después de que el usuario escribió la contraseña.
      // Mejor detectarlo ahora y ofrecerle pedir otro enlace.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setStatus("ready");
        return;
      }

      setError(
        hashError
          ? authMessage(hashError)
          : "El enlace ya se usó o venció. Pedí uno nuevo.",
      );
      setStatus("invalid");
    })();
  }, [searchParams]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(authMessage(error));
    } else {
      // La sesión de recuperación no es una sesión normal: dejarla abierta
      // significa que cualquiera con el enlace queda logueado. Se cierra y el
      // usuario entra con la contraseña nueva.
      await supabase.auth.signOut();
      setSuccess(true);
    }
  };

  if (status === "checking") {
    return (
      <div className="w-full max-w-[420px] mx-auto text-center py-16">
        <svg className="animate-spin h-6 w-6 mx-auto text-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-on-surface-variant text-sm mt-4">Validando el enlace…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="w-full max-w-[420px] mx-auto text-center">
        <div className="flex justify-center mb-8 lg:hidden">
          <LogoVertical className="w-[120px] h-[32px]" />
        </div>
        <div className="w-16 h-16 rounded-full bg-error-container/20 text-error flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-[28px] font-bold text-on-surface mb-2">
          Enlace no válido
        </h2>
        <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">{error}</p>
        <Link
          href="/reset-password"
          className="inline-block w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] text-center"
        >
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-[420px] mx-auto text-center">
        <div className="flex justify-center mb-8 lg:hidden">
          <LogoVertical className="w-[120px] h-[32px]" />
        </div>
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-[28px] font-bold text-on-surface mb-2">
          Contraseña actualizada
        </h2>
        <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
          Tu contraseña se ha restablecido correctamente.
        </p>
        <Link
          href="/login"
          className="inline-block w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] text-center"
        >
          Iniciar Sesión
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
          Nueva contraseña
        </h2>
        <p className="text-on-surface-variant text-sm">
          Ingresa tu nueva contraseña para restablecer el acceso.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleUpdate}>
        {error && (
          <div className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-on-surface block">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              required
              minLength={6}
            />
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface transition-colors"
            >
              {showPassword ? (
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
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
            "Restablecer contraseña"
          )}
        </button>
      </form>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordForm />
    </Suspense>
  );
}
