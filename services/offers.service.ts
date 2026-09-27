import { createClient } from "@/utils/supabase/client";
import { cartLineKey, linePrice } from "@/services/pos.service";
import type { CartLine } from "@/services/pos.service";
import type { Database } from "@/utils/supabase/database.types";

// ---- Dominio ----

export type OfferKind = "percent" | "amount" | "buy_n_pay_m";

/**
 * Una oferta de producto, tal como la usa tanto el gestor de Ajustes (T4)
 * como el motor de precios del POS (T3/T5). Un solo tipo para las dos
 * lecturas: el gestor necesita los mismos campos que el POS, más nada.
 */
export interface ProductOffer {
  id: string;
  name: string;
  kind: OfferKind;
  /** Porcentaje (0,100] o monto (>0). `null` en "lleva N paga M". */
  value: number | null;
  buyQty: number | null;
  payQty: number | null;
  /** Exactamente uno de los dos está definido (lo exige la base). */
  productId: string | null;
  categoryId: string | null;
  /** `null` = sin fecha de inicio/fin, la oferta corre siempre. */
  startsOn: string | null;
  endsOn: string | null;
  active: boolean;
}

/** Lo que un formulario junta antes de crear/editar una oferta. */
export interface OfferInput {
  name: string;
  kind: OfferKind;
  value: number | null;
  buyQty: number | null;
  payQty: number | null;
  productId: string | null;
  categoryId: string | null;
  startsOn: string | null;
  endsOn: string | null;
  active: boolean;
}

