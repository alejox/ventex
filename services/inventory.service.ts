import { createClient } from "@/utils/supabase/client";
import { toWebp } from "@/lib/image";

// ---- Tipos del dominio de inventario ----
export interface DistributorBrief {
  id: string;
  business_name: string;
}
export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  distributor_id: string | null;
  parent_product_id: string | null;
  sku: string;
  /** Código del fabricante (EAN-13 / UPC) impreso en el empaque. */
  barcode: string | null;
  unit: string;
  purchase_price?: number;
  price: number;
  /** Precio de venta de la CAJA (IVA incluido). null = no se vende por caja. */
  package_price: number | null;
  stock_level: number;
  minimum_stock: number;
  image_url: string | null;
  has_commission: boolean;
  commission_type: string | null;
  commission_value: number | null;
  units_per_package?: number;
  created_at: string;
  categories: { name: string } | null;
  distributors: { business_name: string } | null;
  parent_product?: { name: string } | null;
  variants?: Product[];
}

/**
 * SKU autogenerado para productos que se crean sin uno propio.
 *
 * Vive acá y no en el componente porque generar identificadores es lógica de
 * dominio, y además `Math.random` no puede llamarse dentro del cuerpo de un
 * componente (regla `react-hooks/purity`: el compilador de React no distingue
 * el handler del render).
 *
 * Lleva marca de tiempo en base 36 y no solo azar: hay un índice ÚNICO sobre
 * `(user_id, sku)`, y desde que el SKU es opcional este generador pasó a ser el
 * camino normal, no la excepción. Con `Math.random() * 100000` a secas, un
 * catálogo de unos cientos de productos empieza a chocar y el usuario recibe un
 * "duplicate key" que no entiende ni puede resolver.
 */
export function generateSku(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  // 4 caracteres de azar (36^4 = 1.679.616) y no 2: con 2, todo lo creado
  // dentro del mismo milisegundo compite por apenas 1.296 valores, y una carga
  // masiva de productos chocaba. Medido: 20.000 SKU en ráfaga pasaron de 8.807
  // colisiones a 0.
  const noise = Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, "0");
  return `PRD-${stamp}${noise}`;
}

/**
 * El SKU es opcional PARA EL USUARIO, no en la base: la columna es NOT NULL y
 * tiene índice único por negocio. Si el campo llega vacío se genera uno.
 */
function normalizeSku(raw: string): string {
  const value = raw.trim();
  return value === "" ? generateSku() : value;
}

/** Datos del formulario de producto (campos en string tal como llegan del form). */
export interface NewProductInput {
  name: string;
  category_id: string;
  distributor_id: string;
  parent_product_id?: string;
  sku: string;
  barcode?: string;
  unit: string;
  purchase_price: string;
  price: string;
  package_price?: string;
  stock_level?: string;
  image_url: string;
  has_commission: boolean;
  commission_type: string;
  commission_value: string;
  units_per_package?: string;
}



export interface NewCategoryInput {
  name: string;
  description: string;
}

/**
 * El producto padre es una auto-relación de `products`, así que el embed apunta
 * a la propia tabla con alias y se desambigua con la COLUMNA (`!parent_product_id`):
 * en auto-relaciones PostgREST no resuelve la pista por nombre de constraint.
 */
/**
 * Columnas de `products` legibles con la clave pública.
 *
 * NO puede ser `*`: a `authenticated` se le revocó el SELECT sobre
 * `purchase_price`, así que un `select *` devuelve "permission denied for table
 * products". El costo se pide aparte con `attachCosts`, vía el RPC
 * `get_product_costs`, que es quien evalúa el permiso `inventory_costs`.
 *
 * Si agregás una columna a la tabla, agregala también acá y al GRANT.
 */
const PRODUCT_COLUMNS =
  "id, created_at, updated_at, user_id, name, sku, barcode, price, package_price, stock_level, image_url, status, " +
  "category_id, unit, distributor_id, minimum_stock, icon, has_commission, commission_type, " +
  "commission_value, units_per_package, parent_product_id";

const PRODUCT_SELECT =
  `${PRODUCT_COLUMNS}, categories(name), distributors(business_name), parent_product:products!parent_product_id(name)`;

/**
 * Completa los productos con su costo de compra.
 *
 * El RPC devuelve vacío cuando quien pregunta no tiene `inventory_costs`, así
 * que se puede llamar siempre: los productos simplemente quedan sin costo y la
 * UI no muestra la columna. La decisión de permiso vive en la base, en un solo
 * lugar, y no hay que duplicarla en cada pantalla que lea inventario.
 */
async function attachCosts<T extends { id: string; purchase_price?: number }>(
  supabase: ReturnType<typeof createClient>,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await supabase.rpc("get_product_costs" as never, {
    p_ids: rows.map((r) => r.id),
  } as never);
  // Un fallo acá no puede tumbar el inventario: se muestra sin costos.
  if (error) return rows;

  const costs = new Map<string, number>();
  for (const row of (data ?? []) as { product_id: string; purchase_price: number }[]) {
    costs.set(row.product_id, Number(row.purchase_price));
  }
  return rows.map((r) => (costs.has(r.id) ? { ...r, purchase_price: costs.get(r.id) } : r));
}

