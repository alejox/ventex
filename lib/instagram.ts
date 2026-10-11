/**
 * Instagram posts on the public site: from whatever link the owner pastes to a
 * canonical permalink that Instagram's `embed.js` can render.
 *
 * SECURITY: the owner types this value and it ends up on a PUBLIC page (inside
 * `data-instgrm-permalink`, which embed.js turns into an iframe). Nothing from
 * the raw input is echoed back: only a known kind and a shortcode restricted to
 * `[A-Za-z0-9_-]` survive, and the URL is rebuilt from scratch.
 */

/**
 * Where the site's Instagram posts come from: links the owner pasted
 * (`manual`) or the latest posts of the connected account (`account`, cached
 * server-side by `/api/instagram/sync`). The manual list is kept either way.
 */
export type InstagramSource = "manual" | "account";

export function instagramSource(value: unknown): InstagramSource {
  return value === "account" ? "account" : "manual";
}

/** How many posts a site can show. Kept small: each one is a full iframe. */
export const MAX_INSTAGRAM_POSTS = 6;

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const POST_KINDS = new Set(["p", "reel", "tv"]);
const SHORTCODE_RE = /^[A-Za-z0-9_-]+$/;

/**
 * @returns `https://www.instagram.com/<p|reel|tv>/<shortcode>/`, or null when
 *   the text is not a link to a single Instagram post.
 */
export function instagramPostUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Without a scheme `URL` cannot parse it; "instagram.com/p/x" means https.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value.replace(/^\/+/, "")}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  if (!INSTAGRAM_HOSTS.has(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  // Either /<kind>/<id> or /<username>/<kind>/<id> (Instagram's share links
  // sometimes include the account).
  const [kind, shortcode] =
    segments.length === 2 ? segments : segments.length === 3 ? segments.slice(1) : [];
  if (!kind || !shortcode) return null;
  if (!POST_KINDS.has(kind) || !SHORTCODE_RE.test(shortcode)) return null;

  return `https://www.instagram.com/${kind}/${shortcode}/`;
}

/** Valid canonical links from persisted JSON, without duplicates, capped. */
export function instagramPostList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value.flatMap((item) => {
    const url = typeof item === "string" ? instagramPostUrl(item) : null;
    return url ? [url] : [];
  });
  return [...new Set(urls)].slice(0, MAX_INSTAGRAM_POSTS);
}
