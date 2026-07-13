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
  /** La cuenta es un revendedor (sus créditos se gestionan desde aquí o /admin/resellers). */
  is_reseller: boolean;
  /** Estado de la licencia mensual si es cliente de revendedor; null si es cuenta directa. */
  license_status: string | null;
  /** Nombre del revendedor dueño de este cliente; null si es cuenta directa. */
  reseller_name: string | null;
  /**
   * Vencimiento del plan: la licencia si es cliente de revendedor, o el periodo
   * de la suscripción si es cuenta directa. null = sin vencimiento (plan gratis
   * o cuenta que nunca se ha recargado).
   */
  period_end: string | null;
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

/** Alta/edición de un plan. `id` null en saveePlan() => se crea. */
export interface PlanSaveInput {
  name: string;
  max_collaborators: number;
  /** null = ilimitado. */
  max_monthly_sales: number | null;
  /** Precio por mes. */
  price: number;
  /** Meses cobrados en la modalidad anual (0 = el plan no ofrece anual). */
  annual_charged_months: number;
  sort_order: number;
  is_active: boolean;
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

/**
 * Crea (id = null) o actualiza un plan. El id es el slug de la tabla `plans`,
 * inmutable una vez creado.
 */
export async function savePlan(id: string | null, input: PlanSaveInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_save_plan", {
    p_id: id,
    p_name: input.name,
    p_max_collaborators: input.max_collaborators,
    p_max_monthly_sales: input.max_monthly_sales as unknown as number,
    p_price: input.price,
    p_annual_charged_months: input.annual_charged_months,
    p_sort_order: input.sort_order,
    p_is_active: input.is_active,
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Resultado de una recarga hecha por el super admin. */
export interface AdminRechargeResult {
  period_end: string;
  months: number;
  /** true si la empresa es cliente de un revendedor (se extendió su licencia). */
  managed: boolean;
}

/**
 * Recarga meses a una empresa sin consumir créditos (el admin es la fuente).
 * Extiende la licencia si es cliente de revendedor, o el periodo de su
 * suscripción si es cuenta directa. El plan gratis no se recarga.
 */
export async function rechargeCompany(
  userId: string,
  months: number,
): Promise<AdminRechargeResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_recharge_company", {
    p_user_id: userId,
    p_months: months,
  });
  if (error) throw error;
  return data as unknown as AdminRechargeResult;
}

// ---- Revendedores ----
/** Revendedor con saldos por plan y clientes (RPC admin_resellers). */
export interface AdminReseller {
  user_id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  /** Saldo por plan, ej: { basica: 3, oro: 1 }. */
  balances: Record<string, number>;
  clients_total: number;
  clients_active: number;
  created_at: string;
}

export async function fetchResellers(): Promise<AdminReseller[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_resellers");
  if (error) throw error;
  return (data ?? []) as unknown as AdminReseller[];
}

/** Promueve (o degrada) una cuenta existente a revendedor, por email. */
export async function setResellerByEmail(email: string, value: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_set_reseller_by_email", {
    p_email: email,
    p_value: value,
  });
  if (error) throw error;
}

/** Recarga créditos de UN PLAN a un revendedor (1 crédito = 1 mes; negativo = corrección). */
export async function grantCredits(
  resellerId: string,
  planId: string,
  amount: number,
  note: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_grant_credits", {
    p_reseller_id: resellerId,
    p_plan_id: planId,
    p_amount: amount,
    p_note: note || "",
  });
  if (error) throw error;
}

// ---- Promociones de créditos (packs) ----
/** Pack de recarga parametrizable (tabla credit_packs). Precio de referencia. */
export interface CreditPack {
  id: string;
  name: string;
  plan_id: string;
  credits: number;
  bonus_credits: number;
  price: number;
  is_active: boolean;
}

export interface CreditPackInput {
  name: string;
  plan_id: string;
  credits: number;
  bonus_credits: number;
  price: number;
  is_active: boolean;
}

/** Movimiento global del ledger (RPC admin_credit_movements). */
export interface AdminCreditMovement {
  id: string;
  reseller_id: string;
  reseller_name: string | null;
  reseller_email: string | null;
  client_name: string | null;
  plan_id: string;
  delta: number;
  reason: string;
  note: string | null;
  created_at: string;
}

export async function fetchCreditPacks(): Promise<CreditPack[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("credit_packs")
    .select("id, name, plan_id, credits, bonus_credits, price, is_active")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as CreditPack[];
}

export async function saveCreditPack(
  id: string | null,
  input: CreditPackInput,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_save_credit_pack", {
    p_id: id,
    p_name: input.name,
    p_plan_id: input.plan_id,
    p_credits: input.credits,
    p_bonus_credits: input.bonus_credits,
    p_price: input.price,
    p_is_active: input.is_active,
  });
  if (error) throw error;
}

export async function deleteCreditPack(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_delete_credit_pack", { p_id: id });
  if (error) throw error;
}

/** Aplica una promoción a un revendedor (créditos + bonus en un solo grant). */
export async function applyCreditPack(resellerId: string, packId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_apply_credit_pack", {
    p_reseller_id: resellerId,
    p_pack_id: packId,
  });
  if (error) throw error;
}

export async function fetchCreditMovements(limit = 100): Promise<AdminCreditMovement[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_credit_movements", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as unknown as AdminCreditMovement[];
}

/** Reutiliza el catálogo de planes del servicio de suscripciones. */
export type { Plan };
export { fetchPlans } from "@/services/subscription.service";