const PRODUCT_IMAGES_BUCKET = "product-images";

const DISTRIBUTOR_SELECT = "id, business_name";

/**
 * Sube una imagen de producto al bucket de Storage bajo la carpeta del usuario
 * (`${user_id}/...`, exigido por las políticas RLS) y devuelve su URL pública.
 */
export async function uploadProductImage(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  // Se convierte acá y no en cada formulario: así toda foto que entre al bucket
  // pasa por la misma compresión, venga del alta rápida o del form avanzado.
  const optimized = await toWebp(file);

  const ext = optimized.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, optimized, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, description")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchDistributors(): Promise<DistributorBrief[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("distributors")
    .select(DISTRIBUTOR_SELECT)
    .order("business_name");
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
  const all = await attachCosts(supabase, (data ?? []) as unknown as Product[]);

  const variantsMap: Record<string, Product[]> = {};
  for (const p of all) {
    if (p.parent_product_id) {
      if (!variantsMap[p.parent_product_id]) variantsMap[p.parent_product_id] = [];
      variantsMap[p.parent_product_id].push(p);
    }
  }

  return all.map((p) => ({
    ...p,
    variants: variantsMap[p.id] ?? [],
  }));
}

/**
 * El costo solo viaja si el formulario lo trae.
 *
 * Quien puede editar productos pero no ver costos recibe el campo vacío: si se
 * mandara igual, guardar un cambio de nombre le borraría el costo real al
 * dueño. Omitirlo deja la columna intacta (y el trigger de la base rechaza el
 * cambio si alguien lo fuerza igual).
 */
function costPatch(raw: string): { purchase_price?: number } {
  const value = parseFloat(raw);
  return raw.trim() !== "" && Number.isFinite(value) ? { purchase_price: value } : {};
}

/**
 * El código de barras vacío se guarda como NULL, nunca como "".
 *
 * El índice único es por (user_id, barcode) y solo ignora los NULL: si se
 * guardara la cadena vacía, el segundo producto sin código chocaría contra el
 * primero con un error de duplicado.
 */
/**
 * Precio de caja vacío = NULL, no 0.
 *
 * Un 0 significaría "la caja sale gratis" y `create_sale` la dejaría vender;
 * NULL es lo que hace que el producto simplemente no se venda por caja.
 */
function normalizePackagePrice(raw: string | undefined): number | null {
  const value = parseFloat((raw ?? "").trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeBarcode(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  return value === "" ? null : value;
}

export async function createProduct(input: NewProductInput): Promise<Product> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      category_id: input.category_id || null,
      distributor_id: input.distributor_id || null,
      parent_product_id: input.parent_product_id || null,
      sku: normalizeSku(input.sku),
      barcode: normalizeBarcode(input.barcode),
      unit: input.unit,
      ...costPatch(input.purchase_price),
      price: parseFloat(input.price),
      package_price: normalizePackagePrice(input.package_price),
      stock_level: parseInt(input.stock_level || "0"),
      image_url: input.image_url || null,
      has_commission: input.has_commission,
      commission_type: input.has_commission ? input.commission_type : null,
      commission_value: input.has_commission ? parseFloat(input.commission_value) || null : null,
      units_per_package: parseInt(input.units_per_package || "1") || 1,
    } as never)
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;
  // El producto vuelve sin costo (la columna no es legible): se recupera por RPC
  // para que el store no quede con una fila a medias hasta el próximo refetch.
  const [withCost] = await attachCosts(supabase, [data as unknown as Product]);
  return withCost;
}

export async function updateProduct(id: string, input: NewProductInput): Promise<Product> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name: input.name,
      category_id: input.category_id || null,
      distributor_id: input.distributor_id || null,
      parent_product_id: input.parent_product_id || null,
      sku: normalizeSku(input.sku),
      barcode: normalizeBarcode(input.barcode),
      unit: input.unit,
      ...costPatch(input.purchase_price),
      price: parseFloat(input.price),
      package_price: normalizePackagePrice(input.package_price),
      stock_level: parseInt(input.stock_level || "0"),
      image_url: input.image_url || null,
      has_commission: input.has_commission,
      commission_type: input.has_commission ? input.commission_type : null,
      commission_value: input.has_commission ? parseFloat(input.commission_value) || null : null,
      units_per_package: parseInt(input.units_per_package || "1") || 1,
    } as never)
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;
  // El producto vuelve sin costo (la columna no es legible): se recupera por RPC
  // para que el store no quede con una fila a medias hasta el próximo refetch.
  const [withCost] = await attachCosts(supabase, [data as unknown as Product]);
  return withCost;
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
