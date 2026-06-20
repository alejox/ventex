import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de staff (barberos / estilistas / empleados) ----
export interface StaffMember {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  commission_rate: number;
  status: string;
  created_at: string;
}

export interface NewStaffInput {
  full_name: string;
  role: string;
  phone: string;
  email: string;
  commission_rate: string;
  status: string;
}

/** Fila del reporte de comisiones (mes en curso) por miembro del equipo. */
export interface CommissionRow {
  staff_id: string;
  full_name: string;
  commission_rate: number;
  salesCount: number;
  servicesTotal: number; // suma de líneas de servicio de sus ventas
  commission: number; // commission_rate% × servicesTotal
}

const SELECT = "id, full_name, role, phone, email, commission_rate, status, created_at";

export async function fetchStaff(): Promise<StaffMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("staff").select(SELECT).order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

export async function createStaff(input: NewStaffInput): Promise<StaffMember> {
  const supabase = createClient();
  // user_id lo asigna el trigger set_staff_user_id / DEFAULT auth.uid().
  const { data, error } = await supabase
    .from("staff")
    .insert({
      full_name: input.full_name,
      role: input.role || null,
      phone: input.phone || null,
      email: input.email || null,
      commission_rate: parseFloat(input.commission_rate) || 0,
      status: input.status,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}

/**
 * Comisiones del mes en curso por miembro del equipo: toma las ventas
 * completadas atribuidas a cada uno, suma sus líneas de servicio y aplica su %.
 */
export async function fetchCommissions(): Promise<CommissionRow[]> {
  const supabase = createClient();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [staffRes, salesRes] = await Promise.all([
    supabase.from("staff").select("id, full_name, commission_rate"),
    supabase
      .from("sales")
      .select("id, staff_id, status, created_at, sale_items(line_total, service_id)")
      .eq("status", "completed")
      .gte("created_at", start)
      .not("staff_id", "is", null),
  ]);
  if (staffRes.error) throw staffRes.error;
  if (salesRes.error) throw salesRes.error;

  const staff = staffRes.data ?? [];
  const sales = (salesRes.data ?? []) as unknown as {
    staff_id: string;
    sale_items: { line_total: number; service_id: string | null }[] | null;
  }[];

  const agg = new Map<string, { servicesTotal: number; salesCount: number }>();
  for (const sale of sales) {
    const items = sale.sale_items ?? [];
    const servicesTotal = items
      .filter((it) => it.service_id)
      .reduce((sum, it) => sum + (it.line_total ?? 0), 0);
    const prev = agg.get(sale.staff_id) ?? { servicesTotal: 0, salesCount: 0 };
    agg.set(sale.staff_id, {
      servicesTotal: prev.servicesTotal + servicesTotal,
      salesCount: prev.salesCount + 1,
    });
  }

  return staff
    .map((m) => {
      const a = agg.get(m.id) ?? { servicesTotal: 0, salesCount: 0 };
      return {
        staff_id: m.id,
        full_name: m.full_name,
        commission_rate: m.commission_rate,
        salesCount: a.salesCount,
        servicesTotal: a.servicesTotal,
        commission: Math.round(a.servicesTotal * (m.commission_rate / 100) * 100) / 100,
      };
    })
    .filter((r) => r.salesCount > 0)
    .sort((a, b) => b.commission - a.commission);
}

export async function updateStaff(id: string, input: NewStaffInput): Promise<StaffMember> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .update({
      full_name: input.full_name,
      role: input.role || null,
      phone: input.phone || null,
      email: input.email || null,
      commission_rate: parseFloat(input.commission_rate) || 0,
      status: input.status,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}
