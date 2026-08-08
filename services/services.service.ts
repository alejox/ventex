import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de servicios (catálogo de salón / barbería) ----
export interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  status: string;
  has_commission: boolean;
  commission_type: string | null;
  commission_value: number | null;
  created_at: string;
}

export interface NewServiceInput {
  name: string;
  description: string;
  price: string;
  duration_minutes: string;
  status: string;
  has_commission: boolean;
  commission_type: string;
  commission_value: string;
}

const SELECT = "id, name, description, price, duration_minutes, status, has_commission, commission_type, commission_value, created_at";

export async function fetchServices(): Promise<Service[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("services").select(SELECT).order("name");
  if (error) throw error;
  return (data ?? []) as Service[];
}

export async function createService(input: NewServiceInput): Promise<Service> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      name: input.name,
      description: input.description || null,
      price: parseFloat(input.price) || 0,
      duration_minutes: parseInt(input.duration_minutes) || 30,
      status: input.status,
      has_commission: input.has_commission,
      commission_type: input.has_commission ? input.commission_type : null,
      commission_value: input.has_commission ? parseFloat(input.commission_value) || null : null,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Service;
}

export async function updateService(id: string, input: NewServiceInput): Promise<Service> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .update({
      name: input.name,
      description: input.description || null,
      price: parseFloat(input.price) || 0,
      duration_minutes: parseInt(input.duration_minutes) || 30,
      status: input.status,
      has_commission: input.has_commission,
      commission_type: input.has_commission ? input.commission_type : null,
      commission_value: input.has_commission ? parseFloat(input.commission_value) || null : null,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Service;
}

export async function deleteService(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Actualiza el gemelo en `services` de un servicio creado/guardado desde el
 * inventario o el POS: si ya existe una fila con el mismo nombre, la
 * actualiza; si no, la crea. La búsqueda queda acotada al negocio por RLS.
 */
export async function upsertServiceByName(input: NewServiceInput): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id")
    .ilike("name", input.name);
  if (error) throw error;
  const found = data?.[0];
  if (found) {
    await updateService(found.id, input);
  } else {
    await createService(input);
  }
}
