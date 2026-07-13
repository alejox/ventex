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

export const PLAN_SELECT =
  "id, name, max_collaborators, max_monthly_sales, price, annual_charged_months, sort_order, is_active";

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

/** Suscripción + uso del usuario autenticado. */
export async function fetchMySubscription(): Promise<MySubscription> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("my_subscription");
  if (error) throw error;
  return data as unknown as MySubscription;
}
