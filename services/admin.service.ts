import { createClient } from "@/utils/supabase/client";
import type { Plan } from "@/services/subscription.service";

// ---- Tipos del dominio del panel super admin ----
/** Empresa (tenant) con su plan, uso y ventas (RPC admin_companies). */
export interface AdminCompany {
  user_id: string;
  business_name: string | null;
  full_name: string | null;
  email: string | null;
  plan_id: string;
  plan_name: string | null;
  status: string;
  is_super_admin: boolean;
  staff_count: number;
  monthly_sales: number;
  total_sales: number;
  created_at: string;
}

/** Métricas globales de la plataforma (RPC admin_stats). */
export interface AdminStats {
  companies: number;
  monthly_sales: number;
  total_sales: number;
  staff_total: number;
  by_plan: Record<string, number>;
}

/** Cambios parametrizables de un plan. */
export interface PlanUpdateInput {
  name: string;
  max_collaborators: number;
  /** null = ilimitado. */
  max_monthly_sales: number | null;
  price: number;
}

export async function fetchCompanies(): Promise<AdminCompany[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_companies");
  if (error) throw error;
  return (data ?? []) as unknown as AdminCompany[];
}

export async function fetchStats(): Promise<AdminStats> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) throw error;
  return data as unknown as AdminStats;
}

/** Asigna/cambia el plan y estado de una empresa. */
export async function setCompanyPlan(
  userId: string,
  planId: string,
  status: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_set_plan", {
    p_user_id: userId,
    p_plan_id: planId,
    p_status: status,
  });
  if (error) throw error;
}

/** Parametriza los límites de un plan. */
export async function updatePlan(id: string, input: PlanUpdateInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_update_plan", {
    p_id: id,
    p_name: input.name,
    p_max_collaborators: input.max_collaborators,
    p_max_monthly_sales: input.max_monthly_sales as unknown as number,
    p_price: input.price,
  });
  if (error) throw error;
}

/** Reutiliza el catálogo de planes del servicio de suscripciones. */
export type { Plan };
export { fetchPlans } from "@/services/subscription.service";
