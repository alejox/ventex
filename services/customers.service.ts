import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de clientes ----
export interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  identification: string | null;
  tax_exempt: boolean;
  created_at: string;
}

export interface NewCustomerInput {
  full_name: string;
  email: string;
  phone: string;
  identification: string;
  tax_exempt: boolean;
}

const SELECT = "id, full_name, email, phone, identification, tax_exempt, created_at";

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
      tax_exempt: input.tax_exempt,
      // user_id lo asigna el trigger set_customers_user_id.
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Customer;
}
