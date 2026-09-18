import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";
import { notFound } from "next/navigation";
import { fetchPublicSite, fetchOwnSitePreview } from "@/services/public-site.server";
import type { PublicSite } from "@/services/public-site.types";
import { ClasicoTemplate } from "./templates/ClasicoTemplate";
import { ModernoTemplate } from "./templates/ModernoTemplate";
import { MinimalTemplate } from "./templates/MinimalTemplate";
import { BarberModernTemplate } from "./templates/BarberModernTemplate";
import { BarberArtesanalTemplate } from "./templates/BarberArtesanalTemplate";
import { BarberUrbanaTemplate } from "./templates/BarberUrbanaTemplate";

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
  barberia: BarberModernTemplate,
  "barberia-artesanal": BarberArtesanalTemplate,
  "barberia-urbana": BarberUrbanaTemplate,
} as const;

/**
 * Resuelve el sitio de un slug para quien lo está pidiendo.
 *
 * Un visitante cualquiera solo ve sitios publicados. El DUEÑO, además, ve el
 * suyo sin publicar: sin esto, la única forma de ver cómo le quedó el diseño
 * era publicarlo — enseñárselo al mundo antes que a sí mismo.
 *
 * Se compara el slug devuelto contra el pedido a propósito. El RPC del borrador
 * no recibe slug (siempre responde el sitio del inquilino), así que sin esta
 * comparación un dueño que abra el slug ajeno `/otra-barberia` vería SU sitio
 * bajo esa URL: no se filtra nada de nadie, pero es una mentira sobre qué hay
 * en esa dirección, y es la clase de cosa que se reporta como bug de datos
 * cruzados.
 */
async function resolveSite(
  slug: string,
): Promise<{ site: PublicSite; draft: boolean } | null> {
  const publicado = await fetchPublicSite(slug);
  if (publicado) return { site: publicado, draft: false };

  const borrador = await fetchOwnSitePreview();
  if (borrador && borrador.slug === slug.trim().toLowerCase()) {
    return { site: borrador, draft: true };
  }
  return null;
}

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const resuelto = await resolveSite(slug);
  const site = resuelto?.site ?? null;

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
    // Un borrador no se indexa aunque sea alcanzable: solo lo alcanza su propio
    // dueño, pero un buscador no tiene por qué enterarse de que la URL responde.
    ...(resuelto?.draft ? { robots: { index: false, follow: false } } : {}),
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
  const resuelto = await resolveSite(slug);

  // Cubre "el slug no existe" y "el dueño todavía no lo publicó": para el mundo
  // un sitio sin publicar es un 404. Para su dueño, `resolveSite` lo devuelve
  // como borrador.
  if (!resuelto) notFound();

  const { site, draft } = resuelto;
  const Template = TEMPLATES[site.template] ?? ClasicoTemplate;

  return (
    <>
      {draft && <DraftNotice slug={site.slug} />}
      <Template site={site} />
    </>
  );
}

/**
 * Aviso de borrador.
 *
 * Va en el FLUJO, no fijo sobre el contenido: la barra se monta encima de la
 * navegación de la plantilla justo cuando el dueño está mirando si la
 * navegación le gusta. Empujar la página 40px cuesta un scroll y no tapa nada.
 */
function DraftNotice({ slug }: { slug: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#1d1b16] px-4 py-2.5 text-center text-[13px] text-[#f4f0e7]">
      <span>
        <strong className="font-semibold">Vista previa.</strong> Tu sitio todavía no está
        publicado: nadie más puede verlo.
      </span>
      {/* `prefetch={false}`: esta barra solo la ve el dueño, pero precargar el
          panel desde la página pública del negocio es tráfico que no pidió. */}
      <Link
        href="/dashboard/settings/sitio"
        prefetch={false}
        className="underline underline-offset-2 opacity-80 transition-opacity hover:opacity-100"
      >
        Volver a Ajustes
      </Link>
      <span className="sr-only">Dirección del sitio: /{slug}</span>
    </div>
  );
}
