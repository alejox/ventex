/** Public origin shared by canonical metadata, robots, sitemap, and JSON-LD. */
const PRODUCTION_SITE_URL = "https://www.ventex.app";
const DEVELOPMENT_SITE_URL = "http://localhost:3000";

export function resolveSiteUrl(
  configuredUrl: string | undefined,
  environment = process.env.NODE_ENV,
): string {
  const fallback = environment === "production"
    ? PRODUCTION_SITE_URL
    : DEVELOPMENT_SITE_URL;

  if (!configuredUrl?.trim()) return fallback;

  try {
    const url = new URL(configuredUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;

    const hostname = url.hostname.toLowerCase();
    const isLoopback = hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname === "127.0.0.1"
      || hostname === "[::1]";
    if (environment === "production" && isLoopback) return fallback;

    return url.origin;
  } catch {
    return fallback;
  }
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** Absolutiza una ruta contra la base canónica. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
