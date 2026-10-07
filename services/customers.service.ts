import { createClient } from "@/utils/supabase/client";
import type { TablesUpdate } from "@/utils/supabase/database.types";
import { runInBatches, errorMessage as importErrorMessage, type ImportResult } from "@/lib/import/core";
import type { CustomerImportRecord } from "@/lib/import/customers";
import type { AbonoOptions } from "@/lib/credits";

// ---- Tipos del dominio de clientes ----
export interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  /**
   * Cortes acumulados. Lo mantienen los triggers de la base a partir de las
   * ventas, no la app: por eso solo se lee (ver la migración 20260815200000).
   */
  haircut_count: number;
  haircuts_since_reward: number;
  identification: string | null;
  doc_type: string | null;
  tax_exempt: boolean;
  credit_balance: number;
  credit_limit: number | null;
  /**
   * Aviso interno de crédito ("no fiar"). AVISA, no bloquea: el cupo es el que
   * rechaza la venta. Solo el dueño lo cambia, por `set_credit_alert`.
   */
  credit_alert: boolean;
  credit_alert_note: string | null;
  /**
   * Saldo de puntos canjeables (tienda). Lo mantiene un trigger a partir de
   * `loyalty_points_ledger`, no la app — mismo motivo que `haircut_count`
   * (ver la migración 20260927010000).
   */
  loyalty_points: number;
  created_at: string;
}

export interface NewCustomerInput {
  full_name: string;
  email: string;
  phone: string;
  identification: string;
  doc_type: string;
  tax_exempt: boolean;
  credit_limit?: number | null;
}

export interface CustomerPayment {
  id: string;
  customer_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  /** efectivo | tarjeta | transferencia (desde 20261007110100; antes, todo efectivo). */
  payment_method?: string | null;
}

export interface CustomerSale {
  id: string;
  sale_number: number;
  created_at: string;
  payment_method: string;
  total: number;
  item_count: number;
  /** `completed` | `refunded` | `void`. Una anulada se lista, pero no suma. */
  status: string;
}

/** Una venta anulada existió, pero el cliente no gastó esa plata. */
export const isVoidSale = (s: Pick<CustomerSale, "status">) => s.status === "void";

export interface CustomerSalesSummary {
  count: number;
  totalSpent: number;
  lastSale: CustomerSale | null;
}

/**
 * Los números de la ficha del cliente ("Ventas", "Total gastado", "Última
 * visita"). Las anuladas quedan FUERA: sumarlas inflaba lo gastado con plata
 * que se devolvió, y una venta anulada no es una visita que el cliente pagó.
 * Asume el orden de `fetchCustomerSales` (más reciente primero).
 */
export function summarizeCustomerSales(sales: CustomerSale[]): CustomerSalesSummary {
  const valid = sales.filter((s) => !isVoidSale(s));
  return {
    count: valid.length,
    totalSpent: valid.reduce((sum, s) => sum + Number(s.total ?? 0), 0),
    lastSale: valid[0] ?? null,
  };
}

const SELECT = "id, full_name, email, phone, identification, doc_type, tax_exempt, credit_balance, credit_limit, credit_alert, credit_alert_note, haircut_count, haircuts_since_reward, loyalty_points, created_at";

export async function fetchCustomers(): Promise<Customer[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("customers").select(SELECT).order("full_name");
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function fetchCustomerSales(customerId: string): Promise<CustomerSale[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_number, created_at, payment_method, total, status, sale_items(count)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown[]).map((s) => {
    const row = s as Record<string, unknown>;
    const items = Array.isArray(row.sale_items) ? (row.sale_items[0] as Record<string, unknown>) : { count: 0 };
    return {
      id: row.id as string,
      sale_number: row.sale_number as number,
      created_at: row.created_at as string,
      payment_method: row.payment_method as string,
      total: row.total as number,
      item_count: (items?.count as number) ?? 0,
      status: (row.status as string) ?? "completed",
    };
  });
}

export async function createCustomer(input: NewCustomerInput): Promise<Customer> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      full_name: input.full_name,
      email: input.email || null,
      phone: input.phone || null,
      identification: input.identification || null,
      doc_type: input.doc_type || null,
      tax_exempt: input.tax_exempt,
      credit_limit: input.credit_limit ?? null,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(id: string, input: NewCustomerInput): Promise<Customer> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({
      full_name: input.full_name,
      email: input.email || null,
      phone: input.phone || null,
      identification: input.identification || null,
      doc_type: input.doc_type || null,
      tax_exempt: input.tax_exempt,
      credit_limit: input.credit_limit ?? null,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = createClient();
  // `.select` para saber si borró algo: la RLS de DELETE (solo el dueño) no
  // da error, filtra. Sin esto un rechazo se veía como un borrado exitoso.
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("No se eliminó el cliente: solo el dueño del negocio puede eliminar clientes.");
  }
}

