/**
 * URL canónica del sitio, en un solo lugar.
 *
 * La necesitan tres cosas que tienen que coincidir o Google las toma como
 * señales contradictorias: el `metadataBase` (del que cuelgan canónicas y
 * OpenGraph), el `Sitemap:` del robots.txt y las URLs del sitemap.
 *
 * Se lee de `NEXT_PUBLIC_SITE_URL`, la misma variable que ya usan los correos de
 * Supabase y ePayco: tener DOS nociones de "cuál es mi dominio" es la forma
 * clásica de terminar con canónicas apuntando a un host y sitemap a otro.
 *
 * El fallback es localhost a propósito y NO un dominio de producción inventado:
 * si la variable falta en el deploy, es mejor que las canónicas apunten a algo
 * obviamente roto —y se note en el primer rastreo— a que apunten a un dominio
 * plausible pero equivocado, que es un error silencioso y caro de revertir.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

/** Absolutiza una ruta contra la base canónica. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
