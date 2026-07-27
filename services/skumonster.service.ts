import axios from "axios";

const BASE = "https://api.sku.monster";

const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const key = process.env.NEXT_PUBLIC_SKU_MONSTER_API_KEY;
  if (key) {
    config.headers["X-API-Key"] = key;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SkuMonsterProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  description?: string;
  ean?: string;
  upc?: string | null;
  asin?: string | null;
  sku?: string | null;
  images: string[];
  price?: number | null;
  currency?: string | null;
  weight?: string | null;
  dimensions?: string | null;
  updated_at: string;
  cached: boolean;
}

export interface LookupParams {
  ean?: string;
  upc?: string;
  barcode?: string;
  sku?: string;
}

export interface BatchLookupItem {
  identifier: string;
  product: SkuMonsterProduct | null;
  found: boolean;
  error?: string | null;
}

export interface BatchLookupResult {
  results: BatchLookupItem[];
  total: number;
  found: number;
  not_found: number;
}

export interface SearchParams {
  q: string;
  category?: string;
  brand?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  limit: number;
  offset: number;
  results: SkuMonsterProduct[];
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

export async function lookupProduct(
  params: LookupParams,
): Promise<SkuMonsterProduct> {
  const { data } = await api.get<SkuMonsterProduct>("/api/v1/lookup", {
    params,
  });
  return data;
}

export async function batchLookup(
  items: LookupParams[],
): Promise<BatchLookupResult> {
  const { data } = await api.post<BatchLookupResult>(
    "/api/v1/lookup/batch",
    { items },
  );
  return data;
}

export async function searchProducts(
  params: SearchParams,
): Promise<SearchResult> {
  const { data } = await api.get<SearchResult>("/api/v1/lookup/search", {
    params,
  });
  return data;
}

export async function getProductById(
  id: string,
): Promise<SkuMonsterProduct> {
  const { data } = await api.get<SkuMonsterProduct>(`/api/v1/products/${id}`);
  return data;
}
