import Link from "next/link";
import { LogoVertical } from "@/components/Logo";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-on-background font-sans">
      {/* Left side - Desktop only */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-surface-container-low relative overflow-hidden">
         {/* Background Glow */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,var(--color-primary)_0%,transparent_50%)] opacity-5 pointer-events-none"></div>

         <div className="flex items-center justify-center flex-1 z-10">
            <div className="max-w-md space-y-6 text-center flex flex-col items-center">
               <LogoVertical className="w-[140px] h-[40px] mb-4" forceWhite />
               <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-on-surface leading-tight">Optimiza tu futuro hoy mismo.</h1>
               <p className="text-on-surface-variant text-base lg:text-lg">
                  Accede a la plataforma líder en gestión de activos digitales. Experimenta la potencia del ecosistema Ventex con total seguridad.
               </p>
               {/* Active users */}
               <div className="flex items-center justify-center gap-4 mt-8 pt-4">
                  <div className="flex -space-x-3">
                     <div className="w-10 h-10 rounded-full bg-surface-bright border-2 border-surface-container-low shadow-sm" />
                     <div className="w-10 h-10 rounded-full bg-surface-bright border-2 border-surface-container-low shadow-sm" />
                     <div className="w-10 h-10 rounded-full bg-surface-bright border-2 border-surface-container-low shadow-sm" />
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
