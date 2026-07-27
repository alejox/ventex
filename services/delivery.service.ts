import { createClient } from "@/utils/supabase/client";

export interface DeliveryPerson {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

export interface Delivery {
  id: string;
  sale_id: string;
  delivery_person_id: string;
  address: string;
  fee: number;
  status: "pending" | "in_transit" | "delivered";
  notes: string | null;
  created_at: string;
  sale_number?: number;
  sale_total?: number;
  person_name?: string;
  person_phone?: string;
}

export type DeliveryStatus = Delivery["status"];

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Pendiente",
  in_transit: "En camino",
  delivered: "Entregado",
};

export const STATUS_COLORS: Record<DeliveryStatus, string> = {
  pending: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  in_transit: "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20",
  delivered: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20",
};

// ---- Delivery Persons ----

export async function fetchDeliveryPersons(): Promise<DeliveryPerson[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("delivery_persons")
    .select("id, name, phone, created_at")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createDeliveryPerson(input: {
  name: string;
  phone: string;
}): Promise<DeliveryPerson> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("delivery_persons")
    .insert({ name: input.name, phone: input.phone })
    .select("id, name, phone, created_at")
    .single();
  if (error) throw error;
  return data as DeliveryPerson;
}

export async function deleteDeliveryPerson(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("delivery_persons")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---- Deliveries ----

const DELIVERY_SELECT = `
  id, sale_id, delivery_person_id, address, fee, status, notes, created_at,
  sales (sale_number, total),
  delivery_persons (name, phone)
`;

export async function fetchDeliveries(
  status?: DeliveryStatus,
): Promise<Delivery[]> {
  const supabase = createClient();
  let q = supabase.from("deliveries").select(DELIVERY_SELECT).order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((d: Record<string, unknown>) => {
    const sale = (d.sales as Record<string, unknown> | null) ?? {};
    const person = (d.delivery_persons as Record<string, unknown> | null) ?? {};
    return {
      id: d.id as string,
      sale_id: d.sale_id as string,
      delivery_person_id: d.delivery_person_id as string,
      address: d.address as string,
      fee: d.fee as number,
      status: d.status as DeliveryStatus,
      notes: d.notes as string | null,
      created_at: d.created_at as string,
      sale_number: sale.sale_number as number | undefined,
      sale_total: sale.total as number | undefined,
      person_name: person.name as string | undefined,
      person_phone: person.phone as string | undefined,
    };
  });
}

export async function createDelivery(input: {
  sale_id: string;
  delivery_person_id: string;
  address: string;
  fee: number;
  notes?: string;
}): Promise<Delivery> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("deliveries")
    .insert({
      sale_id: input.sale_id,
      delivery_person_id: input.delivery_person_id,
      address: input.address,
      fee: input.fee,
      status: "pending",
      notes: input.notes ?? null,
    })
    .select("id, sale_id, delivery_person_id, address, fee, status, notes, created_at")
    .single();
  if (error) throw error;
  return data as Delivery;
}

export async function updateDeliveryStatus(
  id: string,
  status: DeliveryStatus,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("deliveries")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}
