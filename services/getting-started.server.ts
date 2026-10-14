import "server-only";
import { createClient } from "@/utils/supabase/server";
import { fetchProfileServer } from "@/services/profile.server";
import { SERVICE_UNIT } from "@/services/inventory.service";
import type { BusinessProfile } from "@/services/settings.service";
import {
  landingPathFor,
  needsLandingFacts,
  POS_PATH,
  type LandingFacts,
} from "@/lib/getting-started";

/**
 * Los hechos que deciden el aterrizaje, leídos en el servidor.
 *
 * Son las mismas consultas de existencia que `fetchGettingStartedFacts`
 * (`services/getting-started.service.ts`), recortadas a las tres que importan,
 * y con el mismo criterio: una consulta que falla cuenta como paso HECHO.
 */
async function fetchLandingFactsServer(): Promise<LandingFacts> {
  const supabase = await createClient();
  const [products, services, settings] = await Promise.all([
    // Las filas viejas con unidad "Servicio" no son productos (ver catálogo).
    supabase.from("products").select("id").neq("unit", SERVICE_UNIT).limit(1),
    supabase.from("services").select("id").limit(1),
    // `settings` se crea perezosamente: sin fila, el negocio no configuró nada.
    supabase.from("settings").select("business_profile").limit(1).maybeSingle(),
  ]);

  const exists = (r: { data: unknown[] | null; error: unknown }) => (r.error ? true : (r.data ?? []).length > 0);
  const profile = (settings.data?.business_profile ?? {}) as BusinessProfile;

  return {
    hasProduct: exists(products),
    hasService: exists(services),
    businessConfigured: settings.error
      ? true
      : Boolean(profile.taxResponsibility || profile.identificationNumber),
  };
}

/**
 * A dónde va quien acaba de iniciar sesión (correo o Google). La regla vive en
 * `landingPathFor`; acá solo se juntan los datos.
 *
 * Cualquier error cae al POS, el destino de siempre: decidir el aterrizaje
 * nunca puede romper un login ni dejar a un dueño atrapado en el Panel.
 * Sin sesión devuelve `null` (quien llama manda a `/login`).
 */
export async function resolveLandingPath(): Promise<string | null> {
  try {
    const profile = await fetchProfileServer();
    if (!profile) return null;
    const facts = needsLandingFacts(profile) ? await fetchLandingFactsServer() : null;
    return landingPathFor(profile, facts);
  } catch (error) {
    console.error("resolveLandingPath failed", error);
    return POS_PATH;
  }
}
