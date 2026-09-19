import "server-only";
import { createClient } from "@/utils/supabase/server";
import { normalizeLandingConfig } from "@/services/public-site.types";
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
  if (!data || typeof data !== "object") return null;
  const raw = data as unknown as Record<string, unknown>;
  return {
    ...raw,
    config: normalizeLandingConfig(raw),
  } as unknown as PublicSite;
}

/**
 * El MISMO sitio, pero visto por su dueño y sin exigir `published`.
 *
 * Existe porque el selector de plantillas obligaba a elegir a ciegas: el enlace
 * al sitio solo aparecía con el sitio ya publicado, así que la única forma de
 * ver cómo quedaba era publicarlo primero. Publicar para mirar es el orden al
 * revés.
 *
 * No recibe slug: el RPC resuelve el inquilino por `get_effective_user_id()` y
 * devuelve su única fila de `business_sites`. Un slug como parámetro sería algo
 * que alguien puede cambiar, y la respuesta correcta es siempre la misma.
 *
 * Devuelve null para un visitante anónimo y para un inquilino que todavía no
 * creó su sitio.
 */
export async function fetchOwnSitePreview(): Promise<PublicSite | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("own_site_preview");

  // Un fallo acá NO debe tumbar la página: esta función corre como respaldo de
  // `fetchPublicSite`, y el camino que importa —el visitante que ve un sitio
  // publicado— no pasa por acá. Romper el 404 de un slug inexistente por un
  // error de permisos sería cambiar un problema de nadie por uno de todos.
  if (error) return null;
  return (data as PublicSite | null) ?? null;
}
