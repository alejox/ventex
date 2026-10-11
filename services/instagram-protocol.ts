import { randomBytes, timingSafeEqual } from "crypto";
import { MAX_INSTAGRAM_POSTS, instagramPostUrl } from "@/lib/instagram";

/**
 * Instagram API with Instagram Login (business login): the PURE parts, with no
 * network and no `server-only`, so they are testable without Meta
 * (`tests/instagram-protocol.test.ts`). `services/instagram.server.ts` does the
 * I/O and stores the result.
 *
 * Every parser fails closed: an unexpected or missing field returns null and the
 * caller treats it as an error. A partial token must never be stored.
 */

export const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const INSTAGRAM_SHORT_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const INSTAGRAM_GRAPH_URL = "https://graph.instagram.com";
/** Read-only: profile and media. Nothing is ever published on the owner's behalf. */
export const INSTAGRAM_SCOPE = "instagram_business_basic";
export const INSTAGRAM_CALLBACK_PATH = "/api/instagram/callback";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Instagram refuses to refresh a token younger than 24 hours. */
const MIN_TOKEN_AGE_MS = DAY_MS;
/** Long-lived tokens last ~60 days; refresh once fewer than 20 remain. */
const REFRESH_WINDOW_MS = 20 * DAY_MS;

export interface AuthorizeParams {
  appId: string;
  redirectUri: string;
  state: string;
}

export function buildAuthorizeUrl({ appId, redirectUri, state }: AuthorizeParams): string {
  const url = new URL(INSTAGRAM_AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * The redirect URI must match the one registered in the Meta app EXACTLY, and
 * the same string has to be sent again when exchanging the code.
 */
export function instagramRedirectUri(siteUrl: string): string {
  return `${siteUrl.trim().replace(/\/+$/, "")}${INSTAGRAM_CALLBACK_PATH}`;
}

/** Instagram appends `#_` to the code in some redirects; it is not part of it. */
export function cleanAuthorizationCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().replace(/#_$/, "");
  return code ? code : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Instagram ids are large integers; JSON may deliver them as number or string. */
function idString(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface ShortLivedToken {
  accessToken: string;
  userId: string;
}

/**
 * `POST api.instagram.com/oauth/access_token`. Documented as a flat object, but
 * some responses wrap it in `data: [ … ]`, so both shapes are accepted.
 */
export function parseShortLivedToken(body: unknown): ShortLivedToken | null {
  let record = asRecord(body);
  if (record && Array.isArray(record.data)) record = asRecord(record.data[0]);
  if (!record) return null;
  const accessToken = nonEmptyString(record.access_token);
  const userId = idString(record.user_id);
  if (!accessToken || !userId) return null;
  return { accessToken, userId };
}

export interface LongLivedToken {
  accessToken: string;
  expiresAt: Date;
}

export function expiresAtFrom(expiresInSeconds: number, now: Date): Date {
  return new Date(now.getTime() + expiresInSeconds * 1000);
}

/**
 * `GET graph.instagram.com/access_token` (exchange) and
 * `GET graph.instagram.com/refresh_access_token` (refresh) share this shape:
 * `{ access_token, token_type, expires_in }`.
 */
export function parseLongLivedToken(body: unknown, now: Date): LongLivedToken | null {
  const record = asRecord(body);
  if (!record) return null;
  const accessToken = nonEmptyString(record.access_token);
  const expiresIn = record.expires_in;
  if (!accessToken) return null;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return { accessToken, expiresAt: expiresAtFrom(expiresIn, now) };
}

export interface InstagramProfile {
  userId: string;
  username: string | null;
}

/** `GET graph.instagram.com/me?fields=user_id,username`. */
export function parseProfile(body: unknown): InstagramProfile | null {
  const record = asRecord(body);
  if (!record) return null;
  const userId = idString(record.user_id);
  if (!userId) return null;
  return { userId, username: nonEmptyString(record.username) };
}

/**
 * Should the cron refresh this token now?
 *
 * Yes when it is at least 24h old (Instagram's own rule) AND expires within the
 * refresh window. An expired token cannot be refreshed: false, and the owner has
 * to reconnect. Invalid dates fail closed (false).
 */
export function needsRefresh(refreshedAt: Date, expiresAt: Date, now: Date): boolean {
  const issued = refreshedAt.getTime();
  const expires = expiresAt.getTime();
  const current = now.getTime();
  if (![issued, expires, current].every(Number.isFinite)) return false;
  if (expires <= current) return false;
  if (current - issued < MIN_TOKEN_AGE_MS) return false;
  return expires - current <= REFRESH_WINDOW_MS;
}

/**
 * `GET graph.instagram.com/me/media` → canonical permalinks in feed order.
 *
 * The permalinks end up on a public page, so each one goes through the same
 * `instagramPostUrl` filter as a link the owner pastes by hand. Returns null
 * when the response has no `data` array (an error, not "no posts").
 */
export function mediaPermalinks(body: unknown): string[] | null {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.data)) return null;
  const urls = record.data.flatMap((item) => {
    const permalink = asRecord(item)?.permalink;
    const url = typeof permalink === "string" ? instagramPostUrl(permalink) : null;
    return url ? [url] : [];
  });
  return [...new Set(urls)].slice(0, MAX_INSTAGRAM_POSTS);
}

// ---------------------------------------------------------------------------
// OAuth state (CSRF) cookie
// ---------------------------------------------------------------------------

export const INSTAGRAM_STATE_COOKIE = "ig_oauth_state";
/** Ten minutes: enough to log in to Instagram, short enough to not linger. */
export const INSTAGRAM_STATE_MAX_AGE_SECONDS = 600;

export function newOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The cookie binds the state to the tenant that started the flow, so a code
 * that comes back after a workspace switch cannot land on another business.
 */
export function stateCookieValue(state: string, tenantId: string): string {
  return `${state}.${tenantId}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Constant-time check of the `state` query param against the cookie. */
export function verifyOAuthState(
  cookie: string | null | undefined,
  state: string | null | undefined,
  tenantId: string,
): boolean {
  if (!cookie || !state || !tenantId) return false;
  return safeEqual(cookie, stateCookieValue(state, tenantId));
}

// ---------------------------------------------------------------------------
// Back to the site editor
// ---------------------------------------------------------------------------

/** Remembers which site the owner was editing while they visit Instagram. */
export const INSTAGRAM_RETURN_COOKIE = "ig_oauth_site";

const SITE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InstagramConnectResult =
  | "connected"
  | "denied"
  | "error"
  | "forbidden"
  | "unconfigured";

/** A site id only if it looks like one; anything else is dropped. */
export function returnSiteId(value: string | null | undefined): string | null {
  return value && SITE_ID_RE.test(value) ? value : null;
}

/**
 * Where the OAuth round trip lands: the editor of the site the owner came from
 * (Secciones tab, where the Instagram controls live), or the sites list.
 */
export function editorReturnPath(result: InstagramConnectResult, siteId: string | null | undefined): string {
  const params = new URLSearchParams();
  const site = returnSiteId(siteId);
  if (site) {
    params.set("site", site);
    params.set("tab", "sections");
  }
  params.set("instagram", result);
  return `/dashboard/landing?${params.toString()}`;
}
