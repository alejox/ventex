import { createClient } from "@/utils/supabase/client";
import { fetchOverview, type FinanceOverview } from "@/services/finance.service";

export interface DashboardData {
  revenue: number;
  net: number;
  salesCount: number;
  lowStockCount: number;
  customerCount: number;
  appointmentsToday: number;
  monthly: FinanceOverview["monthly"];
  recent: FinanceOverview["recent"];
}

export async function fetchDashboard(): Promise<DashboardData> {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const [overview, lowStock, customers, todayAppts] = await Promise.all([
    fetchOverview(),
    // Stock bajo: con existencias pero <= 5 (misma definición que Inventario).
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .gt("stock_level", 0)
      .lte("stock_level", 5),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    // Citas de hoy que no estén canceladas.
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("appointment_date", today)
      .neq("status", "cancelled"),
  ]);
  if (lowStock.error) throw lowStock.error;
  if (customers.error) throw customers.error;
  if (todayAppts.error) throw todayAppts.error;

  return {
    revenue: overview.revenue,
    net: overview.net,
    salesCount: overview.salesCount,
    lowStockCount: lowStock.count ?? 0,
    customerCount: customers.count ?? 0,
    appointmentsToday: todayAppts.count ?? 0,
    monthly: overview.monthly,
    recent: overview.recent,
  };
}
