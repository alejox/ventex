import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Qué puede rastrear un buscador.
 *
 * Las áreas privadas se bloquean aunque ya redirijan a /login: el redirect
 * ocurre DESPUÉS de que el bot gastó una petición, y con cientos de rutas bajo
 * /dashboard eso es presupuesto de rastreo que no se usa en las páginas que sí
 * queremos posicionar. Bloquearlas no es seguridad —eso lo dan `proxy.ts` y las
 * policies de RLS— es economía de rastreo.
 *
 * `/api` se bloquea por la misma razón, más una propia: sus respuestas son JSON
 * y, si alguna quedara indexada, competiría con la landing por la misma marca.
 *
 * Los micrositios públicos (`/[slug]`) NO se bloquean: son páginas de negocios
 * reales con contenido propio y son parte del valor de la plataforma.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/admin",
          "/reseller",
          "/api",
          // Pantallas de sesión: no aportan nada en resultados y "Iniciar
          // sesión" compite con la landing por consultas de marca.
          "/login",
          "/register",
          "/reset-password",
          "/update-password",
          "/workspace",
          "/access-disabled",
          "/auth",
          // Página de respaldo del service worker: sin contenido real.
          "/offline",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
