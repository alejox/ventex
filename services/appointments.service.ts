import { createClient } from "@/utils/supabase/client";

// ---- TYPES ----
export interface Appointment {
  id: string;
  customer_id: string | null;
  service_id: string | null;
  staff_id: string | null;
  title: string;
  description: string | null;
  service_type: string | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  customers: { full_name: string } | null;
  services: { name: string } | null;
  staff: { full_name: string } | null;
}

export interface NewAppointmentInput {
  customer_id: string | null;
  service_id: string | null;
  staff_id: string | null;
  title: string;
  description: string;
  service_type: string;
  vehicle_plate: string;
  vehicle_model: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  notes: string;
}

// ---- SELECT ----
const SELECT = "*, customers(full_name), services(name), staff(full_name)";

// ---- HELPERS ----
const one = <T>(embed: unknown): T | null => {
  if (Array.isArray(embed)) return (embed[0] as T) ?? null;
  return (embed as T) ?? null;
};

// ---- DATA ACCESS ----
export async function fetchAppointments(
  startDate: string,
  endDate: string,
): Promise<Appointment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT)
    .gte("appointment_date", startDate)
    .lte("appointment_date", endDate)
    .order("appointment_date")
    .order("start_time");
  if (error) throw error;
  return (data ?? []).map((a) => ({
    ...a,
    customers: one<{ full_name: string }>(a.customers),
    services: one<{ name: string }>(a.services),
    staff: one<{ full_name: string }>(a.staff),
  })) as Appointment[];
}

export async function fetchAppointmentsByDate(
  date: string,
): Promise<Appointment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT)
    .eq("appointment_date", date)
    .order("start_time");
  if (error) throw error;
  return (data ?? []).map((a) => ({
    ...a,
    customers: one<{ full_name: string }>(a.customers),
    services: one<{ name: string }>(a.services),
    staff: one<{ full_name: string }>(a.staff),
  })) as Appointment[];
}

export async function createAppointment(
  input: NewAppointmentInput,
): Promise<Appointment> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      title: input.title,
      description: input.description || null,
      service_type: input.service_type || null,
      service_id: input.service_id || null,
      staff_id: input.staff_id || null,
      vehicle_plate: input.vehicle_plate || null,
      vehicle_model: input.vehicle_model || null,
      customer_id: input.customer_id || null,
      appointment_date: input.appointment_date,
      start_time: input.start_time,
      end_time: input.end_time,
      notes: input.notes || null,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return {
    ...data,
    customers: one<{ full_name: string }>(data.customers),
    services: one<{ name: string }>(data.services),
    staff: one<{ full_name: string }>(data.staff),
  } as Appointment;
}

export async function updateAppointment(
  id: string,
  input: NewAppointmentInput,
): Promise<Appointment> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      title: input.title,
      description: input.description || null,
      service_type: input.service_type || null,
      service_id: input.service_id || null,
      staff_id: input.staff_id || null,
      vehicle_plate: input.vehicle_plate || null,
      vehicle_model: input.vehicle_model || null,
      customer_id: input.customer_id || null,
      appointment_date: input.appointment_date,
      start_time: input.start_time,
      end_time: input.end_time,
      notes: input.notes || null,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return {
    ...data,
    customers: one<{ full_name: string }>(data.customers),
    services: one<{ name: string }>(data.services),
    staff: one<{ full_name: string }>(data.staff),
  } as Appointment;
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
