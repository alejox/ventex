import { createClient } from "@/utils/supabase/client";
import { cartLineKey, linePrice } from "@/services/pos.service";
import type { CartLine } from "@/services/pos.service";

// ---- Dominio ----

export interface LoyaltyConfig {
  enabled: boolean;
  /** Pesos gastados por punto ganado. `null` = el negocio no fijó una tasa. */
  pesoPerPoint: number | null;
  /** Valor en $ de un punto al canjear. `null` = no se puede canjear. */
  pointsValue: number | null;
  /** Mínimo de puntos que se pueden canjear de una vez. 0 = sin mínimo. */
  minRedeem: number;
}

export const EMPTY_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: false,
  pesoPerPoint: null,
  pointsValue: null,
  minRedeem: 0,
};

export type LoyaltyLedgerKind = "earn" | "redeem" | "reverse" | "adjust";

export interface LoyaltyLedgerEntry {
  id: string;
  kind: LoyaltyLedgerKind;
  points: number;
  saleId: string | null;
  note: string | null;
  createdAt: string;
}

export interface LoyaltyLineDiscount {
  /** La clave de línea del carrito (`cartLineKey`), no el id del producto. */
  key: string;
  discountAmount: number;
}

export interface AppliedLoyaltyPoints {
  points: number;
  amount: number;
  customerId: string;
  previous: LoyaltyLineDiscount[];
  applied: { key: string; quantity: number; unitPrice: number; discountAmount: number }[];
}

/** A redemption is valid only while every discounted line is unchanged. */
export function loyaltyRedemptionMatches(
  cart: CartLine[],
  customerId: string | null,
  redemption: AppliedLoyaltyPoints,
): boolean {
  if (customerId !== redemption.customerId || redemption.applied.length === 0) return false;
  return redemption.applied.every((snapshot) => {
    const line = cart.find((candidate) => cartLineKey(candidate) === snapshot.key);
    return !!line && line.quantity === snapshot.quantity &&
      linePrice(line) === snapshot.unitPrice &&
      round2(line.discountAmount ?? 0) === snapshot.discountAmount;
  });
}

