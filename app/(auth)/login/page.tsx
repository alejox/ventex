"use client";

import Link from "next/link";
import { LogoVertical } from "@/components/Logo";
import { useState } from "react";

type LoginMode = "owner" | "staff";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("owner");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [businessKey, setBusinessKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    // En modo empleado resolvemos primero el correo de la cuenta a partir de la
    // llave del negocio + usuario mediante la función worker_login.
    let loginEmail = email;
    if (mode === "staff") {
      const { data, error: rpcError } = await supabase.rpc("worker_login", {
        p_business_key: businessKey,
        p_username: username,
      });
      if (rpcError) {
        setLoading(false);
        setError(rpcError.message);
        return;
      }
      if (!data) {
        setLoading(false);
        setError("Llave o usuario incorrectos.");
        return;
      }
      loginEmail = data;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    setLoading(false);

    if (error) {
      setError(mode === "staff" ? "Llave, usuario o contraseña incorrectos." : error.message);
    } else {
      window.location.href = "/dashboard/pos";
    }
  };

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {/* Mobile Logo */}
      <div className="flex justify-center mb-8 lg:hidden">
        <LogoVertical className="w-[120px] h-[32px]" />
      </div>

      <div className="text-center lg:text-left mb-6">
        <h2 className="text-[28px] font-bold text-on-surface mb-2">
          Bienvenido de nuevo
        </h2>
        <p className="text-on-surface-variant text-sm">
          Introduce tus credenciales para continuar.
        </p>
      </div>

      {/* Selector de tipo de acceso */}
      <div className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-xl bg-surface-container border border-outline-variant/20">
        {(
          [
            { id: "owner", label: "Dueño" },
            { id: "staff", label: "Empleado" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchMode(t.id)}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === t.id
                ? "bg-surface-container-lowest text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className="space-y-5" onSubmit={handleLogin}>
        {error && (
          <div className="bg-error-container/20 text-error-dim text-[13px] px-4 py-3 rounded-lg border border-error-container/30">
            {error}
          </div>
        )}

        {mode === "owner" ? (
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
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
                <polyline points="3 7 12 13 21 7" />
              </svg>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Llave de la tienda
              </label>
              <input
                type="text"
                autoCapitalize="characters"
                placeholder="Ej: A1B2C3D4"
                value={businessKey}
                onChange={(e) => setBusinessKey(e.target.value.toUpperCase())}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface font-mono tracking-[0.15em] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 placeholder:font-sans placeholder:tracking-normal"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Usuario
              </label>
              <input
                type="text"
                autoCapitalize="none"
                placeholder="tu-usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                required
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[13px] font-semibold text-on-surface block">
              Contraseña
            </label>
            {mode === "owner" && (
              <Link
                href="/reset-password"
                className="text-xs text-primary hover:text-primary-dim font-medium transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            )}
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-10 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              required
            />
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-on-surface-variant/70"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
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
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                </svg>
              ) : (
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1 pb-4">
          <div className="relative flex items-center">
            <input
              type="checkbox"
              id="remember"
              className="peer appearance-none w-4 h-4 border border-outline-variant/40 rounded bg-surface-container-lowest checked:bg-primary checked:border-primary transition-colors cursor-pointer"
            />
            <svg
              className="absolute w-3 h-3 left-0.5 top-0.5 text-on-primary pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <label
            htmlFor="remember"
            className="text-sm text-on-surface-variant cursor-pointer select-none"
          >
            Recordarme en este dispositivo
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-dim disabled:bg-primary/50 disabled:cursor-not-allowed text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(192,193,255,0.15)] flex justify-center items-center gap-2"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            "Iniciar Sesión"
          )}
        </button>
      </form>

      <div className="mt-8 text-center text-[13px] text-on-surface-variant">
        ¿No tienes una cuenta?{" "}
        <Link
          href="/register"
          className="text-primary font-semibold hover:text-primary-dim transition-colors"
        >
          Regístrate gratis
        </Link>
      </div>
    </div>
  );
}
