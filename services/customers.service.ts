import { createClient } from "@/utils/supabase/client";

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
}

export interface CustomerSale {
  id: string;
  sale_number: number;
  created_at: string;
  payment_method: string;
  total: number;
  item_count: number;
}

const SELECT = "id, full_name, email, phone, identification, doc_type, tax_exempt, credit_balance, credit_limit, haircut_count, haircuts_since_reward, created_at";

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
    .select("id, sale_number, created_at, payment_method, total, sale_items(count)")
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
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
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
export async function registerPayment(
  customerId: string,
  amount: number,
  notes?: string,
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("register_customer_payment", {
    p_customer_id: customerId,
    p_amount: amount,
    p_notes: notes ?? undefined,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Historial de abonos de un cliente, del más reciente al más viejo. */
export async function fetchCustomerPayments(customerId: string): Promise<CustomerPayment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_payments")
    .select("id, customer_id, amount, notes, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerPayment[];
}

