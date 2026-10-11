/**
 * Pure logic behind the header's "Ver sitio web" control. A tenant can have
 * several sites ("Mis páginas"), so the header can no longer assume one: this
 * decides whether it renders nothing, a direct link, or a menu, and in which
 * order the menu lists the sites.
 */

/** The slice of `BusinessSite` this logic needs (kept structural for tests). */
export interface SiteLinkSource {
  id: string;
  slug: string;
  site_name: string | null;
  published: boolean;
}

export interface SiteLink {
  id: string;
  /** Site name, or the business name when the site has none. */
  name: string;
  /** Public path, relative to the app origin. */
  href: string;
  /** Host + path without the scheme, for display only. */
  displayUrl: string;
  published: boolean;
  /** True for the site currently open in the editor. */
  editing: boolean;
}

export type SiteLinksView =
  | { kind: "none" }
  | { kind: "single"; link: SiteLink }
  | { kind: "menu"; links: SiteLink[] };

export interface SiteLinksOptions {
  businessName: string;
  /** Canonical public origin (`SITE_URL`). */
  siteUrl: string;
  /** Site open in the editor, if any (see `editingSiteIdFrom`). */
  editingSiteId?: string | null;
}

/**
 * - No published site → `none`: there is nothing public to open (today's rule).
 * - Exactly one site, published → `single`: the direct link, unchanged.
 * - Two or more sites with at least one published → `menu`, listing every
 *   site: the one in the editor first, then published ones, then drafts, each
 *   group keeping the stored (oldest-first) order.
 */
export function siteLinksView(
  sites: readonly SiteLinkSource[],
  { businessName, siteUrl, editingSiteId = null }: SiteLinksOptions,
): SiteLinksView {
  if (!sites.some((site) => site.published)) return { kind: "none" };

  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const toLink = (site: SiteLinkSource): SiteLink => ({
    id: site.id,
    name: site.site_name?.trim() || businessName,
    href: `/${site.slug}`,
    displayUrl: `${host}/${site.slug}`,
    published: site.published,
    editing: site.id === editingSiteId,
  });

  if (sites.length === 1) return { kind: "single", link: toLink(sites[0]) };

  const rank = (site: SiteLinkSource) =>
    site.id === editingSiteId ? 0 : site.published ? 1 : 2;
  // Array.prototype.sort is stable, so each group keeps the stored order.
  const links = [...sites].sort((a, b) => rank(a) - rank(b)).map(toLink);
  return { kind: "menu", links };
}

/** The editor carries the site it edits as `?site=<id>` on `/dashboard/landing`. */
export function editingSiteIdFrom(pathname: string, search: string): string | null {
  if (pathname !== "/dashboard/landing") return null;
  return new URLSearchParams(search).get("site") || null;
}
