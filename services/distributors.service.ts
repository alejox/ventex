import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de distribuidores ----
export interface Distributor {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  rfc_rut: string | null;
  doc_type: string | null;
  status: string;
  created_at: string;
}

export interface NewDistributorInput {
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  rfc_rut: string;
  doc_type: string;
}

const SELECT = "id, business_name, contact_name, email, phone, address, rfc_rut, doc_type, status, created_at";

export async function fetchDistributors(): Promise<Distributor[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("distributors").select(SELECT).order("business_name");
  if (error) throw error;
  return (data ?? []) as Distributor[];
}

export async function createDistributor(input: NewDistributorInput): Promise<Distributor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("distributors")
    .insert({
      business_name: input.business_name,
      contact_name: input.contact_name || null,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      rfc_rut: input.rfc_rut || null,
      doc_type: input.doc_type || null,
      // user_id lo asigna el trigger set_distributors_user_id.
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Distributor;
}
