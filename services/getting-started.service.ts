import { createClient } from "@/utils/supabase/client";
import { SERVICE_UNIT } from "@/services/inventory.service";
import type { BusinessProfile } from "@/services/settings.service";
import type { GettingStartedFacts } from "@/lib/getting-started";

/**
 * Los hechos que deciden si cada paso de "Primeros pasos" está hecho.
 *
 * Son SIETE consultas de existencia (`limit(1)`, solo el id) en paralelo: no
 * se cuenta nada ni se trae ningún catálogo. Y se piden solo mientras el
 * checklist está visible; una vez completo u oculto, el panel no vuelve a
 * preguntar (ver `GettingStarted`).
 *
 * Una consulta que falla cuenta como paso HECHO: es preferible no insistir con
 * un paso de más a mostrar como pendiente algo que quizás ya se hizo.
 */
export async function fetchGettingStartedFacts(): Promise<GettingStartedFacts> {
  const supabase = createClient();
  const [products, services, staff, distributors, sales, sites, settings] = await Promise.all([
    // Las filas viejas con unidad "Servicio" no son productos (ver catálogo).
    supabase.from("products").select("id").neq("unit", SERVICE_UNIT).limit(1),
    supabase.from("services").select("id").limit(1),
    supabase.from("staff").select("id").limit(1),
    supabase.from("distributors").select("id").limit(1),
    supabase.from("sales").select("id").limit(1),
    supabase.from("business_sites").select("id").eq("published", true).limit(1),
    // `settings` se crea perezosamente: sin fila, el negocio no configuró nada.
    // `*` y no la lista de columnas: antes de la migración de
    // `payment_methods_configured_at`, pedirla por nombre haría fallar la
    // consulta entera y daría por hechos también los datos del negocio.
    supabase.from("settings").select("*").limit(1).maybeSingle(),
  ]);

  const exists = (r: { data: unknown[] | null; error: unknown }) => (r.error ? true : (r.data ?? []).length > 0);

  const profile = (settings.data?.business_profile ?? {}) as BusinessProfile;
  const paymentsAt = (settings.data as { payment_methods_configured_at?: string | null } | null)
    ?.payment_methods_configured_at;

  return {
    hasProduct: exists(products),
    hasService: exists(services),
    hasStaff: exists(staff),
    hasDistributor: exists(distributors),
    hasSale: exists(sales),
    sitePublished: exists(sites),
    businessConfigured: settings.error
      ? true
      : Boolean(profile.taxResponsibility || profile.identificationNumber),
    paymentMethodsConfigured: settings.error ? true : (paymentsAt ?? null) !== null,
  };
}
