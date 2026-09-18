import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap del sitio.
 *
 * Solo las páginas de VENTEX. Los micrositios de los clientes (`/[slug]`) NO
 * entran, y la razón es de posicionamiento, no de capricho: un sitemap es una
 * declaración de "estas son las páginas que definen mi sitio". Listar cientos
 * de páginas de barberías y tiendas le diría a Google que el dominio trata de
 * barberías y tiendas — justo lo contrario de lo que queremos posicionar, que
 * es "sistema POS".
 *
 * Además se llevarían el presupuesto de rastreo que tiene que ir a la landing.
 * Esas páginas siguen siendo indexables y accesibles; simplemente se descubren
 * por los enlaces que cada negocio comparte, que es de donde les llega su
 * tráfico real.
 */
export const revalidate = 86400;

export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: ahora, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacidad`, lastModified: ahora, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terminos`, lastModified: ahora, changeFrequency: "yearly", priority: 0.3 },
  ];
}
