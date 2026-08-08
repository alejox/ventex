import { createClient } from "@/utils/supabase/client";
import { getSelectedWorkspaceId } from "@/services/workspace.service";
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
  status: string;
  units_per_package?: number;
  created_at: string;
  categories: { name: string } | null;
  distributors: { business_name: string } | null;
}

/**
 * Unidad reservada del catálogo.
 *
 * `products` no tiene columna de tipo: la unidad "Servicio" ES el discriminador
 * entre un producto y un servicio. Lo leen el inventario, el POS, las compras y
 * `create_sale`, así que vive acá y nadie lo escribe a mano.
 */
export const SERVICE_UNIT = "Servicio";

/**
 * Un servicio se cobra pero NO se inventaría.
 *
 * No descuenta stock al venderse, no se repone, no admite movimientos manuales
 * y no entra en la valorización. Un baño para mascotas no tiene existencias: si
 * el POS le descontaba unidades, terminaba en negativo sin que eso significara
 * nada.
 */
export function isServiceItem(item: { unit?: string | null }): boolean {
  return item.unit === SERVICE_UNIT;
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
 * Nombre de categoría tal como se guarda: recortado y en mayúsculas.
 *
 * Mayúsculas para que "Electronica" y "ELECTRONICA" no convivan como dos
 * categorías distintas fragmentando el inventario y los reportes.
 *
 * OJO: la Ñ y las tildes NO se tocan. Son letras del idioma, no ruido a
 * limpiar. Un `normalize("NFD")` para "quitar acentos" convertiría BAÑO en
 * BANO, que es un nombre distinto y además está mal escrito. Hay un test que
 * lo custodia.
 */
export function normalizeCategoryName(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * ¿Ya existe una categoría con ese nombre en la lista que el cliente tiene?
 *
 * Compara normalizado —igual que el índice único de la base—, así que
 * "Electronica" choca con "ELECTRONICA". Al editar hay que pasar `exceptId`:
 * si no, toda categoría choca consigo misma y nunca se la puede guardar.
 *
 * NO reemplaza al índice único: entre que la lista se cargó y el usuario
 * guarda, otra persona del mismo negocio pudo crear la misma categoría. Esto
 * evita el viaje al servidor y responde al instante; la base es la que decide.
 */
export function findDuplicateCategory(
  categories: Category[],
  name: string,
  exceptId?: string | null,
): Category | undefined {
  const target = normalizeCategoryName(name);
  return categories.find(
    (c) => c.id !== exceptId && normalizeCategoryName(c.name) === target,
  );
}

/**
 * ¿El error es un choque contra un índice único?
 *
 * PostgREST propaga el código de Postgres en `code`; 23505 es
 * `unique_violation`. Sin esto llegaba a la pantalla el texto crudo del índice
 * ("duplicate key value violates unique constraint..."), que no le dice nada a
 * un comerciante.
 */
export function isDuplicateName(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Obtiene el costo unitario real normalizado.
 *
 * Si el producto tiene `units_per_package > 1`, `purchase_price` representa el costo
 * de la caja/paquete completo, por lo que el costo unitario real es `purchase_price / units_per_package`.
 * En modo unidad (o si `units_per_package <= 1`), el costo unitario es simplemente `purchase_price`.
 */
export function getUnitCost(product: { purchase_price?: number | null; units_per_package?: number | null }): number {
  const purchasePrice = product.purchase_price ?? 0;
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) return 0;
  const units = Math.max(product.units_per_package ?? 1, 1);
  return purchasePrice / units;
}

/**
 * Calcula el valor total del inventario de una lista de productos usando el
 * costo unitario real normalizado * stock_level.
 *
 * Los servicios quedan fuera: no son mercadería, así que no hay capital parado
 * en ellos por más que la fila arrastre un stock viejo.
 */
export function calculateInventoryValue(
  products: Array<{
    unit?: string | null;
    purchase_price?: number | null;
    units_per_package?: number | null;
    stock_level: number;
  }>
): number {
  return products.reduce(
    (sum, p) => (isServiceItem(p) ? sum : sum + getUnitCost(p) * (p.stock_level || 0)),
    0,
  );
}

/**
 * Calcula el porcentaje de margen de ganancia real y el costo por unidad derivado.
 */
export function calculateMargin(
  purchaseTotalRaw: string | number,
  sellingTotalRaw: string | number,
  presentation: "unit" | "package",
  unitsPerPackageRaw?: string | number
): { pct: number; costPerUnit: number } | null {
  const cost = typeof purchaseTotalRaw === "number" ? purchaseTotalRaw : parseFloat(purchaseTotalRaw || "0");
  const price = typeof sellingTotalRaw === "number" ? sellingTotalRaw : parseFloat(sellingTotalRaw || "0");
  if (!(cost > 0) || !(price > 0)) return null;

  const rawUnits = typeof unitsPerPackageRaw === "number" ? unitsPerPackageRaw : parseInt(String(unitsPerPackageRaw || "1"));
  const units = presentation === "package" ? Math.max(rawUnits || 1, 1) : 1;
  const costPerUnit = cost / units;
  const pct = ((price - costPerUnit) / costPerUnit) * 100;
  return { pct, costPerUnit };
}

/**
 * Gestiona la transición limpia entre modos de presentación ("unit" vs "package"),
 * asegurando que no queden datos obsoletos de `units_per_package` ni `package_price`.
 */
export function handlePresentationModeChange(
  newMode: "unit" | "package",
  currentUnitsPerPackage?: string
): { units_per_package: string; package_price: string } {
  if (newMode === "unit") {
    return { units_per_package: "1", package_price: "" };
  } else {
    // Si viene de modo unidad (units_per_package era "1" o vacío), limpia para obligar la entrada limpia
    const units = currentUnitsPerPackage === "1" || !currentUnitsPerPackage ? "" : currentUnitsPerPackage;
    return { units_per_package: units, package_price: "" };
  }
}

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
  "commission_value, units_per_package";

const PRODUCT_SELECT = `${PRODUCT_COLUMNS}, categories(name), distributors(business_name)`;

/**
 * Completa los productos con su costo de compra.
 *
 * El RPC devuelve vacío cuando quien pregunta no tiene `inventory_costs`, así
 * que se puede llamar siempre: los productos simplemente quedan sin costo y la
 * UI no muestra la columna. La decisión de permiso vive en la base, en un solo
 * lugar, y no hay que duplicarla en cada pantalla que lea inventario.
 */
export async function attachCosts<T extends { id: string; purchase_price?: number }>(
  supabase: ReturnType<typeof createClient>,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await supabase.rpc("get_product_costs", {
    p_ids: rows.map((r) => r.id),
  });
  if (error) return rows;

  const costs = new Map<string, number>();
  for (const row of data ?? []) {
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
  const workspaceId = await getSelectedWorkspaceId();

  // Se convierte acá y no en cada formulario: así toda foto que entre al bucket
  // pasa por la misma compresión, venga del alta rápida o del form avanzado.
  const optimized = await toWebp(file);

  const ext = optimized.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;

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
  return (data ?? []).map((c) => ({
    ...c,
    name: (c.name || "").toUpperCase(),
  }));
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
  return attachCosts(supabase, (data ?? []) as unknown as Product[]);
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

/**
 * Existencias con las que nace o se guarda el ítem.
 *
 * Un servicio siempre queda en cero, y además con mínimo cero: el `minimum_stock`
 * por defecto es 10, y con ese valor un servicio aparecía eternamente en las
 * sugerencias de reposición pidiendo que le compraran unidades a un proveedor.
 * Se resuelve acá —la capa de I/O— y no en el formulario, porque hay dos altas
 * distintas (la página completa y el modal rápido) y ninguna de las dos puede
 * ser la que decide.
 */
function stockPatch(input: NewProductInput): { stock_level: number; minimum_stock?: number } {
  if (isServiceItem(input)) return { stock_level: 0, minimum_stock: 0 };
  return { stock_level: parseInt(input.stock_level || "0") };
}

export async function createProduct(input: NewProductInput): Promise<Product> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name.trim().toUpperCase(),
      category_id: input.category_id || null,
      distributor_id: input.distributor_id || null,
      sku: normalizeSku(input.sku),
      barcode: normalizeBarcode(input.barcode),
      unit: input.unit,
      ...costPatch(input.purchase_price),
      price: parseFloat(input.price),
      package_price: normalizePackagePrice(input.package_price),
      ...stockPatch(input),
      image_url: input.image_url || null,
      has_commission: input.has_commission,
      commission_type: input.has_commission ? input.commission_type : null,
      commission_value: input.has_commission ? parseFloat(input.commission_value) || null : null,
      units_per_package: parseInt(input.units_per_package || "1") || 1,
    })
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;
  const [withCost] = await attachCosts(supabase, [data as unknown as Product]);
  return withCost;
}

export async function archiveProduct(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("products")
    .update({ status: "inactive" })
    .eq("id", id);
  if (error) throw error;
}

export async function activateProduct(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("products")
    .update({ status: "active" })
    .eq("id", id);
  if (error) throw error;
}

export async function updateProduct(id: string, input: NewProductInput): Promise<Product> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name: input.name.trim().toUpperCase(),
      category_id: input.category_id || null,
      distributor_id: input.distributor_id || null,
      sku: normalizeSku(input.sku),
      barcode: normalizeBarcode(input.barcode),
      unit: input.unit,
      ...costPatch(input.purchase_price),
      price: parseFloat(input.price),
      package_price: normalizePackagePrice(input.package_price),
      ...stockPatch(input),
      image_url: input.image_url || null,
      has_commission: input.has_commission,
      commission_type: input.has_commission ? input.commission_type : null,
      commission_value: input.has_commission ? parseFloat(input.commission_value) || null : null,
      units_per_package: parseInt(input.units_per_package || "1") || 1,
    })
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw error;
  // El producto vuelve sin costo (la columna no es legible): se recupera por RPC
  // para que el store no quede con una fila a medias hasta el próximo refetch.
  const [withCost] = await attachCosts(supabase, [data as unknown as Product]);
  return withCost;
}

/** El índice único de la base rebota el duplicado; acá se traduce a español. */
const DUPLICATE_CATEGORY = "Ya existe una categoría con ese nombre.";

export async function createCategory(input: NewCategoryInput): Promise<Category> {
  const supabase = createClient();
  // user_id lo asigna el trigger/DEFAULT auth.uid().
  const { data, error } = await supabase
    .from("categories")
    .insert({
      name: normalizeCategoryName(input.name),
      description: input.description?.trim() || null,
    })
    .select("id, name, description")
    .single();
  if (isDuplicateName(error)) throw new Error(DUPLICATE_CATEGORY);
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, input: NewCategoryInput): Promise<Category> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .update({
      name: normalizeCategoryName(input.name),
      description: input.description?.trim() || null,
    })
    .eq("id", id)
    .select("id, name, description")
    .single();
  if (isDuplicateName(error)) throw new Error(DUPLICATE_CATEGORY);
  if (error) throw error;
  return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
