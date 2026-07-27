import axios from "axios";

const USER_AGENT = "VentexPOS/1.0 (ventex-app)";

interface RawProduct {
  product_name?: string;
  product_name_es?: string;
  brands?: string;
  categories?: string;
  product_quantity?: number;
  product_quantity_unit?: string;
  image_url?: string;
  selected_images?: {
    front?: { display?: Record<string, string>; small?: Record<string, string> };
  };
  nutriscore_grade?: string;
  nova_group?: number;
  ingredients_text_es?: string;
  labels?: string;
}

interface RawResponse {
  status: number;
  status_verbose: string;
  code: string;
  product?: RawProduct;
}

const DOMAINS = [
  { key: "food" as const, url: "https://world.openfoodfacts.org" },
  { key: "beauty" as const, url: "https://world.openbeautyfacts.org" },
  { key: "petfood" as const, url: "https://world.openpetfoodfacts.org" },
  { key: "products" as const, url: "https://world.openproductsfacts.org" },
];

function pickImage(product: RawProduct): string | undefined {
  const selected = product.selected_images?.front?.display;
  if (selected) {
    return selected.es || selected.en || Object.values(selected)[0];
  }
  return product.image_url ?? undefined;
}

function normalize(
  barcode: string,
  product: RawProduct,
  source: string,
): OpenFactsProduct {
  return {
    barcode,
    source,
    name: product.product_name_es || product.product_name || "",
    brand: product.brands?.split(",")[0]?.trim() || undefined,
    category: product.categories?.split(",")[0]?.trim() || undefined,
    quantity: product.product_quantity
      ? `${product.product_quantity} ${product.product_quantity_unit ?? ""}`.trim()
      : undefined,
    imageUrl: pickImage(product),
    nutriscore: product.nutriscore_grade?.toUpperCase() || undefined,
    novaGroup: product.nova_group ?? undefined,
    ingredientsEs: product.ingredients_text_es || undefined,
    labels: product.labels || undefined,
  };
}

export interface OpenFactsProduct {
  barcode: string;
  source: string;
  name: string;
  brand?: string;
  category?: string;
  quantity?: string;
  imageUrl?: string;
  nutriscore?: string;
  novaGroup?: number;
  ingredientsEs?: string;
  labels?: string;
}

async function tryDomain(
  domain: (typeof DOMAINS)[number],
  barcode: string,
): Promise<OpenFactsProduct | null> {
  const { data } = await axios.get<RawResponse>(
    `${domain.url}/api/v2/product/${encodeURIComponent(barcode)}.json`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (data.status === 1 && data.product) {
    return normalize(barcode, data.product, domain.key);
  }
  return null;
}

export async function lookupBarcode(
  barcode: string,
): Promise<OpenFactsProduct | null> {
  const results = await Promise.allSettled(
    DOMAINS.map((d) => tryDomain(d, barcode)),
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}
