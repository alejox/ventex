import Link from "next/link";
import { AuthAside } from "@/components/AuthAside";
import { LogoHorizontal } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * El panel queda OSCURO en los dos temas, como el hero de la landing.
 *
 * Los tokens siguen al tema, y el fondo del panel ya no es un token sino una
 * foto: en claro, un `--on-surface` casi negro sobre la foto oscurecida no se
 * lee. Fijar la tinta acá adentro es lo que permite un solo juego de velo y
 * brillo para TODAS las vistas del carrusel, en vez de medir cada foto contra
 * dos temas distintos.
 *
 * Es SOLO el panel decorativo. El formulario de la derecha sigue el tema que
 * eligió la persona, que para eso está el interruptor arriba a la derecha.
 */
const ESTILO_PANEL = `
.auth-aside{
  /* El panel conserva los neutros del tema oscuro aunque el formulario
     contiguo esté en tema claro. */
  --on-surface:#f2f0f5;
  --on-surface-variant:#bcbac4;
  --surface-container-low:#1d1d23;
  --surface-container-highest:#36353e;
  --surface-bright:#55535d;
  background:#17171c;
  color:var(--on-surface);
}
/* Oscurecer la FOTO en vez de taparla con un velo opaco: un velo que deje pasar
   texto blanco necesita tanta alfa que la foto deja de verse. Bajarle el brillo
   la conserva entera y deja el contraste donde tiene que estar. */
/* Se conservan el brillo de las fotos y la fuerza del velo para mantener
   legible el texto claro en todo el carrusel; solo cambia el matiz neutro. */
.auth-media{filter:brightness(.60) saturate(1.06)}
/* El degradado carga arriba y abajo, que es donde caen el titular y el pie. */
.auth-scrim{background:
  /* Viñeteado DIRIGIDO a la columna de texto, no un velo parejo: así la copia
     cae sobre campo limpio mientras los bordes siguen mostrando la foto. Un
     velo uniforme con la misma alfa apagaría la foto entera para arreglar una
     franja. */
  radial-gradient(ellipse 76% 50% at 50% 47%,rgb(18 18 23 / .58) 0%,rgb(18 18 23 / 0) 100%),
  linear-gradient(180deg,rgb(18 18 23 / .52) 0%,rgb(18 18 23 / .26) 44%,rgb(18 18 23 / .80) 100%)}
`;

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-on-background font-sans">
      <style href="auth-aside" precedence="default">{ESTILO_PANEL}</style>
      {/* Left side - Desktop only */}
      <AuthAside />

      {/* Right side - Main Content */}
      <div className="flex flex-col flex-1 w-full lg:w-1/2 min-h-screen relative z-10">
         <header className="flex items-center px-6 pt-6 sm:px-12 lg:hidden">
            <Link href="/" aria-label="Ventex, ir al inicio" className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
               <LogoHorizontal className="w-40 h-10" />
            </Link>
         </header>
         {/* El tema se elige ANTES de entrar: si alguien trabaja de noche no
             tiene que comerse la pantalla en claro hasta pasar el login.
             Escribe el mismo `localStorage.theme` que lee el script inline del
             layout raíz, así que la elección sobrevive a la sesión. */}
         <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
            <ThemeToggle />
         </div>
         <main className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-12 lg:px-24">
            {children}
         </main>
         {/* Footer */}
         <footer className="px-6 py-6 sm:px-12 lg:px-24 border-t border-outline-variant/10 text-xs text-on-surface-variant flex flex-col sm:flex-row justify-between items-center gap-4">
            <span>© 2026 Ventex. Todos los derechos reservados.</span>
            <nav aria-label="Enlaces legales" className="flex gap-4 sm:gap-6">
               <Link href="/privacidad" className="hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary transition-colors">Privacidad</Link>
               <Link href="/terminos" className="hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary transition-colors">Términos</Link>
            </nav>
         </footer>
      </div>
    </div>
  );
}
