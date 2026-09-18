"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { LogoHorizontal } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Header de la landing: transparente sobre el hero, sólido al scrollear.
 *
 * Arriba del todo no lleva fondo propio a propósito, para que el video se vea
 * entero por detrás. La legibilidad ahí la sostiene `hero-ink`: el hero es
 * oscuro en los DOS temas (el fondo es un video, no un token), así que el nav
 * toma los valores oscuros y queda claro sobre la escena. Medido: la banda
 * superior del video, ya con el brillo al 45%, llega a luminancia 0.079, y el
 * texto claro sobre eso da 6.7:1.
 *
 * Apenas se scrollea, el header ya no está sobre el video sino sobre el resto de
 * la página, y ahí el fondo va casi sólido (0.92). No es estética: por debajo
 * pasa contenido de luminancia arbitraria, y en tema oscuro un elemento claro
 * detrás del header exige 0.865 para que el nav siga en 4.5:1. A 0.80 se veían
 * los botones del hero calcados sobre el menú.
 *
 * El estado se lee con `useSyncExternalStore` y no con `useEffect` + `setState`
 * (el proyecto tiene `react-hooks/set-state-in-effect` activa). Como la
 * instantánea es un booleano, el componente se vuelve a renderizar solo cuando
 * cruza el umbral, no en cada evento de scroll.
 */

const suscribirScroll = (avisar: () => void) => {
  window.addEventListener("scroll", avisar, { passive: true });
  return () => window.removeEventListener("scroll", avisar);
};

// 24px: apenas se despega del tope. Más alto deja el header transparente sobre
// contenido que ya no es el video.
const leerScroll = () => window.scrollY > 24;

// En el servidor no hay scroll. Arranca transparente, que es el estado del tope
// de la página: así el primer frame no muestra un header sólido que se desvanece.
const leerScrollServidor = () => false;

export function LandingHeader() {
  const scrolleado = useSyncExternalStore(
    suscribirScroll,
    leerScroll,
    leerScrollServidor,
  );

  return (
    <header
      // Sin scrollear el header está sobre el VIDEO, que es oscuro en los dos
      // temas: ahí toma `hero-ink` (los tokens oscuros, definidos junto al hero)
      // para que el nav quede claro. Sin esto, en tema claro el texto salía
      // oscuro sobre la escena oscura y desaparecía.
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolleado
          ? "backdrop-blur-xl bg-background/92 border-b border-outline-variant/10"
          : "hero-ink bg-transparent border-b border-transparent"
      }`}
    >
      {/* Grilla de 3 columnas y no `justify-between`: con flex, el grupo del
          centro flota según el ancho de los costados, y como la derecha (toggle
          + sesión + CTA) es mucho más ancha que el logo, los enlaces quedaban
          corridos a la izquierda. Con `1fr auto 1fr` el centro es el centro
          REAL, sin importar cuánto crezcan los lados. */}
      <nav
        aria-label="Principal"
        className="max-w-6xl mx-auto px-4 sm:px-6 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-2"
      >
        <div className="flex items-center">
          <Link href="/" aria-label="Ventex — inicio">
            <LogoHorizontal className="w-[92px] sm:w-[104px] h-[26px] sm:h-[28px]" />
          </Link>
        </div>

        <div
          className={`hidden lg:flex items-center gap-1 rounded-full p-1 text-sm font-medium text-on-surface transition-colors ${
            scrolleado
              ? "border border-outline-variant/10 bg-surface-container-low/60"
              : "border border-transparent"
          }`}
        >
          <a
            href="#producto"
            className={`rounded-full px-4 py-2 text-on-surface transition-colors ${
              scrolleado
                ? "bg-surface-container-high shadow-sm hover:bg-surface-container-highest"
                : "hover:bg-surface-container-high/60"
            }`}
          >
            Producto
          </a>
          <a href="#como-funciona" className="rounded-full px-4 py-2 transition-colors hover:bg-surface-container-high/60">
            Cómo funciona
          </a>
          <a href="#precios" className="rounded-full px-4 py-2 transition-colors hover:bg-surface-container-high/60">
            Precios
          </a>
        </div>
        {/* Los enlaces aparecen recién en `lg`, no en `md`. Medido: a 768px la
            columna derecha (toggle + sesión + CTA) pide ~250px y cada columna
            `1fr` solo da ~186, así que se desbordaba y empujaba el centro 92px a
            la izquierda — el desbalance que se veía. A 1024px hay ~310 por lado
            y el centro queda exacto.
            Este placeholder ocupa la columna del medio cuando los enlaces no
            están: sin él la grilla colapsa a dos columnas y el logo se despega
            del borde del contenido. */}
        <div className="lg:hidden" />

        <div className="flex items-center justify-end gap-1 sm:gap-3">
          <ThemeToggle />
          {/* "Iniciar sesión" ya NO se oculta en móvil: era la información que
              se perdía. En pantallas chicas va como enlace de texto compacto, y
              el CTA principal acorta su etiqueta para que los dos entren sin
              apretarse. */}
          <Link
            href="/login"
            className="text-sm font-semibold text-on-surface hover:text-primary transition-colors whitespace-nowrap px-1"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-primary text-on-primary px-3 sm:px-4 py-2 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dim transition-colors whitespace-nowrap"
          >
            <span className="sm:hidden">Empieza</span>
            <span className="hidden sm:inline">Empieza gratis</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
