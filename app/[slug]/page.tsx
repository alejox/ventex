import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPublicSite } from "@/services/public-site.server";
import { SiteTemplateRenderer } from "./templates/registry";

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

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const site = await fetchPublicSite(slug);

  if (!site) return { title: "Sitio no encontrado" };

  const description = site.config.seo.description ??
    site.headline ?? site.about ?? `Conocé los servicios de ${site.businessName} y reservá tu turno.`;
  const title = site.config.seo.title ?? site.businessName;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: site.config.seo.imageUrl ?? site.heroImageUrl
        ? [site.config.seo.imageUrl ?? site.heroImageUrl!]
        : undefined,
    },
  };
}

export default async function BusinessSitePage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const site = await fetchPublicSite(slug);

  // Covers both "no such slug" and "the owner has not published it yet": the
  // RPC filters on `published`, so an unpublished site is a 404 to the world.
  if (!site) notFound();

  return <SiteTemplateRenderer site={site} />;
}
