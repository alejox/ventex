import { createClient } from "@/utils/supabase/client";
import { SERVICE_UNIT, tracksStock } from "@/services/inventory.service";
import { createSaleWithFallback } from "@/lib/sale-discounts";

// ---- Tipos del dominio del POS ----
/** Un ítem del catálogo: producto (con stock) o servicio (sin stock). */
export interface CatalogItem {
  id: string;
  kind: "product" | "service";
  name: string;
  sku: string | null;
  /** Código del fabricante (EAN-13 / UPC). Los servicios no tienen. */
  barcode: string | null;
  price: number;
  /** Precio de la CAJA (IVA incluido). null = este ítem no se vende por caja. */
  package_price: number | null;
  /** Unidades sueltas que trae una caja. */
  units_per_package: number;
  /**
   * null = el ítem NO lleva inventario (un servicio). No es lo mismo que cero:
   * cero es "agotado" y null es "la pregunta no aplica". Todo lo que muestre o
   * limite stock tiene que preguntar por null antes que por el número.
   */
  stock_level: number | null;
  /** true = el precio se asigna al vender; `price` es solo el sugerido. */
  open_price: boolean;
  /** Si admite media unidad. Sale de la unidad de medida del producto. */
  allows_fractions: boolean;
  category_name: string | null;
  /**
   * FK cruda a `categories`. A diferencia de `category_name` (para agrupar y
   * buscar en la vitrina), esto es lo que necesita `offerDiscountsFor` para
   * saber si una OFERTA por categoría alcanza a este ítem. Los servicios no
   * tienen categoría propia, así que siempre llega `null` para ellos.
   */
  category_id: string | null;
  image_url: string | null;
  has_commission: boolean;
  commission_type: "percentage" | "fixed" | null;
  commission_value: number | null;
  /** Lo que dura un servicio, en minutos. Los productos no lo tienen. */
  duration_minutes?: number | null;
}

export interface CustomerOption {
  id: string;
  full_name: string;
  tax_exempt: boolean;
  doc_type: string | null;
  identification: string | null;
  /**
   * Aviso interno de crédito ("no fiar"). Se trae acá porque el mostrador es
   * DONDE sirve: en Créditos lo lee el dueño, que ya lo sabía.
   */
  credit_alert: boolean;
  credit_alert_note: string | null;
}

export interface StaffOption {
  id: string;
  full_name: string;
}

/** Qué se está vendiendo en la línea: la unidad suelta o la caja entera. */
export type SaleUnitKind = "unit" | "package";

export interface CartLine {
  item: CatalogItem;
  /**
   * Unidad o caja. Ausente = unidad (líneas viejas y servicios).
   * OJO: no confundir con `CatalogItem.kind`, que dice producto vs. servicio.
   */
  unitKind?: SaleUnitKind;
  quantity: number;
  discountAmount?: number;
  /**
   * Si `discountAmount` viene de una oferta automática (T5), el id y nombre
   * de esa oferta. `undefined` significa "sin oferta": o la línea no tiene
   * descuento, o el descuento lo puso el cajero a mano (DiscountModal, o el
   * premio de cortes en salón), que nunca llena estos dos campos.
   *
   * `offerDiscountsFor` en `services/offers.service.ts` usa justamente la
   * presencia/ausencia de `offerId` para distinguir "descuento manual, no
   * tocar" de "descuento de oferta, recalculable en cada cambio del carrito".
   */
  offerId?: string;
  offerName?: string;
  /**
   * La parte de `discountAmount` que puso el cajero a mano en el
   * DiscountModal. Es lo que viaja como `p_manual_discount` y lo único que a
   * un trabajador le exige el permiso `pos_discount` en `create_sale`; las
   * ofertas, el premio de cortes y los puntos no. `undefined` = nada manual.
   * La mantiene `setLineDiscounts` (ver `nextManualDiscount`).
   */
  manualDiscount?: number;
  staffId?: string | null;
  /**
   * Precio asignado en el mostrador. Solo lo aceptan los ítems `open_price`:
   * el RPC rechaza con PRECIO_NO_EDITABLE cualquier otro.
   *
   * `undefined` es "todavía no se asignó"; 0 es un precio válido —regalar una
   * unidad es una decisión del mostrador—, así que la comparación es contra
   * null y nunca un `||`.
   */
  customPrice?: number;
}

/**
 * Precio de la línea según lo que se esté vendiendo.
 *
 * Toda la app tiene que preguntar por acá y nunca leer `item.price` directo: si
 * un lugar se olvida, una caja se cobra a precio de unidad. El servidor igual
 * resuelve el precio por su cuenta en `create_sale` — esto es solo lo que ve el
 * cajero antes de cobrar.
 */
