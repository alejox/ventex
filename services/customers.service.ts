import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de clientes ----
export interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  identification: string | null;
  doc_type: string | null;
  tax_exempt: boolean;
  created_at: string;
}

export interface NewCustomerInput {
  full_name: string;
  email: string;
  phone: string;
  identification: string;
  doc_type: string;
  tax_exempt: boolean;
}

const SELECT = "id, full_name, email, phone, identification, doc_type, tax_exempt, created_at";

export async function fetchCustomers(): Promise<Customer[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("customers").select(SELECT).order("full_name");
  if (error) throw error;
  return (data ?? []) as Customer[];
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