/**
 * Registra un abono y devuelve el saldo que quedó.
 *
 * UNA sola llamada, a propósito. Antes eran dos —el INSERT en
 * `customer_payments` y después el RPC que bajaba el saldo— y entre las dos no
 * hay transacción: si la segunda no salía, quedaba un abono asentado que nunca
 * descontó nada, y la deuda seguía viva con el recibo ya entregado. Es la misma
 * regla que rige las comisiones: los pasos de una liquidación no se replican
 * desde el cliente.
 *
 * El saldo nuevo lo devuelve la base porque restarlo acá es apostar a que nadie
 * más cobró en el medio.
 */
/**
 * `options` (medio de pago + id del intento) va al RPC desde 20261007110100. El
 * medio decide si el abono entra al arqueo del turno (efectivo); el id hace el
 * reintento idempotente. Si la base todavía tiene la firma vieja (`PGRST202`),
 * se reintenta sin ellos — mismo patrón que `createSaleWithFallback`.
 */
export async function registerPayment(
  customerId: string,
  amount: number,
  notes?: string,
  options?: AbonoOptions,
): Promise<number> {
  const supabase = createClient();
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const base = { p_customer_id: customerId, p_amount: amount, p_notes: notes ?? undefined };
  if (options && !legacyRegisterPayment) {
    const { data, error } = await rpc.call(supabase, "register_customer_payment", {
      ...base,
      p_payment_method: options.paymentMethod,
      p_client_payment_id: options.clientPaymentId,
    });
    if (!error) return Number(data ?? 0);
    if (error.code !== "PGRST202") throw error;
    legacyRegisterPayment = true;
  }
  const { data, error } = await rpc.call(supabase, "register_customer_payment", base);
  if (error) throw error;
  return Number(data ?? 0);
}

/** La base no tiene la firma nueva: se recuerda por sesión (ver `registerPayment`). */
let legacyRegisterPayment = false;

/** Historial de abonos de un cliente, del más reciente al más viejo. */
export async function fetchCustomerPayments(customerId: string): Promise<CustomerPayment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_payments")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerPayment[];
}


/* -------------------------------------------------------------------------- */
/* Importación masiva                                                         */
/* -------------------------------------------------------------------------- */

export interface CustomerImportItem {
  line: number;
  record: CustomerImportRecord;
  existingId?: string;
}

/**
 * Crea por lotes y actualiza de a uno. Una actualización manda SOLO lo que el
 * archivo trajo: la celda vacía no borra el teléfono que ya estaba.
 * Sin `user_id`: lo resuelve el DEFAULT con `get_effective_user_id()`.
 */
export async function importCustomers(
  items: CustomerImportItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const supabase = createClient();
  const total = items.length;
  let done = 0;
  const insertRowOf = ({ record: r }: CustomerImportItem) => ({
    full_name: r.full_name,
    doc_type: r.doc_type,
    identification: r.identification,
    phone: r.phone,
    email: r.email,
    credit_limit: r.credit_limit,
    tax_exempt: r.tax_exempt ?? false,
  });
  const creates = items.filter((i) => !i.existingId);
  const inserted = await runInBatches(
    creates,
    200,
    async (batch) => {
      const { error } = await supabase.from("customers").insert(batch.map(insertRowOf));
      if (error) throw error;
    },
    async (item) => {
      const { error } = await supabase.from("customers").insert(insertRowOf(item));
      if (error) throw error;
    },
    (n) => onProgress?.((done = n), total),
  );
  const failed = [...inserted.failed];
  let updated = 0;
  for (const item of items.filter((i) => i.existingId)) {
    const r = item.record;
    const patch: TablesUpdate<"customers"> = { full_name: r.full_name };
    if (r.doc_type) patch.doc_type = r.doc_type;
    if (r.identification) patch.identification = r.identification;
    if (r.phone) patch.phone = r.phone;
    if (r.email) patch.email = r.email;
    if (r.credit_limit !== null) patch.credit_limit = r.credit_limit;
    if (r.tax_exempt !== null) patch.tax_exempt = r.tax_exempt;
    const { error } = await supabase.from("customers").update(patch).eq("id", item.existingId!);
    if (error) failed.push({ line: item.line, message: importErrorMessage(error) });
    else updated++;
    onProgress?.(++done, total);
  }
  return { created: inserted.ok, updated, skipped: 0, failed: failed.sort((a, b) => a.line - b.line) };
}

/**
 * Qué arrastra borrar un cliente (verificado contra las FK en vivo): sus ventas,
 * citas y vehículos quedan SIN cliente (`ON DELETE SET NULL`) y sus abonos se
 * BORRAN (`CASCADE`). Se muestra antes de confirmar.
 */
export interface CustomerImpact {
  sales: number;
  payments: number;
  appointments: number;
  vehicles: number;
}

export async function fetchCustomerImpact(id: string): Promise<CustomerImpact> {
  const supabase = createClient();
  const count = async (table: "sales" | "customer_payments" | "appointments" | "vehicles") => {
    const { count: n, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id);
    if (error) throw error;
    return n ?? 0;
  };
  const [sales, payments, appointments, vehicles] = await Promise.all([
    count("sales"),
    count("customer_payments"),
    count("appointments"),
    count("vehicles"),
  ]);
  return { sales, payments, appointments, vehicles };
}