export function linePrice(line: CartLine): number {
  if (line.customPrice != null) return line.customPrice;
  if (line.unitKind === "package" && line.item.package_price != null) {
    return line.item.package_price;
  }
  return line.item.price;
}

/**
 * Tope de un descuento porcentual.
 *
 * El modal de descuentos aceptaba cualquier número mayor a cero: con 150% sobre
 * un ítem de $2.000 salía un descuento de $3.000 —más que el producto— y el
 * total quedaba en $0 sin un solo aviso. El `max="100"` del input era
 * decorativo: nada lo valida si el campo no está dentro de un form que se
 * envíe.
 */
export const MAX_DISCOUNT_PERCENT = 100;

/**
 * El porcentaje si es utilizable, o null.
 *
 * Devuelve null y no un valor recortado a propósito: recortar 150 a 100 en
 * silencio aplicaría un descuento que el cajero no pidió. Que falle y lo diga.
 */
export function parseDiscountPercent(raw: string): number | null {
  const percent = parseFloat(raw);
  if (!Number.isFinite(percent)) return null;
  if (percent < 0 || percent > MAX_DISCOUNT_PERCENT) return null;
  return percent;
}

/**
 * Descuento en plata de una línea, para un porcentaje YA validado.
 *
 * Va por `linePrice` y no por `item.price`: si no, una caja de $24.000 se
 * descontaría como si valiera lo que vale la unidad suelta.
 */
export function lineDiscountFor(line: CartLine, percent: number): number {
  return (linePrice(line) * line.quantity * percent) / 100;
}

/** Unidades sueltas que consume una línea: una caja son N. */
export function lineUnits(line: CartLine): number {
  if (line.unitKind === "package") return Math.max(line.item.units_per_package || 1, 1);
  return 1;
}

/** Clave de la línea en el carrito: el MISMO producto suelto y por caja son dos líneas. */
export function lineKey(itemId: string, kind: SaleUnitKind = "unit"): string {
  return `${itemId}:${kind}`;
}

/** La clave de una línea que ya está en el carrito. */
export function cartLineKey(line: CartLine): string {
  return lineKey(line.item.id, line.unitKind ?? "unit");
}

export interface SaleTotals {
  /** Suma de precios de vitrina (IVA incluido), antes de descuentos. */
  gross: number;
  /** Base gravable: el total sin IVA. */
  subtotal: number;
  taxAmount: number;
  discount: number;
  /** Rebaja por cliente exento de IVA (0 si no aplica). */
  exemptionDiscount: number;
  total: number;
}

export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "credito";

export interface PaymentSplit {
  payment_method: PaymentMethod;
  amount: number;
  transfer_method?: string | null;
  card_method?: string | null;
}

/** Línea de venta: lleva product_id o service_id según el tipo de ítem. */
interface CheckoutItem {
  product_id?: string;
  service_id?: string;
  quantity: number;
  staff_id?: string | null;
  /** "package" cobra el precio de caja y descuenta sus unidades. */
  kind?: SaleUnitKind;
  /** Precio asignado al vender. Solo para productos `open_price`. */
  unit_price?: number;
  /**
   * Descuento de ESTA línea (todos los canales), en centavos exactos. La base
   * lo guarda en `sale_items.discount_amount` y exige que sumen el total.
   * Ausente en ventas encoladas antes de que existiera.
   */
  discount_amount?: number;
}

