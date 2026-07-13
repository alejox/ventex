import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio del panel revendedor ----
/** Estado de la licencia mensual de un cliente de revendedor. */
export type LicenseStatus = "pending" | "active" | "expired" | "suspended";

/** Cliente del revendedor con su plan y licencia (RPC reseller_clients). */
export interface ResellerClient {
  user_id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  plan_id: string;
  plan_name: string | null;
  license_status: LicenseStatus;
  activated_at: string | null;
  period_end: string | null;
  created_at: string;
}

/** Métricas del revendedor (RPC reseller_stats). Los créditos son POR PLAN. */
export interface ResellerStats {
  /** Saldo por plan, ej: { basica: 3, oro: 1 }. */
  balances: Record<string, number>;
  clients_total: number;
  clients_active: number;
  clients_pending: number;
  clients_expired: number;
  clients_suspended: number;
  consumed_this_month: number;
}

/** Movimiento del ledger de créditos (tabla reseller_credits, RLS: solo propios). */
export interface CreditMovement {
  id: string;
  plan_id: string;
  delta: number;
  reason: "grant" | "consume" | "adjust";
  note: string | null;
  created_at: string;
}

/** Datos para el alta de un cliente (Edge Function reseller-create-client). */
export interface NewClientInput {
  email: string;
  password: string;
  full_name: string;
  business_name?: string;
  business_type?: string | null;
  /** Plan del cliente; el crédito se consumirá del bolsillo de este plan. */
  plan_id: string;
}

export async function fetchClients(): Promise<ResellerClient[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reseller_clients");
  if (error) throw error;
  return (data ?? []) as unknown as ResellerClient[];
}

export async function fetchStats(): Promise<ResellerStats> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reseller_stats");
  if (error) throw error;
  return data as unknown as ResellerStats;
}

export async function fetchCreditHistory(): Promise<CreditMovement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reseller_credits")
    .select("id, plan_id, delta, reason, note, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as CreditMovement[];
}

/**
 * Alta de un cliente: crea la cuenta Auth con la contraseña asignada por el
 * revendedor (Edge Function con service_role). La licencia queda 'pending' y
 * el crédito se consume cuando el cliente hace su primer login.
 */
export async function createClientAccount(input: NewClientInput): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("reseller-create-client", {
    body: input,
  });
  if (error) {
    // La Edge Function devuelve el motivo en el cuerpo JSON del error.
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
}

/** Modalidad de recarga: 1 mes o 12 meses (pagando solo los meses cobrados). */
export type RechargePeriod = "monthly" | "annual";

/** Resultado de una recarga (RPC reseller_recharge_client). */
export interface RechargeResult {
  period_end: string;
  credits_used: number;
  months: number;
  plan_id: string;
}

/**
 * Recarga la licencia de un cliente propio consumiendo créditos del bolsillo de
 * SU plan: mensual = 1 crédito (+1 mes), anual = los meses cobrados del plan
 * (+12 meses). Si la licencia sigue vigente, los meses se suman al vencimiento.
 */
export async function rechargeClient(
  userId: string,
  period: RechargePeriod,
): Promise<RechargeResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reseller_recharge_client", {
    p_user_id: userId,
    p_period: period,
  });
  if (error) throw error;
  return data as unknown as RechargeResult;
}

/** Suspende o reactiva un cliente propio. */
export async function setClientStatus(
  userId: string,
  action: "suspend" | "reactivate",
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reseller_set_client_status", {
    p_user_id: userId,
    p_action: action,
  });
  if (error) throw error;
}

/** Reutiliza el catálogo de planes del servicio de suscripciones. */
export { fetchPlans } from "@/services/subscription.service";
export type { Plan } from "@/services/subscription.service";
