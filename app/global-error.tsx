"use client"; // Los límites de error de Next tienen que ser Client Components.

import "./globals.css";

/**
 * Último recurso (A2): un error en el layout raíz. REEMPLAZA a `app/layout.tsx`,
 * así que trae su propio `<html>`/`<body>`, los estilos globales y el script
 * del tema (sin él, la página saldría en claro aunque la persona use oscuro).
 * No usa ThemeProvider ni nada del árbol normal: justamente puede ser eso lo
 * que falló.
 */
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const retry = unstable_retry ?? reset;
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';var d=document.documentElement;d.setAttribute('data-theme',t);d.classList.toggle('dark',t==='dark');}catch(e){}})();`,
          }}
        />
        <title>Algo salió mal | Ventex</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-on-surface">Algo salió mal</h1>
            <p className="max-w-sm text-sm text-on-surface-variant">
              Ventex tuvo un problema al cargar. Inténtalo de nuevo en unos segundos.
            </p>
            {error.digest && (
              <p className="text-xs text-on-surface-variant">
                Código de referencia: <span className="font-mono">{error.digest}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {retry && (
              <button
                type="button"
                onClick={() => retry()}
                className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Reintentar
              </button>
            )}
            {/* <a> y no <Link>: el router puede ser lo que falló; recargar de
                cero es justo lo que hace falta acá. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-12 items-center rounded-xl border border-outline-variant/30 bg-surface-container px-6 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
            >
              Ir a la página principal
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
