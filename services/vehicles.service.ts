import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de vehículos (lavaautos) ----
export interface Vehicle {
  id: string;
  plate: string;
  make_model: string | null;
  color: string | null;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  customers: { full_name: string } | null;
}

export interface NewVehicleInput {
  plate: string;
  make_model: string;
  color: string;
  customer_id: string | null;
  notes: string;
}

/** Una visita del historial del vehículo (cita asociada). */
export interface VehicleVisit {
  id: string;
  title: string;
  appointment_date: string;
  start_time: string;
  status: string;
  services: { name: string } | null;
  staff: { full_name: string } | null;
}

const SELECT = "id, plate, make_model, color, customer_id, notes, created_at, customers(full_name)";

const one = <T>(embed: unknown): T | null =>
  Array.isArray(embed) ? ((embed[0] as T) ?? null) : ((embed as T) ?? null);

export const normalizePlate = (plate: string) => plate.trim().toUpperCase();

export async function fetchVehicles(): Promise<Vehicle[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("vehicles").select(SELECT).order("plate");
  if (error) throw error;
  return (data ?? []).map((v) => ({
    ...v,
    customers: one<{ full_name: string }>(v.customers),
  })) as Vehicle[];
}

export async function createVehicle(input: NewVehicleInput): Promise<Vehicle> {
  const supabase = createClient();
  // user_id lo asigna el trigger set_vehicles_user_id / DEFAULT auth.uid().
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      plate: normalizePlate(input.plate),
      make_model: input.make_model || null,
      color: input.color || null,
      customer_id: input.customer_id || null,
      notes: input.notes || null,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return { ...data, customers: one<{ full_name: string }>(data.customers) } as Vehicle;
}

export async function updateVehicle(id: string, input: NewVehicleInput): Promise<Vehicle> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .update({
      plate: normalizePlate(input.plate),
      make_model: input.make_model || null,
      color: input.color || null,
      customer_id: input.customer_id || null,
      notes: input.notes || null,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return { ...data, customers: one<{ full_name: string }>(data.customers) } as Vehicle;
}

/**
 * Busca un vehículo por placa (en la cuenta actual) o lo crea si no existe.
 * Usado al guardar una cita de lavaautos para enlazarla sin paso de registro.
 * Devuelve el id del vehículo, o null si no hay placa.
 */
export async function findOrCreateVehicleByPlate(
  plate: string,
  makeModel?: string,
): Promise<string | null> {
  const p = normalizePlate(plate || "");
  if (!p) return null;
  const supabase = createClient();

  const { data: existing, error: findErr } = await supabase
    .from("vehicles")
    .select("id")
    .eq("plate", p)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("vehicles")
    .insert({ plate: p, make_model: makeModel || null })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

/** Historial de visitas (citas) de un vehículo, más reciente primero. */
export async function fetchVehicleHistory(vehicleId: string): Promise<VehicleVisit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, title, appointment_date, start_time, status, services(name), staff(full_name)")
    .eq("vehicle_id", vehicleId)
    .order("appointment_date", { ascending: false })
    .order("start_time", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a) => ({
    ...a,
    services: one<{ name: string }>(a.services),
    staff: one<{ full_name: string }>(a.staff),
  })) as VehicleVisit[];
}
