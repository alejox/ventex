import Link from "next/link";
import { AuthAside } from "@/components/AuthAside";
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
  --on-surface:#ffffff;
  --on-surface-variant:#ccd0de;
  --surface-container-low:#0b0e19;
  --surface-container-highest:#2b3049;
  --surface-bright:#5b6280;
  --primary:#8f92ff;
  background:#0b0e19;
  color:var(--on-surface);
}
/* Oscurecer la FOTO en vez de taparla con un velo opaco: un velo que deje pasar
   texto blanco necesita tanta alfa que la foto deja de verse. Bajarle el brillo
   la conserva entera y deja el contraste donde tiene que estar. */
/* brightness(.60) NO es al ojo: con el velo puesto, un barrido de .38 a .70
   pasa AA en todos los casos, y .38 estaba apagando la foto sin necesidad. .60
   deja margen ×1.4 sobre el mínimo y es lo más claro que se puede sin comerse
   ese colchón en anchos donde el recorte cambia. */
.auth-media{filter:brightness(.60) saturate(1.06)}
/* El degradado carga arriba y abajo, que es donde caen el titular y el pie. */
.auth-scrim{background:
  /* Viñeteado DIRIGIDO a la columna de texto, no un velo parejo: así la copia
     cae sobre campo limpio mientras los bordes siguen mostrando la foto. Un
     velo uniforme con la misma alfa apagaría la foto entera para arreglar una
     franja. */
  radial-gradient(ellipse 76% 50% at 50% 47%,rgb(11 14 25 / .58) 0%,rgb(11 14 25 / 0) 100%),
  linear-gradient(180deg,rgb(11 14 25 / .52) 0%,rgb(11 14 25 / .26) 44%,rgb(11 14 25 / .80) 100%)}
`;

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-on-background font-sans">
      <style href="auth-aside" precedence="default">{ESTILO_PANEL}</style>
      {/* Left side - Desktop only */}
      <AuthAside />

      {/* Right side - Main Content */}
      <div className="flex flex-col flex-1 w-full lg:w-1/2 min-h-screen relative z-10">
         {/* El tema se elige ANTES de entrar: si alguien trabaja de noche no
             tiene que comerse la pantalla en claro hasta pasar el login.
             Escribe el mismo `localStorage.theme` que lee el script inline del
             layout raíz, así que la elección sobrevive a la sesión. */}
         <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
            <ThemeToggle />
         </div>
         <main className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-24">
            {children}
         </main>
         {/* Footer */}
         <footer className="px-6 py-6 sm:px-12 lg:px-24 border-t border-outline-variant/10 text-xs text-on-surface-variant flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
               <span className="font-bold text-on-surface">Ventex</span>
               <span>© 2024 Ventex Inc. All rights reserved.</span>
            </div>
            <div className="flex gap-4 sm:gap-6 flex-wrap justify-center">
               <Link href="#" className="hover:text-on-surface transition-colors">Privacy Policy</Link>
               <Link href="#" className="hover:text-on-surface transition-colors">Terms of Service</Link>
               <Link href="#" className="hover:text-on-surface transition-colors">Security</Link>
               <Link href="#" className="hover:text-on-surface transition-colors">Cookie Settings</Link>
            </div>
            <div className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
               <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                 <circle cx="12" cy="12" r="10"/>
                 <line x1="2" y1="12" x2="22" y2="12"/>
                 <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
               </svg>
               <span>Español (ES)</span>
            </div>
         </footer>
      </div>
    </div>
  );
}
