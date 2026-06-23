import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de staff (barberos / estilistas / empleados) ----
export interface StaffMember {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  commission_rate: number;
  commission_type: string;
  status: string;
  created_at: string;
}

export interface NewStaffInput {
  full_name: string;
  role: string;
  phone: string;
  email: string;
  commission_rate: string;
  commission_type: string;
  status: string;
}

/** Fila del reporte de comisiones (mes en curso) por miembro del equipo. */
export interface CommissionRow {
  staff_id: string;
  full_name: string;
  commission_rate: number;
  commission_type: string;
  salesCount: number;
  servicesTotal: number;
  commission: number;
}

export interface StaffSaleItem {
  id: string;
  product_name: string;
  sku: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  sale_number: number;
  created_at: string;
  customer_name: string | null;
  payment_method: string;
  commissionAmount: number;
}

const SELECT = "id, full_name, role, phone, email, commission_rate, commission_type, status, created_at";

const calcCommission = (rate: number, type: string, lineTotal: number, quantity: number) =>
  type === "fixed" ? rate * quantity : Math.round(lineTotal * (rate / 100) * 100) / 100;

export async function fetchStaff(): Promise<StaffMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("staff").select(SELECT).order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

export async function createStaff(input: NewStaffInput): Promise<StaffMember> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .insert({
      full_name: input.full_name,
      role: input.role || null,
      phone: input.phone || null,
      email: input.email || null,
      commission_rate: parseFloat(input.commission_rate) || 0,
      commission_type: input.commission_type || "percentage",
      status: input.status,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}

/**
 * Comisiones del mes en curso por miembro del equipo.
 * - percentage: rate% × line_total
 * - fixed: rate × quantity
 */
export async function fetchCommissions(): Promise<CommissionRow[]> {
  const supabase = createClient();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [staffRes, itemsRes] = await Promise.all([
    supabase.from("staff").select("id, full_name, commission_rate, commission_type"),
    supabase
      .from("sale_items")
      .select("sale_id, staff_id, line_total, quantity, service_id, sales!inner(status, created_at)")
      .not("staff_id", "is", null)
      .not("service_id", "is", null)
      .eq("sales.status", "completed")
      .gte("sales.created_at", start),
  ]);
  if (staffRes.error) throw staffRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const staff = staffRes.data ?? [];
  const items = (itemsRes.data ?? []) as unknown as {
    sale_id: string;
    staff_id: string;
    line_total: number;
    quantity: number;
  }[];

  const byStaff = new Map<string, { servicesTotal: number; commission: number; sales: Set<string> }>();
  for (const it of items) {
    const prev = byStaff.get(it.staff_id) ?? { servicesTotal: 0, commission: 0, sales: new Set<string>() };
    prev.servicesTotal += it.line_total ?? 0;
    prev.sales.add(it.sale_id);
    byStaff.set(it.staff_id, prev);
  }

  return staff
    .map((m) => {
      const a = byStaff.get(m.id);
      if (!a) return null;
      const staffItems = items.filter((i) => i.staff_id === m.id);
      let commission = 0;
      if (m.commission_type === "fixed") {
        commission = staffItems.reduce((s, i) => s + (m.commission_rate * i.quantity), 0);
      } else {
        commission = staffItems.reduce((s, i) => s + Math.round(i.line_total * (m.commission_rate / 100) * 100) / 100, 0);
      }
      return {
        staff_id: m.id,
        full_name: m.full_name,
        commission_rate: m.commission_rate,
        commission_type: m.commission_type,
        salesCount: a.sales.size,
        servicesTotal: a.servicesTotal,
        commission: Math.round(commission * 100) / 100,
      };
    })
    .filter((r): r is CommissionRow => r !== null && r.servicesTotal > 0)
    .sort((a, b) => b.commission - a.commission);
}

/**
 * Ventas (líneas) atribuidas a un miembro del personal, con comisión calculada.
 */
export async function fetchStaffSales(staffId: string): Promise<StaffSaleItem[]> {
  const supabase = createClient();
  const [staffRes, dataRes] = await Promise.all([
    supabase.from("staff").select("commission_rate, commission_type").eq("id", staffId).single(),
    supabase
      .from("sale_items")
      .select("id, product_name, sku, unit_price, quantity, line_total, sales!inner(sale_number, created_at, payment_method, customers(full_name))")
      .eq("staff_id", staffId),
  ]);
  if (staffRes.error) throw staffRes.error;
  if (dataRes.error) throw dataRes.error;

  const rate = (staffRes.data as { commission_rate: number; commission_type: string })?.commission_rate ?? 0;
  const type = (staffRes.data as { commission_rate: number; commission_type: string })?.commission_type ?? "percentage";

  const result = ((dataRes.data ?? []) as unknown[]).map((r: any) => ({
    id: r.id,
    product_name: r.product_name,
    sku: r.sku,
    unit_price: r.unit_price,
    quantity: r.quantity,
    line_total: r.line_total,
    sale_number: r.sales?.sale_number ?? 0,
    created_at: r.sales?.created_at ?? "",
    customer_name: r.sales?.customers?.full_name ?? null,
    payment_method: r.sales?.payment_method ?? "",
    commissionAmount: calcCommission(rate, type, r.line_total, r.quantity),
  }));

  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return result;
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
      commission_type: input.commission_type || "percentage",
      status: input.status,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}
