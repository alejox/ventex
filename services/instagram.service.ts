import { createClient } from "@/utils/supabase/client";

/**
 * Status of the tenant's Instagram connection, as the browser may see it.
 *
 * Only the status columns: `authenticated` has column-level SELECT on these and
 * nothing else, so asking for `access_token` would fail by design. Connecting
 * is a full-page navigation to `/api/instagram/connect` (OAuth), not a call.
 */
export interface InstagramConnection {
  username: string | null;
  tokenExpiresAt: string;
  mediaPermalinks: string[];
  mediaSyncedAt: string | null;
  lastError: string | null;
}

export const INSTAGRAM_CONNECT_PATH = "/api/instagram/connect";

const STATUS_COLUMNS = "username, token_expires_at, media_permalinks, media_synced_at, last_error";

/** Errors meaning "the migration is not applied yet": treat as not connected. */
function isMissingSchema(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202" || error?.code === "42883";
}

export async function fetchInstagramConnection(): Promise<InstagramConnection | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("instagram_connections")
    .select(STATUS_COLUMNS)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  if (!data) return null;
  return {
    username: data.username,
    tokenExpiresAt: data.token_expires_at,
    mediaPermalinks: data.media_permalinks ?? [],
    mediaSyncedAt: data.media_synced_at,
    lastError: data.last_error,
  };
}

export async function disconnectInstagram(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("disconnect_instagram");
  if (error) throw error;
}
