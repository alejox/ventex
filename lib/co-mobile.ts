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
