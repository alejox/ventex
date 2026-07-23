import { createClient } from "@/utils/supabase/server";
import { buildSuggestedItems } from "@/services/abastecimiento.service";
import { PedidosClient } from "./PedidosClient";

export default async function PedidosPage() {
  const supabase = await createClient();

  // Sin `*`: a `authenticated` se le revocó el SELECT sobre `purchase_price`.
  const { data: products } = await supabase
    .from("products")
    .select("id, name, image_url, sku, stock_level, minimum_stock, unit, categories(name), distributors(business_name)")
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

  // El costo llega por RPC, que devuelve vacío si la persona no tiene el
  // permiso `inventory_costs`. Sin costo el pedido sugerido se arma igual: lo
  // que se pierde es la valorización, no la sugerencia de reposición.
  const { data: costRows } = await supabase.rpc("get_product_costs" as never, {
    p_ids: rows.map((p) => p.id),
  } as never);
  const costs = new Map<string, number>();
  for (const row of (costRows ?? []) as { product_id: string; purchase_price: number }[]) {
    costs.set(row.product_id, Number(row.purchase_price));
  }

  const initialProducts: ProductRow[] = rows.map((p) => ({
    ...p,
    purchase_price: costs.get(p.id) ?? 0,
  }));

  const allCategories = (categories ?? []) as { id: string; name: string }[];

  const lowStockCount = initialProducts.filter(
    (p) => p.stock_level < p.minimum_stock,
  ).length;

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
