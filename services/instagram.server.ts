import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  INSTAGRAM_GRAPH_URL,
  INSTAGRAM_SHORT_TOKEN_URL,
  instagramRedirectUri,
  mediaPermalinks,
  needsRefresh,
  parseLongLivedToken,
  parseProfile,
  parseShortLivedToken,
} from "@/services/instagram-protocol";

/**
 * Instagram I/O: token exchange, refresh and media fetch, persisted with the
 * service-role client because `authenticated` cannot write (or even read the
 * token of) `instagram_connections`.
 *
 * NEVER log or store in `last_error` anything that could carry a token or the
 * app secret: request URLs include `access_token`, so errors here only carry a
 * step name and an HTTP status.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const MEDIA_FIELDS = "id,permalink,media_type,timestamp";
const MEDIA_LIMIT = 12;

export interface InstagramAppConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/** null when the Meta app is not configured: the routes degrade with a message. */
export function instagramAppConfig(fallbackOrigin: string): InstagramAppConfig | null {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || fallbackOrigin;
  return { appId, appSecret, redirectUri: instagramRedirectUri(site) };
}

/** Error with a step name only — safe to log and to show (in Spanish) to the owner. */
export class InstagramSyncError extends Error {
  constructor(
    readonly step: "token" | "long_token" | "refresh" | "profile" | "media" | "expired" | "store",
    readonly status?: number,
  ) {
    super(`instagram ${step} failed${status ? ` (HTTP ${status})` : ""}`);
    this.name = "InstagramSyncError";
  }
}

const OWNER_MESSAGES: Record<InstagramSyncError["step"], string> = {
  token: "Instagram no aceptó la autorización. Intenta conectar de nuevo.",
  long_token: "Instagram no entregó un acceso duradero. Intenta conectar de nuevo.",
  refresh: "No se pudo renovar el acceso a Instagram. Si sigue fallando, vuelve a conectar la cuenta.",
  profile: "No se pudo leer el perfil de Instagram.",
  media: "No se pudieron traer las publicaciones de Instagram.",
  expired: "El acceso a Instagram venció. Vuelve a conectar la cuenta.",
  store: "No se pudo guardar la conexión con Instagram.",
};

function ownerMessage(error: unknown): string {
  return error instanceof InstagramSyncError
    ? OWNER_MESSAGES[error.step]
    : "Error inesperado al sincronizar Instagram.";
}

async function requestJson(
  step: InstagramSyncError["step"],
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new InstagramSyncError(step);
  }
  if (!response.ok) throw new InstagramSyncError(step, response.status);
  try {
    return await response.json();
  } catch {
    throw new InstagramSyncError(step, response.status);
  }
}

function graphUrl(path: string, params: Record<string, string>): string {
  const url = new URL(path, INSTAGRAM_GRAPH_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function fetchMedia(accessToken: string): Promise<string[]> {
  const body = await requestJson(
    "media",
    graphUrl("/me/media", { fields: MEDIA_FIELDS, limit: String(MEDIA_LIMIT), access_token: accessToken }),
  );
  const permalinks = mediaPermalinks(body);
  if (!permalinks) throw new InstagramSyncError("media");
  return permalinks;
}

/**
 * OAuth callback: code → short-lived token → long-lived token → profile →
 * media, then one upsert for the tenant. Nothing is stored unless both tokens
 * and the profile parsed; a media failure still stores the connection and
 * records it in `last_error` so the cron retries.
 */
export async function connectInstagramAccount(
  tenantId: string,
  code: string,
  config: InstagramAppConfig,
  now: Date = new Date(),
): Promise<void> {
  const form = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const short = parseShortLivedToken(
    await requestJson("token", INSTAGRAM_SHORT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }),
  );
  if (!short) throw new InstagramSyncError("token");

  const long = parseLongLivedToken(
    await requestJson(
      "long_token",
      graphUrl("/access_token", {
        grant_type: "ig_exchange_token",
        client_secret: config.appSecret,
        access_token: short.accessToken,
      }),
    ),
    now,
  );
  if (!long) throw new InstagramSyncError("long_token");

  const profile = parseProfile(
    await requestJson("profile", graphUrl("/me", { fields: "user_id,username", access_token: long.accessToken })),
  );
  if (!profile) throw new InstagramSyncError("profile");

  let permalinks: string[] = [];
  let lastError: string | null = null;
  let syncedAt: string | null = now.toISOString();
  try {
    permalinks = await fetchMedia(long.accessToken);
  } catch (error) {
    lastError = ownerMessage(error);
    syncedAt = null;
  }

  const { error } = await createAdminClient()
    .from("instagram_connections")
    .upsert(
      {
        user_id: tenantId,
        ig_user_id: profile.userId,
        username: profile.username,
        access_token: long.accessToken,
        token_expires_at: long.expiresAt.toISOString(),
        token_refreshed_at: now.toISOString(),
        media_permalinks: permalinks,
        media_synced_at: syncedAt,
        last_error: lastError,
      },
      { onConflict: "user_id" },
    );
  if (error) throw new InstagramSyncError("store");
}

export interface SyncSummary {
  total: number;
  synced: number;
  refreshed: number;
  failed: number;
}

/**
 * Daily cron: refresh tokens that need it and re-fetch media for every
 * connection. One failing account records its own `last_error` and never
 * aborts the rest.
 */
export async function syncAllConnections(now: Date = new Date()): Promise<SyncSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("instagram_connections")
    .select("user_id, access_token, token_expires_at, token_refreshed_at");
  if (error) throw new InstagramSyncError("store");

  const summary: SyncSummary = { total: data.length, synced: 0, refreshed: 0, failed: 0 };

  for (const row of data) {
    try {
      const expiresAt = new Date(row.token_expires_at);
      if (!(expiresAt.getTime() > now.getTime())) throw new InstagramSyncError("expired");

      let accessToken = row.access_token;
      if (needsRefresh(new Date(row.token_refreshed_at), expiresAt, now)) {
        const refreshed = parseLongLivedToken(
          await requestJson(
            "refresh",
            graphUrl("/refresh_access_token", { grant_type: "ig_refresh_token", access_token: accessToken }),
          ),
          now,
        );
        if (!refreshed) throw new InstagramSyncError("refresh");
        // Persist the new token BEFORE fetching media: a media failure must not
        // throw away a token Instagram already rotated.
        const { error: tokenError } = await admin
          .from("instagram_connections")
          .update({
            access_token: refreshed.accessToken,
            token_expires_at: refreshed.expiresAt.toISOString(),
            token_refreshed_at: now.toISOString(),
          })
          .eq("user_id", row.user_id);
        if (tokenError) throw new InstagramSyncError("store");
        accessToken = refreshed.accessToken;
        summary.refreshed += 1;
      }

      const permalinks = await fetchMedia(accessToken);
      const { error: updateError } = await admin
        .from("instagram_connections")
        .update({ media_permalinks: permalinks, media_synced_at: now.toISOString(), last_error: null })
        .eq("user_id", row.user_id);
      if (updateError) throw new InstagramSyncError("store");
      summary.synced += 1;
    } catch (failure) {
      summary.failed += 1;
      console.warn(
        "[instagram] sync failed for one connection:",
        failure instanceof InstagramSyncError ? failure.message : "unexpected error",
      );
      // Best effort: if even this write fails, the next run tries again.
      await admin
        .from("instagram_connections")
        .update({ last_error: ownerMessage(failure) })
        .eq("user_id", row.user_id);
    }
  }

  return summary;
}
