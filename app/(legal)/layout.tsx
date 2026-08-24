import Link from "next/link";
import { LogoHorizontal } from "@/components/Logo";

/**
 * Shell de las páginas legales (Privacidad, Términos).
 *
 * Va en un route group `(legal)` y no en un segmento real: los paréntesis no
 * aparecen en la URL, así que las rutas siguen siendo `/privacidad` y
 * `/terminos` —las que ya estaban escritas en los enlaces— y el encabezado y el
 * pie se declaran UNA vez en vez de copiarse en cada documento.
 *
 * El encabezado repite el de la landing a propósito: a estas páginas se llega
 * desde el pie o desde el registro, y dejar al visitante sin forma de volver al
 * producto es la manera más rápida de perderlo en un documento legal.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-on-background font-sans">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/70 border-b border-outline-variant/10">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Ir al inicio de Ventex">
            <LogoHorizontal className="w-[104px] h-[28px]" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-primary text-on-primary px-4 py-2 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dim transition-colors"
            >
              Empieza gratis
            </Link>
          </div>
        </nav>
      </header>

      {/* `max-w-3xl` y no el `max-w-6xl` de la landing: una columna de texto
          corrido se lee mal a lo ancho de la pantalla. */}
      <main className="max-w-3xl mx-auto px-6 pt-14 pb-24">{children}</main>

      <footer className="border-t border-outline-variant/10">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <LogoHorizontal className="w-[96px] h-[26px]" />
          <p className="text-xs text-on-surface-variant">© 2026 Ventex. Todos los derechos reservados.</p>
          <div className="flex gap-6 text-xs font-medium text-on-surface-variant">
            <Link href="/privacidad" className="hover:text-on-surface transition-colors">Privacidad</Link>
            <Link href="/terminos" className="hover:text-on-surface transition-colors">Términos</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
