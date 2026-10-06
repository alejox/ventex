"use client"; // Los límites de error de Next tienen que ser Client Components.

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Error inesperado en cualquier pantalla de `/dashboard/*` (A2).
 *
 * Se dibuja DENTRO del shell (sidebar y topbar siguen ahí, porque `error.tsx`
 * no envuelve al `layout.tsx` de su propio segmento): la persona no pierde la
 * navegación por un error de una sola pantalla.
 *
 * "Reintentar" usa `unstable_retry` (Next 16.2+: vuelve a pedir y a dibujar el
 * segmento) y cae a `reset` si no viene. El `message` solo se muestra en
 * desarrollo; en producción Next lo reemplaza por un texto genérico y el
 * `digest` es lo que sirve para buscar el error en los logs del servidor.
 */
export default function DashboardError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div
        role="alert"
        className="w-full max-w-md rounded-3xl border border-error-container/30 bg-error-container/20 px-6 py-8 text-center"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error/10 text-error">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-on-surface">Algo salió mal en esta pantalla</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          No pudimos mostrar esta sección. Inténtalo de nuevo o vuelve al inicio.
        </p>
        {process.env.NODE_ENV !== "production" && error.message && (
          <p className="mt-3 break-words font-mono text-xs text-error-dim">{error.message}</p>
        )}
        {error.digest && (
          <p className="mt-3 text-xs text-on-surface-variant">
            Código de referencia: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {retry && (
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Reintentar
            </button>
          )}
          <Link
            href="/dashboard"
            className="inline-flex min-h-10 items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-error-dim underline underline-offset-2 transition-colors hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
