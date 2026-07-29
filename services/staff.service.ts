import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de staff (barberos / estilistas / empleados) ----
/**
 * Ficha de una persona del negocio. NO lleva tasa de comisión: la comisión se
 * configura por producto y servicio, y el monto de cada venta queda congelado
 * en `sale_items.commission_amount`.
 */
export interface StaffMember {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
}

export interface NewStaffInput {
  full_name: string;
  role: string;
  phone: string;
  email: string;
  status: string;
}

/**
 * Fila del reporte de comisiones (mes en curso) por miembro del equipo.
 *
 * No lleva tasa: la comisión se configura POR PRODUCTO/SERVICIO
 * (`products.has_commission`, `commission_type`, `commission_value`), no por
 * persona, y el monto de cada línea queda congelado en
 * `sale_items.commission_amount` al vender. Dos personas pueden vender lo mismo
 * y ganar distinto según qué vendió cada una, así que una tasa única por
 * persona no describe nada.
 */
export interface CommissionRow {
  staff_id: string;
  full_name: string;
  salesCount: number;
  /** Total vendido atribuido a la persona (productos y servicios). */
  soldTotal: number;
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

const SELECT = "id, full_name, role, phone, email, status, created_at";

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
      status: input.status,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}

/**
 * Comisiones del mes en curso por miembro del equipo.
 *
 * Suma lo ya congelado en cada línea al vender; no recalcula nada. Cambiar hoy
 * la comisión de un producto no puede mover lo que ya se devengó.
 */
export async function fetchCommissions(): Promise<CommissionRow[]> {
  const supabase = createClient();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [staffRes, itemsRes] = await Promise.all([
    supabase.from("staff").select("id, full_name"),
    supabase
      .from("sale_items")
      // Sin filtro por service_id: antes solo sumaba SERVICIOS, así que en una
      // tienda —que no los tiene— el reporte salía vacío por definición. Los
      // productos también comisionan.
      .select("sale_id, staff_id, line_total, commission_amount, sales!inner(status, created_at)")
      .not("staff_id", "is", null)
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
    commission_amount: number;
  }[];

  const byStaff = new Map<string, { soldTotal: number; commission: number; sales: Set<string> }>();
  for (const it of items) {
    const prev = byStaff.get(it.staff_id) ?? { soldTotal: 0, commission: 0, sales: new Set<string>() };
    prev.soldTotal += it.line_total ?? 0;
    // La comisión NO se recalcula: se suma la que quedó congelada al vender.
    prev.commission += it.commission_amount ?? 0;
    prev.sales.add(it.sale_id);
    byStaff.set(it.staff_id, prev);
  }

  return staff
    .map((m) => {
      const a = byStaff.get(m.id);
      if (!a) return null;
      return {
        staff_id: m.id,
        full_name: m.full_name,
        salesCount: a.sales.size,
        soldTotal: Math.round(a.soldTotal * 100) / 100,
        commission: Math.round(a.commission * 100) / 100,
      };
    })
    .filter((r): r is CommissionRow => r !== null && r.soldTotal > 0)
    .sort((a, b) => b.commission - a.commission);
}

/**
 * Ventas (líneas) atribuidas a un miembro del personal, con comisión calculada.
 */
export async function fetchStaffSales(staffId: string): Promise<StaffSaleItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sale_items")
    .select("id, product_name, sku, unit_price, quantity, line_total, commission_amount, sales!inner(sale_number, created_at, payment_method, status, customers(full_name))")
    .eq("staff_id", staffId)
    // Mismo filtro que fetchCommissions: una venta anulada (void_sale la deja en
    // 'void') no se paga. Sin esto, este detalle sumaba más comisión que el
    // reporte del mes y el dueño no sabía cuál de los dos creer.
    .eq("sales.status", "completed");
  if (error) throw error;

  // El embed anidado de PostgREST (sale_items → sales → customers) no queda bien
  // tipado por el generador, así que se describe la forma que sí devuelve.
  interface SaleItemRow {
    id: string;
    product_name: string;
    sku: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    commission_amount: number;
    sales: {
      sale_number: number | null;
      created_at: string | null;
      payment_method: string | null;
      status: string | null;
      customers: { full_name: string | null } | null;
    } | null;
  }

  const result = ((data ?? []) as unknown as SaleItemRow[]).map((r) => ({
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
    commissionAmount: r.commission_amount ?? 0,
  }));

  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return result;
}

export async function deleteStaff(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff").delete().eq("id", id);
  if (error) throw error;
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
      status: input.status,
    })
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as StaffMember;
}
