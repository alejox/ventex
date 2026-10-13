/**
 * Enlaces de WhatsApp, puros (sin I/O): los usan las promociones del dashboard
 * y el pedido del sitio público de tienda, que no debe arrastrar el cliente de
 * Supabase a la página del visitante.
 */

/**
 * Los teléfonos se cargan como los dicta el cliente ("311 232 9185",
 * "+57 311..."), y `wa.me` no acepta espacios ni signos. Si el número viene sin
 * indicativo se le antepone el del país, porque un `wa.me/3112329185` abre un
 * chat con un número que no existe.
 */
export function whatsappNumber(phone: string | null, countryCode = "57"): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith(countryCode) && digits.length > 10) return digits;
  return `${countryCode}${digits}`;
}

/** El enlace que abre WhatsApp con el mensaje escrito. null = sin teléfono usable. */
export function whatsappLink(phone: string | null, message: string): string | null {
  const numero = whatsappNumber(phone);
  if (!numero) return null;
  // api.whatsapp.com y no wa.me: el acortador rompe los emojis, y el mensaje
  // por defecto trae uno (ver el comentario equivalente en DashboardShell).
  return `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(message)}`;
}
