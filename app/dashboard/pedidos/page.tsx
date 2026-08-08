import { createClient } from "@/utils/supabase/server";
import { buildSuggestedItems } from "@/services/abastecimiento.service";
import { attachCosts, SERVICE_UNIT } from "@/services/inventory.service";
import { needsRestock } from "@/lib/stock";
import { PedidosClient } from "./PedidosClient";

export default async function PedidosPage() {
  const supabase = await createClient();

  // Sin `*`: a `authenticated` se le revocó el SELECT sobre `purchase_price`.
  const { data: products } = await supabase
    .from("products")
    .select("id, name, image_url, sku, stock_level, minimum_stock, unit, categories(name), distributors(business_name)")
    // Pedidos es reposición: se le compra a un proveedor. Un servicio no tiene
    // existencias que reponer, así que no entra en esta pantalla.
    .neq("unit", SERVICE_UNIT)
    .order("name");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  type ProductRow = {
    id: string;
    name: string;
    image_url: string | null;
    sku: string;
    stock_level: number;
    minimum_stock: number;
    unit: string;
    purchase_price: number;
    categories: { name: string } | null;
    distributors: { business_name: string } | null;
  };

  const rows = (products ?? []) as unknown as ProductRow[];

  const withCosts = await attachCosts(supabase, rows);

  const initialProducts: ProductRow[] = withCosts.map((p) => ({
    ...p,
    purchase_price: p.purchase_price ?? 0,
  }));

  const allCategories = (categories ?? []) as { id: string; name: string }[];

  // Misma definición que el KPI de Inventario y el widget del Panel.
  const lowStockCount = initialProducts.filter(needsRestock).length;

  const preseeded = buildSuggestedItems(initialProducts);

  return (
    <PedidosClient
      initialProducts={initialProducts}
      allCategories={allCategories}
      lowStockCount={lowStockCount}
      preseeded={preseeded}
    />
  );
}
