"use client";

import { useState } from "react";
import { authMessage } from "@/lib/errors";

/**
 * "Continuar con Google" — mismo botón para login y registro: OAuth no
 * distingue entre los dos, el usuario entra o se crea según exista o no.
 *
 * Aterriza en `/auth/confirm` (verifica del lado del servidor, igual que el
 * reset y la confirmación de correo). Un usuario nuevo de Google llega sin
 * `business_type`, así que el layout del dashboard le muestra el modal de
 * onboarding para completar el tipo, los módulos y el nombre del negocio.
 */
export function GoogleButton({ label = "Continuar con Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    setLoading(true);
    setError("");
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
      },
    });

    // Si arranca el redirect a Google, este componente se desmonta y ya no
    // importa el loading. Solo llegamos acá si falló antes de salir.
    if (error) {
      setError(authMessage(error));
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-container disabled:opacity-60 disabled:cursor-not-allowed text-on-surface font-semibold py-3 rounded-xl transition-all text-[15px]"
      >
        {loading ? (
          <svg className="animate-spin h-5 w-5 text-on-surface-variant" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
        )}
        <span>{label}</span>
      </button>
      {error && <p className="text-[12px] text-error text-center">{error}</p>}
    </div>
  );
}
