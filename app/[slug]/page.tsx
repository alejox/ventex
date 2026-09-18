import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site";
import { notFound } from "next/navigation";
import { fetchPublicSite } from "@/services/public-site.server";
import { ClasicoTemplate } from "./templates/ClasicoTemplate";
import { ModernoTemplate } from "./templates/ModernoTemplate";
import { MinimalTemplate } from "./templates/MinimalTemplate";

/**
 * A business's public micro-site, served at the site root: /<slug>.
 *
 * Root-level dynamic segment, so it sits next to /dashboard, /admin, /login and
 * friends. Next resolves static segments before dynamic ones, so those routes
 * always win; the reserved-slug CHECK on business_sites stops a tenant from
 * claiming one anyway.
 *
 * `params` is a Promise in this Next version — it must be awaited.
 */

const TEMPLATES = {
  clasico: ClasicoTemplate,
  moderno: ModernoTemplate,
  minimal: MinimalTemplate,
} as const;

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const site = await fetchPublicSite(slug);

  // Un sitio inexistente NO debe indexarse: sin esto, cada slug tipeado mal
  // que alguien enlace se convierte en una página "Sitio no encontrado"
  // indexable, y decenas de esas diluyen la calidad percibida del dominio.
  if (!site) return { title: "Sitio no encontrado", robots: { index: false, follow: false } };

  const description =
    site.headline ?? site.about ?? `Conocé los servicios de ${site.businessName} y reservá tu turno.`;

  /**
   * El título lleva la intención, no solo el nombre. Nadie busca "labarbe":
   * buscan "reservar turno labarbe" o "labarbe servicios". El sufijo se agrega
   * SOLO si el negocio tiene reservas activas — prometer una reserva que la
   * página no ofrece es la clase de desajuste entre título y contenido que
   * dispara pogo-sticking y termina bajando la posición.
   */
  const titulo = site.bookingEnabled
    ? `${site.businessName} — Reserva tu turno online`
    : `${site.businessName} — Servicios y contacto`;

  return {
    title: titulo,
    description,
    // Canónica propia: estos micrositios entran al sitemap, y sin canónica
    // cualquier variante con parámetros (campañas, enlaces de WhatsApp) compite
    // consigo misma por la misma consulta.
    alternates: { canonical: `/${slug}` },
    openGraph: {
      type: "website",
      locale: "es_CO",
      siteName: site.businessName,
      url: absoluteUrl(`/${slug}`),
      title: titulo,
      description,
      images: site.heroImageUrl ? [site.heroImageUrl] : undefined,
    },
    twitter: {
      card: site.heroImageUrl ? "summary_large_image" : "summary",
      title: titulo,
      description,
      images: site.heroImageUrl ? [site.heroImageUrl] : undefined,
    },
  };
}

export default async function BusinessSitePage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const site = await fetchPublicSite(slug);

  // Covers both "no such slug" and "the owner has not published it yet": the
  // RPC filters on `published`, so an unpublished site is a 404 to the world.
  if (!site) notFound();

  const Template = TEMPLATES[site.template] ?? ClasicoTemplate;
  return <Template site={site} />;
}
