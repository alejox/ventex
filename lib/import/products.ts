import type { ImportEntity, RecordResult } from "./core";
import { normalizeText, optionalText, parseNumberCO, parseYesNo } from "./values";

/**
 * Importación de PRODUCTOS. Solo productos: un servicio vive en `services` y
 * la base rechaza un producto con `unit = 'Servicio'`
 * (`products_unit_is_not_service`). Si el archivo trae una fila marcada como
 * servicio —por ejemplo, porque es un catálogo exportado de acá mismo— esa
 * fila se rechaza con un mensaje claro en vez de rebotar contra la base.
 */

/** Unidades del formulario de producto, con su escritura canónica. */
export const PRODUCT_UNITS = ["Unidad", "kg", "g", "lb", "L", "ml", "m", "cm", "Par", "Docena", "Caja", "Pack"];

/** Las que admiten cantidades con decimales (igual que la columna generada `allows_fractions`). */
const FRACTIONAL_UNITS = new Set(["kg", "g", "lb", "L", "ml", "m", "cm"]);

const UNIT_ALIASES: Record<string, string> = {
  und: "Unidad", un: "Unidad", unid: "Unidad", unidades: "Unidad", u: "Unidad",
  kilo: "kg", kilos: "kg", kilogramo: "kg", kilogramos: "kg",
  gramo: "g", gramos: "g", gr: "g",
  libra: "lb", libras: "lb",
  litro: "L", litros: "L", lt: "L", l: "L",
  mililitro: "ml", mililitros: "ml",
  metro: "m", metros: "m", centimetro: "cm", centimetros: "cm",
  pares: "Par", docenas: "Docena", cajas: "Caja", paquete: "Pack", paquetes: "Pack",
};

export interface ProductImportRecord {
  name: string;
  price: number;
  sku: string | null;
  barcode: string | null;
  categoryName: string | null;
  cost: number | null;
  stock: number | null;
  minimumStock: number | null;
  /** `null` si la columna vino vacía: el ALTA usa la unidad por defecto y la
   *  ACTUALIZACIÓN no la toca (una celda vacía no es un pedido de cambio). */
  unit: string | null;
  /** `null` = no especificado: alta con inventario, actualización sin cambio. */
  tracksStock: boolean | null;
  distributorName: string | null;
}

/** Excel convierte códigos largos en `7,70123E+12`: los dígitos ya se perdieron. */
const SCIENTIFIC = /^\d+([.,]\d+)?e\+?\d+$/i;

export function parseUnit(raw: string): { unit: string | null; isService: boolean } {
  const s = raw.trim();
  if (s === "") return { unit: null, isService: false };
  const n = normalizeText(s);
  if (n === "servicio" || n === "servicios") return { unit: null, isService: true };
  const exact = PRODUCT_UNITS.find((u) => normalizeText(u) === n);
  if (exact) return { unit: exact, isService: false };
  return { unit: UNIT_ALIASES[n] ?? null, isService: false };
}

const SERVICE_ERROR =
  "Es un servicio: los servicios no se importan como productos. Créalo en Productos y servicios → Servicio";

export function productRecordOf(values: Record<string, string>): RecordResult<ProductImportRecord> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (normalizeText(values.kind ?? "").startsWith("servicio")) {
    return { record: null, errors: [SERVICE_ERROR] };
  }

  const name = values.name.trim();
  if (!name) errors.push("Falta el nombre");

  const price = parseNumberCO(values.price);
  if (!price.ok) errors.push(`Precio de venta: ${price.error}`);
  else if (price.value === null) errors.push("Falta el precio de venta");
  else if (price.value <= 0) errors.push("El precio de venta debe ser mayor que cero");

  const cost = parseNumberCO(values.cost ?? "");
  if (!cost.ok) errors.push(`Costo: ${cost.error}`);
  else if (cost.value !== null && cost.value < 0) errors.push("El costo no puede ser negativo");

  const { unit, isService } = parseUnit(values.unit ?? "");
  if (isService) return { record: null, errors: [SERVICE_ERROR] };
  if (!unit && (values.unit ?? "").trim()) errors.push(`Unidad "${values.unit}" no reconocida. Usa: ${PRODUCT_UNITS.join(", ")}`);

  const tracks = parseYesNo(values.tracksStock ?? "");
  if (!tracks.ok) errors.push(`Lleva inventario: ${tracks.error}`);
  const tracksStock = tracks.ok ? tracks.value : null;

  const stock = parseNumberCO(values.stock ?? "");
  if (!stock.ok) errors.push(`Stock inicial: ${stock.error}`);
  else if (stock.value !== null) {
    if (stock.value < 0) errors.push("El stock inicial no puede ser negativo");
    else if (!FRACTIONAL_UNITS.has(unit ?? "Unidad") && !Number.isInteger(stock.value)) {
      errors.push(`Stock inicial con decimales: la unidad "${unit ?? "Unidad"}" se cuenta en enteros`);
    }
    if (tracksStock === false && stock.value) warnings.push("No lleva inventario: el stock inicial se ignora");
  }

  const minimum = parseNumberCO(values.minimumStock ?? "");
  if (!minimum.ok) errors.push(`Stock mínimo: ${minimum.error}`);
  else if (minimum.value !== null && minimum.value < 0) errors.push("El stock mínimo no puede ser negativo");

  const barcode = optionalText(values.barcode);
  if (barcode && SCIENTIFIC.test(barcode)) {
    errors.push("Excel convirtió el código de barras a notación científica: formatea la columna como Texto y vuelve a escribirlo");
  }
  const sku = optionalText(values.sku);
  if (sku && SCIENTIFIC.test(sku)) {
    errors.push("Excel convirtió el SKU a notación científica: formatea la columna como Texto");
  }

  if (errors.length > 0) return { record: null, errors, warnings };
  return {
    record: {
      name,
      price: (price as { ok: true; value: number }).value,
      sku: sku ? sku.toUpperCase() : null,
      barcode,
      categoryName: optionalText(values.category),
      cost: cost.ok ? cost.value : null,
      stock: tracksStock !== false && stock.ok ? stock.value : null,
      minimumStock: minimum.ok ? minimum.value : null,
      unit,
      tracksStock,
      distributorName: optionalText(values.distributor),
    },
    errors,
    warnings,
  };
}

