"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/** Evento no estándar de Chromium; no está en lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ventex:install-dismissed-at";
const DISMISS_DAYS = 30;

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS no implementa display-mode: standalone y usa esta bandera propia.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * El agente de usuario y `localStorage` solo existen en el cliente, y no cambian
 * durante la vida de la página. `useSyncExternalStore` es la forma que tiene
 * React de leerlos sin desincronizar la hidratación: devuelve el snapshot del
 * servidor en el primer render y el del cliente después. Un efecto que llamara
 * a setState haría lo mismo, pero peor y contra las reglas del compilador.
 */
const neverChanges = () => () => {};
const serverFalse = () => false;

const readEligible = () => !isStandalone() && !wasDismissedRecently();

const readIosSafari = () => {
  const ua = navigator.userAgent;
  // Chrome/Firefox en iOS no ofrecen "Añadir a pantalla de inicio".
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
};

/**
 * Invitación a instalar Ventex como aplicación.
 *
 * Chromium (Android, Windows, macOS, Linux) entrega `beforeinstallprompt` y la
 * instalación es un botón. Safari/iOS no lo implementa: ahí lo único posible es
 * explicar el gesto de "Añadir a pantalla de inicio", así que se detecta y se
 * muestran las instrucciones en vez de un botón que no haría nada.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  const eligible = useSyncExternalStore(neverChanges, readEligible, serverFalse);
  const isIosSafari = useSyncExternalStore(neverChanges, readIosSafari, serverFalse);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDismissed(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Modo privado sin almacenamiento: se vuelve a preguntar, no es grave.
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setDismissed(true);
  };

  const showIosHelp = isIosSafari && !deferred;
  const visible = eligible && !dismissed && (deferred !== null || isIosSafari);

  // El POS rompe el padding del shell y fija su alto al viewport: un banner
  // arriba lo desencuadra. Se ofrece en cualquier otra pantalla.
  if (!visible || pathname?.startsWith("/dashboard/pos")) return null;

  return (
    <div className="print:hidden mb-6 flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
      <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface">Instalá Ventex como aplicación</p>
        <p className="text-sm text-on-surface-variant mt-0.5">
          {showIosHelp ? (
            <>
              Tocá <span className="font-semibold text-on-surface">Compartir</span> y después{" "}
              <span className="font-semibold text-on-surface">Añadir a pantalla de inicio</span>.
            </>
          ) : (
            "Se abre a pantalla completa, arranca en el punto de venta y queda en tu escritorio o pantalla de inicio."
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!showIosHelp && (
          <button
            onClick={install}
            className="h-11 px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary-dim transition-colors"
          >
            Instalar
          </button>
        )}
        <button
          onClick={dismiss}
          className="h-11 px-4 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
