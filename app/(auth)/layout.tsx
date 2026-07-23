import Link from "next/link";
import { LogoVertical } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Avatares decorativos del bloque de prueba social. Solo iniciales sobre
 * degradados de la marca: no representan personas concretas, así que van con
 * `aria-hidden` —el dato real lo dice el texto de al lado—.
 */
const ACTIVE_USERS = [
  { initials: "MG", from: "#6d21ef", to: "#8b5cf6" },
  { initials: "JR", from: "#494bd7", to: "#0fdff3" },
  { initials: "CA", from: "#0fdff3", to: "#10b981" },
];

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-on-background font-sans">
      {/* Left side - Desktop only */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-surface-container-low relative overflow-hidden">
         {/* Background Glow */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,var(--color-primary)_0%,transparent_50%)] opacity-5 pointer-events-none"></div>

         <div className="flex items-center justify-center flex-1 z-10">
            <div className="max-w-md space-y-6 text-center flex flex-col items-center">
               <LogoVertical className="w-[320px] h-[180px] mb-6" />
               <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-on-surface leading-tight">Optimiza tu futuro hoy mismo.</h1>
               <p className="text-on-surface-variant text-base lg:text-lg">
                  Accede a la plataforma líder en gestión de activos digitales. Experimenta la potencia del ecosistema Ventex con total seguridad.
               </p>
               {/* Prueba social.
                   Los avatares se dibujan acá, con degradados de la marca e
                   iniciales: nada viaja por la red. Traer retratos de un
                   servicio externo habría metido una petición bloqueante en la
                   pantalla más crítica de la app, rota sin conexión (el service
                   worker no cachea otro origen), y además serían caras de
                   personas reales presentadas como usuarios de Ventex. */}
               <div className="flex items-center justify-center gap-4 mt-8 pt-4">
                  <div className="flex -space-x-3">
                     {ACTIVE_USERS.map((user) => (
                        <div
                           key={user.initials}
                           aria-hidden="true"
                           className="w-10 h-10 rounded-full border-2 border-surface-container-low shadow-sm flex items-center justify-center text-[11px] font-bold text-white"
                           style={{ backgroundImage: `linear-gradient(135deg, ${user.from}, ${user.to})` }}
                        >
                           {user.initials}
                        </div>
                     ))}
                     <div className="w-10 h-10 rounded-full border-2 border-surface-container-low shadow-sm bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-on-surface-variant">
                        +15k
                     </div>
                  </div>
                  <span className="text-sm font-medium text-on-surface-variant">~15k usuarios activos</span>
               </div>
            </div>
         </div>
         {/* Bottom indicator & version */}
         <div className="flex justify-between items-center text-on-surface-variant text-xs font-semibold tracking-widest uppercase z-10">
            <div className="flex gap-2">
               <div className="w-2 h-2 rounded-full bg-primary" />
               <div className="w-2 h-2 rounded-full bg-surface-bright" />
               <div className="w-2 h-2 rounded-full bg-surface-bright" />
            </div>
            <div>V2.4.0 HIGH-PERFORMANCE HUB</div>
         </div>
      </div>

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
