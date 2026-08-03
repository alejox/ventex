"use client";

import { usePathname } from "next/navigation";
import { useProfile } from "@/components/ProfileProvider";
import { whatsappUrl } from "@/config/contact";
import { BrandIcon } from "@/app/assets/icons/BrandIcons";

/**
 * Botón flotante de soporte por WhatsApp.
 *
 * El mensaje sale escrito con el NOMBRE DEL NEGOCIO: quien atiende necesita
 * saber de qué cuenta le están hablando antes de poder ayudar, y pedírselo al
 * usuario en el primer mensaje es una ida y vuelta que se puede evitar. El
 * nombre sale del perfil que el layout ya trajo del servidor — este componente
 * no hace ningún I/O.
 */

/**
 * Rutas que ya tienen su propia barra fija abajo: el POS (pestañas + barra de
 * cobro en móvil) y Ajustes → Datos del negocio (barra de guardado). Ahí el
 * botón se superpondría justo encima del control que la persona está usando, así
 * que no se muestra. El soporte sigue a un clic desde cualquier otra pantalla.
 */
const ROUTES_WITH_OWN_BOTTOM_BAR = ["/dashboard/pos", "/dashboard/settings/business"];

export function SupportFab() {
  const pathname = usePathname();
  const profile = useProfile();

  if (ROUTES_WITH_OWN_BOTTOM_BAR.some((route) => pathname.startsWith(route))) {
    return null;
  }

  const businessName = profile?.businessName?.trim();
  const message = businessName
    ? `Hola, soy "${businessName}". Necesito soporte.`
    : "Hola, necesito soporte.";

  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Soporte por WhatsApp"
      title="Soporte por WhatsApp"
      /* z-40: por debajo de los modales (z-200) — un botón flotante encima de un
         diálogo tapa justamente lo que la persona vino a resolver.
         La safe-area es por el gesto de inicio del iPhone. */
      className="print:hidden fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3.5 font-bold text-white shadow-lg shadow-[#25D366]/30 transition-transform hover:scale-105 active:scale-95"
    >
      <BrandIcon name="whatsapp" className="h-6 w-6 shrink-0" />
      <span className="hidden pr-1 text-sm sm:inline">Soporte</span>
    </a>
  );
}
