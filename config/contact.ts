/**
 * Canal de contacto de la plataforma. Los cambios de plan no se cobran dentro
 * de la app: el usuario escribe por WhatsApp y el super admin (o su revendedor)
 * le recarga la licencia desde el panel.
 */

/** Número en formato internacional sin "+" ni espacios (lo exige wa.me). */
export const VENTEX_WHATSAPP = "573334328530";

/**
 * Normaliza un teléfono a lo que exige wa.me: solo dígitos, con código de país.
 *
 * Hace falta porque los teléfonos de clientes NO se guardan normalizados: el
 * dueño los escribe a mano y el micrositio público pide "tu celular" sin
 * imponer formato. Un celular colombiano se escribe casi siempre como 10
 * dígitos empezando en 3 y, tal cual, `wa.me/3001234567` no abre ningún chat.
 *
 * Devuelve null cuando no hay suficientes dígitos para ser un número real, para
 * que quien llame pueda ocultar el botón en vez de ofrecer un enlace roto.
 */
export function toWhatsappNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits.length >= 10 ? digits : null;
}

/** Enlace wa.me con el mensaje ya redactado. */
export function whatsappUrl(message: string, phone: string = VENTEX_WHATSAPP): string {
  return `https://wa.me/${toWhatsappNumber(phone) ?? phone}?text=${encodeURIComponent(message)}`;
}
