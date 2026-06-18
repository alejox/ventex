import { createClient } from "@/utils/supabase/client";
import { fetchOverview, type FinanceOverview } from "@/services/finance.service";

export interface DashboardData {
  revenue: number;
  net: number;
  salesCount: number;
  lowStockCount: number;
  customerCount: number;
  monthly: FinanceOverview["monthly"];
  recent: FinanceOverview["recent"];
}

export async function fetchDashboard(): Promise<DashboardData> {
  const supabase = createClient();
  const [overview, lowStock, customers] = await Promise.all([
    fetchOverview(),
    // Stock bajo: con existencias pero <= 5 (misma definición que Inventario).
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .gt("stock_level", 0)
      .lte("stock_level", 5),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);
  if (lowStock.error) throw lowStock.error;
  if (customers.error) throw customers.error;

  return {
    revenue: overview.revenue,
    net: overview.net,
    salesCount: overview.salesCount,
    lowStockCount: lowStock.count ?? 0,
    customerCount: customers.count ?? 0,
    monthly: overview.monthly,
    recent: overview.recent,
  };
}