export const PRODUCT_IMPORT: ImportEntity<ProductImportRecord> = {
  noun: "productos",
  columns: [
    { key: "name", label: "Nombre", required: true, aliases: ["producto", "nombre del producto", "descripcion", "item", "ítem"], example: "Gaseosa 400 ml", help: "Se guarda tal como lo escribas." },
    { key: "price", label: "Precio de venta", required: true, aliases: ["precio", "precio venta", "pvp", "valor"], example: "3500", help: "Precio final con IVA incluido. Acepta 3500, 3.500 o $ 3.500." },
    { key: "sku", label: "SKU", aliases: ["referencia", "ref", "codigo interno", "código interno"], example: "GAS-400", help: "Opcional. Si ya existe un producto con ese SKU, se actualiza o se omite (lo eliges al importar)." },
    { key: "barcode", label: "Código de barras", aliases: ["codigo", "código", "ean", "upc", "codigo de barra"], example: "7702004001234", help: "Opcional. Formatea la columna como Texto para que Excel no lo convierta." },
    { key: "category", label: "Categoría", aliases: ["categoria"], example: "Bebidas", help: "Opcional. Si no existe, se crea." },
    { key: "cost", label: "Costo", aliases: ["costo unitario", "precio de compra", "precio compra"], example: "2200", help: "Opcional. Costo de compra por unidad." },
    { key: "stock", label: "Stock inicial", aliases: ["stock", "existencias", "cantidad", "inventario inicial"], example: "24", help: "Solo para productos NUEVOS. El stock de uno existente no se cambia por acá: usa Movimientos." },
    { key: "minimumStock", label: "Stock mínimo", aliases: ["minimo", "mínimo", "stock minimo"], example: "6", help: "Opcional. Por debajo de este número aparece en Stock bajo." },
    { key: "unit", label: "Unidad", aliases: ["unidad de medida", "medida"], example: "Unidad", help: `Una de: ${PRODUCT_UNITS.join(", ")}. Vacío = Unidad.` },
    { key: "tracksStock", label: "Lleva inventario", aliases: ["controla stock", "controla inventario", "inventario"], example: "Sí", help: "Sí o No. Vacío = Sí." },
    { key: "distributor", label: "Proveedor", aliases: ["distribuidor"], example: "", help: "Opcional. Nombre de un proveedor que ya exista." },
    { key: "kind", label: "Tipo", aliases: [], example: "Producto", help: "Opcional. Las filas de tipo Servicio se rechazan: los servicios no se importan como productos." },
  ],
  toRecord: productRecordOf,
  keysOf: (r) => [r.sku ? `sku:${r.sku.toUpperCase()}` : null, r.barcode ? `barcode:${r.barcode}` : null].filter(
    (k): k is string => k !== null,
  ),
  keyLabels: { sku: "SKU", barcode: "código de barras" },
};

/** Índice de lo que ya existe, con las mismas claves que `keysOf`. */
export function existingProductKeys(
  products: { id: string; sku: string | null; barcode: string | null; unit?: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of products) {
    if (p.unit === "Servicio") continue;
    if (p.sku) map.set(`sku:${p.sku.toUpperCase()}`, p.id);
    if (p.barcode) map.set(`barcode:${p.barcode.trim()}`, p.id);
  }
  return map;
}

/**
 * Avisos que dependen de lo que ya hay en el negocio y no del archivo solo:
 * categorías que se van a crear y proveedores que no existen (el producto
 * queda sin proveedor; no se inventa uno a partir de un nombre).
 * Además: el stock de un producto EXISTENTE no se toca por importación.
 */
export function annotateProductPreview<P extends { record: ProductImportRecord | null; warnings: string[]; action: string }>(
  rows: P[],
  categoryNames: string[],
  distributorNames: string[],
): P[] {
  const cats = new Set(categoryNames.map((n) => normalizeText(n)));
  const dists = new Set(distributorNames.map((n) => normalizeText(n)));
  return rows.map((row) => {
    const r = row.record;
    if (!r || row.action === "error" || row.action === "skip") return row;
    const warnings = [...row.warnings];
    if (r.categoryName && !cats.has(normalizeText(r.categoryName))) {
      warnings.push(`Categoría nueva: se creará "${r.categoryName.toUpperCase()}"`);
    }
    if (r.distributorName && !dists.has(normalizeText(r.distributorName))) {
      warnings.push(`El proveedor "${r.distributorName}" no existe: quedará sin proveedor`);
    }
    if (row.action === "update" && r.stock !== null) {
      warnings.push("El stock de un producto existente no se cambia al importar: usa Movimientos");
    }
    return { ...row, warnings };
  });
}