export interface CheckoutInput {
  /** Context frozen before the network attempt; the RPC rejects a switch. */
  workspaceId: string;
  membershipId: string;
  shiftId: string | null;
  customerId: string | null;
  staffId: string | null;
  paymentMethod: PaymentMethod;
  transferMethod?: string | null;
  cardMethod?: string | null;
  /** Descuento TOTAL de la venta (manual + ofertas + premio + puntos). */
  discount: number;
  /**
   * Parte manual de `discount` (DiscountModal). Ausente en ventas encoladas
   * antes de esto: la base la toma como 0, igual que antes.
   */
  manualDiscount?: number;
  /** Efectivo recibido (solo efectivo sin pago dividido). null = no se anotó. */
  amountTendered?: number | null;
  items: CheckoutItem[];
  /** Desglosar IVA en esta venta. Sin esto manda la configuración del negocio. */
  includeTax?: boolean;
  /** Pagos divididos: si se envía, ignora paymentMethod/transferMethod/cardMethod. */
  splits?: PaymentSplit[];
  /**
   * Clave de idempotencia. Tiene que ser LA MISMA en cada reintento del mismo
   * carrito: es lo único que le permite al servidor distinguir "cobrame otra
   * vez" de "no supe si el cobro anterior entró". Ver `createSale`.
   */
  clientSaleId?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Totales de la venta para previsualización. Espejo de la matemática del RPC
 * `create_sale`: si cambia una, tiene que cambiar la otra.
 *
 * Los precios del catálogo son PRECIO FINAL AL PÚBLICO (IVA incluido), así que
 * el IVA se deriva hacia atrás: base = precio / (1 + tasa).
 *
 * El orden de los casos importa y es el mismo que el del RPC:
 *
 * - No responsable (`!includeTax`): no hay impuesto que reportar NI que eximir.
 *   Va primero: sin IVA cobrado, un cliente exento no tiene nada que descontar.
 * - Cliente exento: no paga IVA, así que paga la base. La diferencia contra el
 *   precio de vitrina es el descuento por exención.
 * - Responsable de IVA: el cliente paga el precio de vitrina y el recibo
 *   desglosa base + IVA.
 */
export function computeTotals(
  lines: CartLine[],
  taxRate: number,
  taxExempt: boolean,
  includeTax: boolean
): SaleTotals {
  const gross = round2(lines.reduce((s, l) => s + linePrice(l) * l.quantity, 0));
  const discount = round2(lines.reduce((s, l) => s + (l.discountAmount || 0), 0));
  const neto = Math.max(round2(gross - discount), 0);

  if (!includeTax) {
    return { gross, subtotal: neto, taxAmount: 0, discount, exemptionDiscount: 0, total: neto };
  }

  if (taxExempt) {
    const total = round2(neto / (1 + taxRate));
    return {
      gross,
      subtotal: total,
      taxAmount: 0,
      discount,
      exemptionDiscount: round2(neto - total),
      total,
    };
  }

  const subtotal = round2(neto / (1 + taxRate));
  return {
    gross,
    subtotal,
    taxAmount: round2(neto - subtotal),
    discount,
    exemptionDiscount: 0,
    total: neto,
  };
}

/** Catálogo del POS: productos (con stock) + servicios activos (sin stock). */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  const supabase = createClient();
  const [productsRes, servicesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode, unit, price, package_price, units_per_package, stock_level, tracks_stock, open_price, allows_fractions, image_url, has_commission, commission_type, commission_value, category_id, categories(name)")
      // Un servicio entra por `services`, nunca por acá: las filas con unidad
      // "Servicio" son legadas y su servicio ya viaja en la otra consulta.
      .neq("unit", SERVICE_UNIT)
      .order("name"),
    supabase
      .from("services")
      .select("id, name, price, image_url, has_commission, commission_type, commission_value, duration_minutes")
      .eq("status", "active")
      .order("name"),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (servicesRes.error) throw servicesRes.error;

  const rawProducts = productsRes.data ?? [];

  const services: CatalogItem[] = (servicesRes.data ?? []).map((s) => ({
    id: s.id,
    kind: "service" as const,
    name: s.name,
    sku: null,
    barcode: null,
    price: s.price,
    package_price: null,
    units_per_package: 1,
    stock_level: null,
    open_price: false,
    // Medio corte de pelo no existe, y los contadores de promociones suman
    // `quantity` sobre columnas enteras.
    allows_fractions: false,
    category_name: "Servicios",
    // Las ofertas de producto (T5) solo alcanzan productos, nunca servicios:
    // `product_offers.category_id` referencia `categories`, que es una tabla
    // del catálogo de PRODUCTOS.
    category_id: null,
    // Los servicios ya pueden tener foto y el POS la dibuja igual que la de un
    // producto: en el mostrador, reconocer "Corte y barba" por la imagen es lo
    // mismo para el cajero venga de la tabla que venga.
    image_url: s.image_url ?? null,
    has_commission: s.has_commission ?? false,
    commission_type: (s.commission_type ?? null) as "percentage" | "fixed" | null,
    commission_value: s.commission_value ?? null,
    duration_minutes: s.duration_minutes ?? null,
  }));

  // Antes acá había que deduplicar por nombre: un servicio se guardaba en las
  // dos tablas y el catálogo lo mostraba dos veces. Ese emparejado se cayó con
  // el gemelo — renombrar un servicio rompía el vínculo y el duplicado volvía.
  // Hoy cada mitad sale de su tabla y no hay superposición posible.
  const products: CatalogItem[] = rawProducts.map((p) => {
    // Supabase tipa el embed como array; en una relación to-one llega un objeto.
    const cat = p.categories as unknown as { name: string } | { name: string }[] | null;
    const category_name = Array.isArray(cat) ? (cat[0]?.name ?? null) : (cat?.name ?? null);
    return {
      id: p.id,
      kind: "product" as const,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? null,
      price: p.price,
      package_price: p.package_price ?? null,
      units_per_package: p.units_per_package ?? 1,
      // `null` es el contrato del POS para "no lleva inventario", y ya lo
      // entienden la vitrina, el carrito y el control de sobreventa. Un producto
      // sin inventario entra por esa misma puerta en vez de abrir otra.
      stock_level: tracksStock(p) ? p.stock_level : null,
      open_price: p.open_price ?? false,
      allows_fractions: p.allows_fractions ?? false,
      category_name,
      category_id: p.category_id ?? null,
      image_url: p.image_url ?? null,
      has_commission: p.has_commission ?? false,
      commission_type: (p.commission_type ?? null) as "percentage" | "fixed" | null,
      commission_value: p.commission_value ?? null,
    };
  });

  return [...products, ...services];
}

/** Miembros del equipo activos, para atribuir la venta (comisiones). */
export async function fetchStaff(): Promise<StaffOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffOption[];
}

