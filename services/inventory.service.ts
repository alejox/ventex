import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de inventario ----
export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  sku: string;
  price: number;
  stock_level: number;
  image_url: string | null;
  created_at: string;
  categories: { name: string } | null;
}

/** Datos del formulario de producto (campos en string tal como llegan del form). */
export interface NewProductInput {
  name: string;
  category_id: string;
  sku: string;
  price: string;
  stock_level: string;
  image_url: string;
}

export interface NewCategoryInput {
  name: string;
  description: string;
}

const PRODUCT_SELECT = "*, categories(name)";

export async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, description")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchProducts(): Promise<Product[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function createProduct(input: NewProductInput): Promise<Product> {
  const supabase = createClient();
  // user_id lo asigna el trigger/DEFAULT auth.uid() (tenant-isolation, ver CLAUDE.md).
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      category_id: input.category_id || null,
      sku: input.sku,
      price: parseFloat(input.price),
      stock_level: parseInt(input.stock_level),
      image_url: input.image_url || null,
    })
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;
  return data as Product;
}

export async function createCategory(input: NewCategoryInput): Promise<Category> {
  const supabase = createClient();
  // user_id lo asigna el trigger/DEFAULT auth.uid().
  const { data, error } = await supabase
    .from("categories")
    .insert({
      name: input.name,
      description: input.description,
    })
    .select("id, name, description")
    .single();
  if (error) throw error;
  return data as Category;
}