export interface LineOfferDiscount {
  /** La clave de línea del carrito (`cartLineKey`), no el id del producto. */
  key: string;
  discountAmount: number;
  offerId: string;
  offerName: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Hoy, en la fecha LOCAL del dispositivo (YYYY-MM-DD).
 *
 * No es `toISOString().slice(0,10)`: eso da la fecha en UTC, y un negocio en
 * Colombia (UTC-5) que cierra ofertas al fin del 30 vería la oferta caerse a
 * las 19:00 del 30, cuando en UTC ya es 31. `offerDiscountsFor` recibe la
 * fecha COMO STRING para poder testearse sin reloj; esta función es el único
 * lugar donde se lee `Date` de verdad.
 */
export function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function offerIsInWindow(offer: ProductOffer, today: string): boolean {
  if (!offer.active) return false;
  if (offer.startsOn && today < offer.startsOn) return false;
  if (offer.endsOn && today > offer.endsOn) return false;
  return true;
}

/**
 * ¿La oferta apunta al producto de esta línea?
 *
 * Las ofertas son de PRODUCTO, nunca de servicio: `product_offers.product_id`
 * y `.category_id` referencian `products`/`categories`, tablas que un
 * servicio no toca. `CatalogItem.category_id` ya viene `null` para todo ítem
 * `kind: "service"` (ver `pos.service.ts`), así que alcanza con chequear eso.
 */
function offerMatchesLine(offer: ProductOffer, line: CartLine): boolean {
  if (line.item.kind !== "product") return false;
  if (offer.productId) return line.item.id === offer.productId;
  if (offer.categoryId) return line.item.category_id === offer.categoryId;
  return false;
}

/**
 * Descuento de UNA oferta sobre UNA línea, sin compararla con otras.
 *
 * - `percent`: porcentaje sobre el total de la línea (precio de la
 *   presentación vendida × cantidad).
 * - `amount`: monto fijo POR UNIDAD, para que escale con la cantidad —"$2.000
 *   de descuento" en una gaseosa vendida de a 3 son $6.000, no $2.000 sueltos
 *   en un carrito de $18.000—, pero nunca más que el valor de la línea.
 * - `buy_n_pay_m`: unidades gratis = `floor(cantidad / buyQty) * (buyQty -
 *   payQty)`, valorizadas al precio de la línea. Cantidades fraccionarias
 *   (kg, m) se excluyen: "lleva 3 paga 2" no tiene sentido sobre 2,4 kg de
 *   algo, y forzar un entero ahí sería inventar una regla que nadie configuró.
 */
function offerDiscountForLine(offer: ProductOffer, line: CartLine): number {
  const price = linePrice(line);
  const qty = line.quantity;
  if (price <= 0 || qty <= 0) return 0;

  switch (offer.kind) {
    case "percent": {
      if (offer.value == null || offer.value <= 0) return 0;
      return round2(price * qty * (offer.value / 100));
    }
    case "amount": {
      if (offer.value == null || offer.value <= 0) return 0;
      return round2(Math.min(offer.value * qty, price * qty));
    }
    case "buy_n_pay_m": {
      const buyQty = offer.buyQty ?? 0;
      const payQty = offer.payQty ?? 0;
      if (buyQty <= 0 || payQty < 1 || payQty >= buyQty) return 0;
      if (!Number.isInteger(qty)) return 0;
      const freeUnits = Math.floor(qty / buyQty) * (buyQty - payQty);
      if (freeUnits <= 0) return 0;
      return round2(Math.min(freeUnits * price, price * qty));
    }
    default:
      return 0;
  }
}

/**
 * Ofertas automáticas aplicables al carrito actual, una por línea.
 *
 * Reglas (fijadas por el plan de la feature, no se re-deciden acá):
 * - Una línea con un descuento MANUAL ya puesto (`discountAmount > 0` y sin
 *   `offerId`) se deja intacta: no hay stacking entre "el cajero descontó a
 *   mano" y "el catálogo ofrece un precio". Una línea que en cambio arrastra
 *   un `offerId` de una pasada anterior SÍ se recalcula — es lo que le
 *   permite al store reaccionar cuando cambia la cantidad o el catálogo de
 *   ofertas sin que esto se confunda con un descuento manual.
 * - Entre varias ofertas que alcanzan a la misma línea, gana la de MAYOR
 *   descuento para esa línea.
 * - Solo se devuelven líneas con una oferta aplicable; el llamador decide qué
 *   hacer con las que se quedaron sin ninguna (ver `pos.store.ts`).
 *
 * `today` se recibe como string (YYYY-MM-DD, hora LOCAL del negocio) y nunca
 * se lee del reloj acá: es lo que hace esto determinístico y testeable.
 */
export function offerDiscountsFor(
  cart: CartLine[],
  offers: ProductOffer[],
  today: string,
): LineOfferDiscount[] {
  const applicable = offers.filter((o) => offerIsInWindow(o, today));
  if (applicable.length === 0) return [];

  const results: LineOfferDiscount[] = [];
  for (const line of cart) {
    const hasManualDiscount = (line.discountAmount ?? 0) > 0 && !line.offerId;
    if (hasManualDiscount) continue;

    let best: { offer: ProductOffer; amount: number } | null = null;
    for (const offer of applicable) {
      if (!offerMatchesLine(offer, line)) continue;
      const amount = offerDiscountForLine(offer, line);
      if (amount > 0 && (!best || amount > best.amount)) {
        best = { offer, amount };
      }
    }
    if (best) {
      results.push({
        key: cartLineKey(line),
        discountAmount: best.amount,
        offerId: best.offer.id,
        offerName: best.offer.name,
      });
    }
  }
  return results;
}

/**
 * `offerDiscountsFor` más el lado "apagar lo que ya no aplica": el store del
 * POS (T5) llama a esto en vez de a `offerDiscountsFor` directo, porque
 * además de calcular necesita:
 *
 * - Respetar `removedKeys`: líneas donde el cajero apretó "Quitar" para ESTA
 *   venta. Se excluyen del cálculo y, si venían con una oferta puesta, se les
 *   limpia `discountAmount`/`offerId`/`offerName`.
 * - Apagar la oferta de una línea que la tenía pero dejó de calificar (bajó
 *   la cantidad, la oferta se desactivó, venció la fecha): sin esto, una vez
 *   aplicada la oferta quedaría pegada al carrito para siempre.
 *
 * Devuelve el carrito COMPLETO (no solo los cambios) para que el store lo
 * pueda usar como el nuevo `cart` de la pestaña activa.
 */
export function applyOfferDiscounts(
  cart: CartLine[],
  offers: ProductOffer[],
  removedKeys: string[],
  today: string,
): CartLine[] {
  const eligible = cart.filter((line) => !removedKeys.includes(cartLineKey(line)));
  const results = offerDiscountsFor(eligible, offers, today);
  const byKey = new Map(results.map((r) => [r.key, r]));

  return cart.map((line) => {
    const key = cartLineKey(line);

    if (removedKeys.includes(key)) {
      if (!line.offerId) return line;
      return { ...line, discountAmount: 0, offerId: undefined, offerName: undefined };
    }

    const result = byKey.get(key);
    if (result) {
      return {
        ...line,
        discountAmount: result.discountAmount,
        offerId: result.offerId,
        offerName: result.offerName,
      };
    }

    // Tenía una oferta y dejó de calificar: se apaga. No se toca si nunca
    // tuvo una (podría ser una línea sin descuento y sin oferta, tal cual).
    if (line.offerId) {
      return { ...line, discountAmount: 0, offerId: undefined, offerName: undefined };
    }
    return line;
  });
}

// ---- I/O (Supabase) ----

type OfferRow = Database["public"]["Tables"]["product_offers"]["Row"];

function fromRow(row: OfferRow): ProductOffer {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as OfferKind,
    value: row.value,
    buyQty: row.buy_qty,
    payQty: row.pay_qty,
    productId: row.product_id,
    categoryId: row.category_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    active: row.active,
  };
}

function toRow(input: OfferInput) {
  return {
    name: input.name,
    kind: input.kind,
    value: input.value,
    buy_qty: input.buyQty,
    pay_qty: input.payQty,
    product_id: input.productId,
    category_id: input.categoryId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    active: input.active,
  };
}

/** Todas las ofertas del negocio (activas e inactivas), para el gestor de Ajustes. */
export async function fetchOffers(): Promise<ProductOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_offers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

/** Solo las activas, para el motor de precios del POS (T5). */
export async function fetchActiveOffers(): Promise<ProductOffer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_offers")
    .select("*")
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function createOffer(input: OfferInput): Promise<ProductOffer> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_offers")
    .insert(toRow(input))
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function updateOffer(id: string, input: OfferInput): Promise<ProductOffer> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_offers")
    .update(toRow(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function setOfferActive(id: string, active: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("product_offers").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function deleteOffer(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("product_offers").delete().eq("id", id);
  if (error) throw error;
}
