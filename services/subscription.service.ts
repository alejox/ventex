import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de suscripciones ----
export type PlanId = "gratis" | "basica" | "oro" | (string & {});
export type SubscriptionStatus = "active" | "past_due" | "cancelled";

/** Definición parametrizable de un plan (tabla public.plans). */
export interface Plan {
  id: string;
  name: string;
  max_collaborators: number;
  /** null = ilimitado. */
  max_monthly_sales: number | null;
  /** Precio por mes. */
  price: number;
  /**
   * Meses que se cobran en la modalidad anual (de los 12 que se entregan).
   * 10 = paga 10, recibe 12 (2 de regalo). 0 = el plan no ofrece anual.
   * El precio anual NO se almacena: se deriva de `price` (ver config/plans.ts).
   */
  annual_charged_months: number;
  sort_order: number;
  is_active: boolean;
}

/** Resumen del plan del usuario actual + uso del periodo (RPC my_subscription). */
export interface MySubscription {
  plan_id: string;
  plan_name: string;
  status: SubscriptionStatus;
  max_collaborators: number;
  max_monthly_sales: number | null;
  price: number;
  started_at: string | null;
  staff_count: number;
  monthly_sales: number;
}

/**
 * Tiempo (duración) que ofrece un plan: mensual, trimestral, semestral, anual…
 * El precio es libre por tiempo, y `months` son los meses que ENTREGA — pueden
 * ser más de los que sugiere el nombre (ej: "Semestral" que regala uno y entrega
 * 7). `credits` es lo que le cuesta al revendedor recargarlo.
 */
export interface PlanPeriod {
  id: string;
  plan_id: string;
  name: string;
  months: number;
  price: number;
  credits: number;
  is_active: boolean;
  sort_order: number;
}

export const PLAN_SELECT =
  "id, name, max_collaborators, max_monthly_sales, price, annual_charged_months, sort_order, is_active";

export const PLAN_PERIOD_SELECT =
  "id, plan_id, name, months, price, credits, is_active, sort_order";

/** Catálogo de planes (visible para cualquier usuario autenticado). */
export async function fetchPlans(): Promise<Plan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plans")
    .select(PLAN_SELECT)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Plan[];
}

/** Tiempos de todos los planes, ordenados para mostrarlos tal cual. */
export async function fetchPlanPeriods(): Promise<PlanPeriod[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plan_periods")
    .select(PLAN_PERIOD_SELECT)
    .order("plan_id")
    .order("sort_order")
    .order("months");
  if (error) throw error;
  return (data ?? []) as PlanPeriod[];
}

/** Suscripción + uso del usuario autenticado. */
export async function fetchMySubscription(): Promise<MySubscription> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("my_subscription");
  if (error) throw error;
  return data as unknown as MySubscription;
}
