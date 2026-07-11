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
  price: number;
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

/** Catálogo de planes (visible para cualquier usuario autenticado). */
export async function fetchPlans(): Promise<Plan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, max_collaborators, max_monthly_sales, price, sort_order, is_active")
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