export async function fetchCustomers(): Promise<CustomerOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, tax_exempt, doc_type, identification, credit_alert, credit_alert_note")
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    tax_exempt: c.tax_exempt ?? false,
    doc_type: c.doc_type ?? null,
    identification: c.identification ?? null,
    credit_alert: c.credit_alert ?? false,
    credit_alert_note: c.credit_alert_note ?? null,
  }));
}

export interface PosConfig {
  taxRate: number;
  /** Si el negocio desglosa IVA. false = no responsable de IVA. */
  includeTax: boolean;
  /** Si el POS puede cobrar más unidades de las que hay en stock. */
  allowOversell: boolean;
}

/**
 * Ajustes del negocio que condicionan el cobro. Los defaults tienen que
 * coincidir con los del RPC `create_sale` para un negocio sin fila en
 * `settings`: 19%, desglose activo y sobreventa permitida.
 */
export async function fetchPosConfig(): Promise<PosConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("tax_rate, include_tax, allow_oversell")
    .maybeSingle();
  if (error) throw error;
  return {
    taxRate: data?.tax_rate ?? 0.19,
    includeTax: data?.include_tax ?? true,
    allowOversell: data?.allow_oversell ?? true,
  };
}

/**
 * Registra la venta de forma transaccional vía RPC y devuelve el id de la venta.
 *
 * Es IDEMPOTENTE cuando se manda `clientSaleId`: el RPC guarda esa clave junto
 * a la venta y, si la vuelve a ver, devuelve el id de la que ya existe en vez
 * de crear una segunda. Sin la clave no hay forma de reintentar sin riesgo —
 * una respuesta perdida deja al cajero eligiendo entre duplicar la venta (y el
 * descuento de stock) o perderla.
 */
export async function createSale(input: CheckoutInput): Promise<string> {
  const supabase = createClient();

  // `database.types.ts` todavía describe la firma vieja (se regenera al
  // aplicar la migración), así que la llamada va sin tipar los argumentos.
  // Los nombres los arma `createSaleArgs`, que es lo que está testeado.
  const rpc = supabase.rpc as unknown as (
    fn: "create_sale",
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

  // Si la base todavía no tiene `p_manual_discount`/`p_amount_tendered`
  // (migración 20261006230000 sin aplicar), repite con la firma vieja — mismo
  // patrón que `voidSale`. La cola offline pasa por acá también, así que una
  // venta encolada se reenvía bien contra cualquiera de las dos bases.
  const { saleId, legacy } = await createSaleWithFallback(
    (args) => rpc.call(supabase, "create_sale", args),
    input,
    legacyCreateSale,
  );
  // Se recuerda para no pagar dos llamadas por venta el resto de la sesión.
  legacyCreateSale = legacy;
  return saleId;
}

/**
 * true = esta sesión ya vio que la base no conoce la firma nueva de
 * `create_sale`. Se reinicia al recargar: aplicada la migración, la próxima
 * sesión empieza a mandar los parámetros nuevos sin tocar código.
 */
let legacyCreateSale = false;

export async function createCustomer(params: {
  name: string;
  doc_type?: string;
  identification?: string;
  /** Opcionales: sirven para el domicilio y para mandarle el comprobante. */
  phone?: string;
  email?: string;
}): Promise<CustomerOption> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      full_name: params.name,
      doc_type: params.doc_type || null,
      identification: params.identification || null,
      phone: params.phone || null,
      email: params.email || null,
      tax_exempt: false,
    })
    .select("id, full_name, tax_exempt, doc_type, identification, credit_alert, credit_alert_note")
    .single();
  if (error) throw error;
  return data as CustomerOption;
}
