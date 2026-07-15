/**
 * Canal de contacto de la plataforma. Los cambios de plan no se cobran dentro
 * de la app: el usuario escribe por WhatsApp y el super admin (o su revendedor)
 * le recarga la licencia desde el panel.
 */

/** Número en formato internacional sin "+" ni espacios (lo exige wa.me). */
export const VENTEX_WHATSAPP = "573112329185";

/** Enlace wa.me con el mensaje ya redactado. */
export function whatsappUrl(message: string, phone: string = VENTEX_WHATSAPP): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
