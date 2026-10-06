/**
 * Estado plegado del sidebar del dashboard.
 *
 * Vive en una COOKIE y no en localStorage a propósito: el layout es un Server
 * Component y necesita saber el ancho del menú ANTES de mandar el HTML. Con
 * localStorage el servidor pintaba el menú expandido y el cliente lo plegaba en
 * la hidratación — de ahí el "Hydration failed" y el salto visual del logo.
 *
 * El nombre y el parser viven aquí (módulo neutro) porque el layout de servidor
 * no puede importar constantes de un módulo "use client": del otro lado del
 * borde RSC todo export se convierte en una referencia de cliente, no en el
 * valor.
 */

export const SIDEBAR_COOKIE = "sidebar_collapsed";

/** Un año: es una preferencia de interfaz, no una sesión. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Sin cookie, el menú arranca EXPANDIDO (A24): quien entra por primera vez
 * necesita leer los nombres de las secciones, no adivinar trece iconos. Plegarlo
 * es una preferencia que se gana con el uso y queda guardada en la cookie.
 */
export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === "true";
}
