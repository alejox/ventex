import "server-only";
import { createClient } from "@/utils/supabase/server";
import type { PublicSite } from "@/services/public-site.types";

/**
 * Reads a published micro-site by slug, server-side, for an anonymous visitor.
 *
 * Goes through the `public_site_by_slug` RPC rather than querying tables: the
 * `anon` role has no RLS policy on `products` / `staff` / `services`, and it
 * must stay that way — those tables carry purchase prices, commissions and
 * employee contact details. The RPC is SECURITY DEFINER and returns only the
 * public projection.
 *
 * Returns null when the slug does not exist or the owner has not published yet;
 * the caller turns that into a 404.
 */
export async function fetchPublicSite(slug: string): Promise<PublicSite | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("public_site_by_slug", {
    p_slug: slug,
  });

  if (error) throw error;
  return (data as PublicSite | null) ?? null;
}
