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

/** ¿Se muestra el botón flotante en esta ruta? */
export function showsSupportFab(pathname: string): boolean {
  return !ROUTES_WITH_OWN_BOTTOM_BAR.some((route) => pathname.startsWith(route));
}

/**
 * Espacio que el contenedor de scroll reserva abajo para que NADA quede debajo
 * del botón flotante.
 *
 * La lista de arriba resuelve un caso distinto —pantallas que ya tienen su
 * propia barra fija— y no escala para esto: cualquier formulario largo termina
 * con su botón primario abajo a la derecha, exactamente donde vive el FAB, y no
 * se puede ir agregando rutas a una lista cada vez que aparece uno nuevo. Con el
 * espacio reservado el flotante queda sobre el fondo y nunca sobre un control.
 *
 * El `lg:` va explícito porque el `<main>` tiene `lg:p-10`: una variante de
 * media query gana sobre una clase sin variante por orden en la hoja de
 * estilos, así que sin este par el ajuste se perdería justo en escritorio.
 */
export const SUPPORT_FAB_CLEARANCE =
  "pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-[calc(6rem+env(safe-area-inset-bottom))]";

export function SupportFab() {
  const pathname = usePathname();
  const profile = useProfile();

  if (!showsSupportFab(pathname)) {
    return null;
  }

  const businessName = profile?.businessName?.trim();
  const message = businessName
    ? `Hola, soy "${businessName}". Necesito soporte.`
    : "Hola, necesito soporte.";

  return <WhatsappFab message={message} />;
}