/** Restore pre-redemption discounts on lines still in the cart, capped to their current value. */
export function loyaltyDiscountsToRestore(
  cart: CartLine[],
  redemption: AppliedLoyaltyPoints,
): LoyaltyLineDiscount[] {
  return redemption.previous.flatMap((entry) => {
    const line = cart.find((candidate) => cartLineKey(candidate) === entry.key);
    if (!line) return [];
    return [{ key: entry.key, discountAmount: Math.min(entry.discountAmount, linePrice(line) * line.quantity) }];
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- Lógica pura ----

/**
 * Puntos que otorga una venta, dado su total ya cobrado (neto, con IVA — el
 * mismo `sales.total` que congela `create_sale`) y la tasa del negocio.
 *
 * Espejo del trigger `earn_loyalty_points` (migración 20260927010000): se
 * redondea hacia abajo, así que $9.999 con una tasa de $1.000/punto ganan 9
 * puntos, no 10 — regalar el punto de más sería inventar plata que la base
 * nunca otorgó.
 */
export function pointsEarnedFor(total: number, pesoPerPoint: number | null): number {
  if (pesoPerPoint == null || pesoPerPoint <= 0 || total <= 0) return 0;
  return Math.floor(total / pesoPerPoint);
}

/**
 * Tope de puntos canjeables en ESTA venta: no más que el saldo del cliente, y
 * no más de lo que la venta vale (canjear de más regalaría plata además de
 * puntos). `pointsValue` en `null`/`<=0` significa "no se puede canjear".
 */
export function maxRedeemablePoints(
  balance: number,
  saleTotal: number,
  pointsValue: number | null,
): number {
  if (pointsValue == null || pointsValue <= 0) return 0;
  if (balance <= 0 || saleTotal <= 0) return 0;
  const capByTotal = Math.floor(saleTotal / pointsValue);
  return Math.max(0, Math.min(balance, capByTotal));
}

/** El descuento en $ que representan N puntos, al valor configurado. */
export function pointsDiscountAmount(points: number, pointsValue: number | null): number {
  if (pointsValue == null || pointsValue <= 0 || points <= 0) return 0;
  return round2(points * pointsValue);
}

/**
 * Reparte el descuento de los puntos canjeados entre las líneas del carrito,
 * PARA PASARLE EL RESULTADO A `setLineDiscounts` (mismo mecanismo que ya usa
 * el premio de cortes en salón — ver `app/dashboard/pos/page.tsx`).
 *
 * Se aplica DESPUÉS de las ofertas y sobre lo que le queda a cada línea: el
 * "remanente" de una línea es `linePrice*qty - discountAmount` actual (que ya
 * incluye lo que haya puesto una oferta automática o un descuento manual), y
 * se reparte empezando por la línea con MÁS remanente, saturando cada una
 * antes de pasar a la siguiente. Así una sola línea nunca queda con más
 * descuento que lo que vale, y el total nunca supera lo que la venta vale.
 *
 * Límite conocido y documentado (AGENTS.md, "Puntos de tienda"): si una línea
 * ya tenía una oferta o un descuento manual, el monto que se le suma acá pasa
 * a viajar en `discountAmount` sin distinguir de dónde vino cada parte — igual
 * que ya pasa con cualquier descuento manual sobre una línea con oferta (no
 * hay stacking visible, solo el número final). `setLineDiscounts` limpia
 * `offerId`/`offerName` de esa línea: dejar de canjear puntos no resucita la
 * oferta automática ahí, el cajero tiene que volver a aplicarla si corresponde
 * (mismo comportamiento que ya tiene cualquier descuento manual hoy).
 */
export function loyaltyLineDiscounts(
  cart: CartLine[],
  pointsValue: number | null,
  points: number,
): LoyaltyLineDiscount[] {
  let remaining = pointsDiscountAmount(points, pointsValue);
  if (remaining <= 0) return [];

  const lines = cart
    .map((line) => {
      const current = line.discountAmount ?? 0;
      const lineTotal = linePrice(line) * line.quantity;
      return {
        key: cartLineKey(line),
        current,
        remaining: Math.max(0, round2(lineTotal - current)),
      };
    })
    .filter((l) => l.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  const results: LoyaltyLineDiscount[] = [];
  for (const line of lines) {
    if (remaining <= 0) break;
    const take = Math.min(line.remaining, remaining);
    if (take <= 0) continue;
    results.push({ key: line.key, discountAmount: round2(line.current + take) });
    remaining = round2(remaining - take);
  }
  return results;
}

// ---- I/O (Supabase) ----

/** Ajustes de fidelización del negocio (fila única de `settings`). */
export async function fetchLoyaltyConfig(): Promise<LoyaltyConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("points_enabled, points_peso_per_point, points_value, points_min_redeem")
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_LOYALTY_CONFIG;
  return {
    enabled: data.points_enabled ?? false,
    pesoPerPoint: data.points_peso_per_point,
    pointsValue: data.points_value,
    minRedeem: data.points_min_redeem ?? 0,
  };
}

/**
 * Guarda la configuración. Lee-y-inserta-o-actualiza, igual que
 * `savePromoConfig`/`saveSettings`: la fila de ajustes se crea perezosamente y
 * un negocio que nunca tocó Ajustes todavía no la tiene.
 */
export async function saveLoyaltyConfig(config: LoyaltyConfig): Promise<void> {
  const supabase = createClient();
  const patch = {
    points_enabled: config.enabled,
    points_peso_per_point: config.pesoPerPoint,
    points_value: config.pointsValue,
    points_min_redeem: config.minRedeem,
  };

  const { data: existing, error: readErr } = await supabase
    .from("settings")
    .select("id")
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing?.id) {
    const { error } = await supabase.from("settings").update(patch).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  // Los defaults de IVA acompañan porque son NOT NULL en la tabla; sin ellos
  // el primer guardado de fidelización fallaría en un negocio que nunca abrió
  // Ajustes (mismo motivo que `savePromoConfig`).
  const { error } = await supabase.from("settings").insert({
    tax_rate: 0.19,
    include_tax: true,
    allow_oversell: true,
    currency: "COP",
    ...patch,
  });
  if (error) throw error;
}

/** Saldo de puntos de UN cliente, recién leído (el trigger ya sumó en la base). */
export async function fetchCustomerLoyaltyBalance(customerId: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("loyalty_points")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data?.loyalty_points ?? 0;
}

/**
 * Canjea puntos contra una venta YA registrada y devuelve el saldo que quedó.
 *
 * Va DESPUÉS del cobro y atado al `sale_id` — mismo motivo que `redeemPromo`:
 * si el cobro fallara, un canje adelantado le habría quemado los puntos al
 * cliente por una venta que no existió.
 */
export async function redeemLoyaltyPoints(saleId: string, points: number): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("redeem_loyalty_points", {
    p_sale_id: saleId,
    p_points: points,
  });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

/** Historial de movimientos de UN cliente, del más reciente al más viejo. */
export async function fetchLoyaltyLedger(customerId: string): Promise<LoyaltyLedgerEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("loyalty_points_ledger")
    .select("id, kind, points, sale_id, note, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as LoyaltyLedgerKind,
    points: r.points,
    saleId: r.sale_id,
    note: r.note,
    createdAt: r.created_at,
  }));
}
