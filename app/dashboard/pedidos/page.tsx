import { createClient } from "@/utils/supabase/server";
import { buildSuggestedItems } from "@/services/abastecimiento.service";
import { PedidosClient } from "./PedidosClient";

export default async function PedidosPage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("*, categories(name), distributors(business_name)")
    .order("name");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  const initialProducts = (products ?? []) as {
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
  }[];

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
