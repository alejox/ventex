import { normalizeColombianMobile } from "@/lib/co-mobile";

/**
 * Celular colombiano agrupado como se dicta: "300 123 4567".
 *
 * Acepta lo que haya escrito el visitante (con +57, guiones, paréntesis). Si no
 * es un celular válido devuelve el texto tal cual, recortado: mostrar un número
 * reformateado a medias sería peor que mostrar el que escribió.
 */
export function formatColombianMobile(raw: string): string {
  const mobile = normalizeColombianMobile(raw);
  if (!mobile) return raw.trim();
  return `${mobile.slice(0, 3)} ${mobile.slice(3, 6)} ${mobile.slice(6)}`;
}
