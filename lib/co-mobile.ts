/**
 * Celular colombiano: 10 dígitos que empiezan en 3, con o sin +57 delante.
 *
 * Devuelve los 10 dígitos limpios, o null si no es un celular válido. Lo usa el
 * widget público de reservas para no dejar pasar un número con el que el
 * negocio después no puede escribirle al cliente por WhatsApp.
 */
export function normalizeColombianMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) digits = digits.slice(2);
  return /^3\d{9}$/.test(digits) ? digits : null;
}

/**
 * Clave con la que se busca a un cliente por teléfono: solo dígitos, los
 * últimos 10. Así "+57 300 123 4567" (un cliente creado desde el panel) y
 * "3001234567" (uno del sitio) dan lo mismo. Null con menos de 7 dígitos.
 *
 * Espejo de `public_site_find_appointments` / `public_site_cancel_appointment`
 * (migración 20261101100000): si cambia uno, cambia el otro.
 */
export function phoneLookupKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}
