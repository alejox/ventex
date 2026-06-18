"use client";

import Image from "next/image";
import Link from "next/link";
import { LogoVertical } from "@/components/Logo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleIcon } from "@/app/assets/icons/GoogleIcon";
import { FacebookIcon } from "@/app/assets/icons/FacebookIcon";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Credenciales de prueba hardcodeadas
    if (email === "test@ventex.com" && password === "password123") {
      router.push("/dashboard");
    } else {
      setError(
        "Credenciales incorrectas. Intenta con test@ventex.com y la contraseña password123",
      );
    }
  };

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {/* Mobile Logo */}
      <div className="flex justify-center mb-8 lg:hidden">
        <LogoVertical className="w-[120px] h-[32px]" />
      </div>

      <div className="text-center lg:text-left mb-8">
        <h2 className="text-[28px] font-bold text-on-surface mb-2">
          Bienvenido de nuevo
        </h2>
        <p className="text-on-surface-variant text-sm">
          Introduce tus credenciales para continuar.
        </p>
      </div>

      {/* Social Logins */}
      <div className="flex gap-4 mb-8 flex-col sm:flex-row">
        <button className="flex-1 flex items-center justify-center gap-3 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors text-sm font-medium border border-outline-variant/20 text-on-surface">
          <GoogleIcon />
          Google
        </button>
        <button className="flex-1 flex items-center justify-center gap-3 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors text-sm font-medium border border-outline-variant/20 text-on-surface">
          <FacebookIcon />
          Facebook
        </button>
      </div>

      <div className="relative flex items-center py-2 mb-8">
        <div className="flex-grow border-t border-outline-variant/20"></div>
        <span className="flex-shrink-0 mx-4 text-[10px] text-on-surface-variant font-bold tracking-[0.15em] uppercase">
          O continúa con email
        </span>
        <div className="flex-grow border-t border-outline-variant/20"></div>
      </div>

      <form className="space-y-5" onSubmit={handleLogin}>
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
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
              <polyline points="3 7 12 13 21 7" />
            </svg>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[13px] font-semibold text-on-surface block">
              Contraseña
            </label>
            <Link
              href="#"
              className="text-xs text-primary hover:text-primary-dim font-medium transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
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
          className="w-full bg-primary hover:bg-primary-dim text-on-primary font-semibold py-3.5 rounded-xl transition-all text-[15px] shadow-[0_0_15px_rgba(192,193,255,0.15)] flex justify-center items-center gap-2"
        >
          Iniciar Sesión
        </button>
      </form>

      <div className="mt-8 text-center text-[13px] text-on-surface-variant">
        ¿No tienes una cuenta?{" "}
        <Link
          href="#"
          className="text-primary font-semibold hover:text-primary-dim transition-colors"
        >
          Regístrate gratis
        </Link>
      </div>
    </div>
  );
}
