export interface SuggestedOrderItem {
  productId: string;
  productName: string;
  imageUrl: string | null;
  sku: string;
  currentStock: number;
  minimumStock: number;
  suggestedQuantity: number;
  unit: string;
  purchasePrice: number;
  distributorName: string | null;
}

export function computeSuggestedQuantity(
  currentStock: number,
  minimumStock: number,
): number {
  const target = minimumStock * 2;
  return Math.max(0, target - currentStock);
}

export function buildSuggestedItems(
  products: {
    id: string;
    name: string;
    image_url: string | null;
    sku: string;
    stock_level: number;
    minimum_stock: number;
    unit: string;
    purchase_price: number;
    distributors: { business_name: string } | null;
  }[],
): SuggestedOrderItem[] {
  return products
    .filter((p) => p.stock_level < p.minimum_stock)
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      imageUrl: p.image_url,
      sku: p.sku,
      currentStock: p.stock_level,
      minimumStock: p.minimum_stock,
      suggestedQuantity: computeSuggestedQuantity(p.stock_level, p.minimum_stock),
      unit: p.unit,
      purchasePrice: p.purchase_price,
      distributorName: p.distributors?.business_name ?? null,
    }))
    .sort((a, b) => (a.currentStock / a.minimumStock) - (b.currentStock / b.minimumStock));
}
