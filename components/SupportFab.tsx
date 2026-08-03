"use client";

import { usePathname } from "next/navigation";
import { useProfile } from "@/components/ProfileProvider";
import { WhatsappFab } from "@/components/WhatsappFab";

/**
 * Soporte por WhatsApp para quien YA es cliente (dashboard).
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

  return <WhatsappFab message={message} />;
}
