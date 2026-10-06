import type { Metadata } from "next";
import Link from "next/link";
import { LogoVertical } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

/**
 * 404 de toda la app (A2): cualquier URL que no coincide con una ruta, incluso
 * bajo `/dashboard/*`, cae acá — el `not-found.tsx` de un segmento solo atiende
 * los `notFound()` que se llaman DENTRO de él. Va sin shell a propósito: no
 * sabemos si quien llega tiene sesión.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <LogoVertical className="h-16 w-16" />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">Error 404</p>
        <h1 className="text-2xl font-bold text-on-surface">No encontramos esta página</h1>
        <p className="max-w-sm text-sm text-on-surface-variant">
          Puede que el enlace esté mal escrito o que la página ya no exista. Revisa la dirección o
          vuelve a un lugar conocido.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Ir al panel
        </Link>
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-xl border border-outline-variant/30 bg-surface-container px-6 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Ir a la página principal
        </Link>
      </div>
    </main>
  );
}
