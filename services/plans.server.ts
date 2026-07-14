import { createClient } from "@supabase/supabase-js";
import {
  PLAN_SELECT,
  PLAN_PERIOD_SELECT,
  type Plan,
  type PlanPeriod,
} from "@/services/subscription.service";
import type { Database } from "@/utils/supabase/database.types";

/**
 * Planes activos para la landing pública. Usa un cliente anónimo SIN cookies (a
 * diferencia de utils/supabase/server.ts) a propósito: leer cookies volvería
 * dinámica la página, y el catálogo es el mismo para todo el mundo. Así la
 * landing se prerenderiza y se revalida cada pocos minutos.
 *
 * Requiere la política `plans_public_read` (SELECT anónimo de planes activos).
 */
export async function fetchPublicPlans(): Promise<Plan[]> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from("plans")
    .select(PLAN_SELECT)
    .eq("is_active", true)
    .order("sort_order");

  // Fail-soft: la landing es pública y no debe caerse por la consulta de
  // precios (BD inaccesible o migración pendiente). Sin datos, la sección de
  // precios simplemente no se renderiza.
  if (error) {
    console.error("No se pudo cargar el catálogo de planes:", error.message);
    return [];
  }
  return (data ?? []) as Plan[];
}

/** Tiempos vendibles de los planes (mismo criterio fail-soft que arriba). */
export async function fetchPublicPlanPeriods(): Promise<PlanPeriod[]> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from("plan_periods")
    .select(PLAN_PERIOD_SELECT)
    .eq("is_active", true)
    .order("sort_order")
    .order("months");

  if (error) {
    console.error("No se pudieron cargar los tiempos de plan:", error.message);
    return [];
  }
  return (data ?? []) as PlanPeriod[];
}
