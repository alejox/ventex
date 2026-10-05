import { createClient } from "@/utils/supabase/client";
import { findOrCreateVehicleByPlate } from "@/services/vehicles.service";
import { createSale } from "@/services/pos.service";
import { getWorkspaceExecutionContext } from "@/services/workspace.service";
import { fetchCurrentShift } from "@/services/shifts.service";

// ---- TYPES ----
export interface Appointment {
  id: string;
  customer_id: string | null;
  service_id: string | null;
  staff_id: string | null;
  vehicle_id: string | null;
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
  /**
   * Venta que pagó la cita. La escribe la base: el trigger
   * `complete_appointment_on_service_sale` al vender el servicio desde el POS,
   * o `chargeAppointment` al cobrar desde la cita. null = todavía no se cobró.
   */
  sale_id?: string | null;
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
export async function fetchAppointmentById(id: string): Promise<Appointment | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("appointments").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    customers: one<{ full_name: string }>(data.customers),
    services: one<{ name: string }>(data.services),
    staff: one<{ full_name: string }>(data.staff),
  } as Appointment;
}

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

export async function createAppointment(
  input: NewAppointmentInput,
): Promise<Appointment> {
  const supabase = createClient();
  const vehicle_id = await findOrCreateVehicleByPlate(
    input.vehicle_plate,
    input.vehicle_model,
    input.customer_id,
  );
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
      vehicle_id,
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
  const vehicle_id = await findOrCreateVehicleByPlate(
    input.vehicle_plate,
    input.vehicle_model,
    input.customer_id,
  );
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
      vehicle_id,
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

/** Medios con los que se cobra una cita desde el calendario. */
export type AppointmentPaymentMethod = "efectivo" | "tarjeta" | "transferencia";

/**
 * Cobra una cita: genera una venta con su servicio, atribuida al barbero/operario
 * y al cliente de la cita, y la deja COMPLETADA y atada a esa venta. Devuelve el
 * id de la venta creada.
 *
 * Si la cita es de hoy y tiene cliente, el trigger de la base ya la completó al
 * insertar la línea; el `update` de abajo cubre lo que el trigger no puede
 * adivinar (cita sin cliente, o de otro día) y, si el trigger eligió OTRA cita
 * del mismo cliente y servicio, la devuelve: el cajero cobró ESTA.
 */
export async function chargeAppointment(
  appt: Appointment,
  paymentMethod: AppointmentPaymentMethod = "efectivo",
): Promise<string> {
  if (!appt.service_id) {
    throw new Error("La cita no tiene un servicio asignado para cobrar");
  }
  if (appt.sale_id) {
    throw new Error("Esta cita ya fue cobrada");
  }
  const [context, shift] = await Promise.all([
    getWorkspaceExecutionContext(),
    fetchCurrentShift(),
  ]);
  const saleId = await createSale({
    workspaceId: context.workspaceId,
    membershipId: context.membershipId,
    shiftId: shift?.id ?? null,
    customerId: appt.customer_id,
    staffId: appt.staff_id,
    paymentMethod,
    discount: 0,
    items: [{ service_id: appt.service_id, quantity: 1 }],
  });

  await linkAppointmentToSale(appt.id, saleId);
  return saleId;
}

/**
 * Deja la cita COMPLETADA y atada a la venta que la pagó. Si el trigger ya
 * había atado esa venta a OTRA cita del mismo cliente y servicio, la suelta:
 * quien cobra sabe cuál cita cobró, el trigger solo lo adivina.
 */
export async function linkAppointmentToSale(appointmentId: string, saleId: string): Promise<void> {
  const supabase = createClient();
  // `sale_id` es posterior a los tipos generados (database.types.ts): los
  // casts se van al regenerarlos.
  const { error: unlinkError } = await supabase
    .from("appointments")
    .update({ status: "confirmed", sale_id: null } as never)
    .eq("sale_id" as never, saleId)
    .neq("id", appointmentId);
  if (unlinkError) throw unlinkError;

  const { error: linkError } = await supabase
    .from("appointments")
    .update({ status: "completed", sale_id: saleId } as never)
    .eq("id", appointmentId);
  if (linkError) throw linkError;
}

/** Cita de hoy lista para cobrar en el POS. */
export interface BillableAppointment {
  id: string;
  start_time: string;
  status: "pending" | "confirmed";
  customer_id: string | null;
  customer_name: string | null;
  service_id: string;
  service_name: string;
  staff_id: string | null;
  staff_name: string | null;
}

/**
 * Citas de HOY que todavía no se cobraron, ordenadas por hora. El POS las
 * muestra arriba del catálogo para cobrarlas con un clic: el cliente ya está
 * en la silla y el cajero no tiene por qué buscarlo, ni a él ni al servicio.
 */
export async function fetchBillableAppointments(today: string): Promise<BillableAppointment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, start_time, status, customer_id, service_id, staff_id, sale_id, customers(full_name), services(name), staff(full_name)" as "*")
    .eq("appointment_date", today)
    .in("status", ["pending", "confirmed"])
    .not("service_id", "is", null)
    .order("start_time");
  if (error) throw error;
  type Row = {
    id: string;
    start_time: string;
    status: "pending" | "confirmed";
    customer_id: string | null;
    service_id: string;
    staff_id: string | null;
    sale_id: string | null;
    customers: unknown;
    services: unknown;
    staff: unknown;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((a) => !a.sale_id)
    .map((a) => ({
      id: a.id,
      start_time: a.start_time,
      status: a.status,
      customer_id: a.customer_id,
      customer_name: one<{ full_name: string }>(a.customers)?.full_name ?? null,
      service_id: a.service_id,
      service_name: one<{ name: string }>(a.services)?.name ?? "Servicio",
      staff_id: a.staff_id,
      staff_name: one<{ full_name: string }>(a.staff)?.full_name ?? null,
    }));
}

export async function deleteAppointment(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
