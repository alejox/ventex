/**
 * Descuentos de una venta tal como viajan a `create_sale`, y el armado del
 * payload con su variante "firma vieja".
 *
 * Lógica pura —sin red ni store— para testearla sin montar nada
 * (`tests/sale-discounts.test.ts`). Quien hace la llamada es
 * `services/pos.service.ts` (`createSale`).
 *
 * Por qué existe: `p_discount_amount` es la SUMA de cuatro canales —descuento
 * manual (DiscountModal), ofertas automáticas, premio de cortes y puntos— y la
 * base no podía distinguirlos. Desde la migración
 * `20261006230000_create_sale_manual_discount_and_tendered.sql` el POS declara
 * qué parte es MANUAL (`p_manual_discount`, que a un trabajador le exige el
 * permiso `pos_discount`), manda el descuento de cada línea (`discount_amount`
 * dentro de cada item, para reimprimir el recibo tal cual) y el efectivo
 * recibido (`p_amount_tendered`, para imprimir recibido y cambio).
 */

/** Lo mínimo de una línea del carrito que importa para repartir descuentos. */
export interface DiscountedLine {
  /** Descuento TOTAL de la línea, venga del canal que venga. */
  discountAmount?: number;
  /** La parte de `discountAmount` que puso el cajero a mano (DiscountModal). */
  manualDiscount?: number;
}

export interface CheckoutDiscounts {
  /** Descuento total de la venta, en centavos exactos (`p_discount_amount`). */
  total: number;
  /** Parte manual del total (`p_manual_discount`). Nunca más que `total`. */
  manual: number;
  /**
   * Descuento de cada línea, en el orden del carrito. Suman EXACTO `total`.
   * null = no se manda desglose (alguna línea quedó con más descuento que lo
   * que vale; ver `checkoutDiscounts`).
   */
  lines: number[] | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Redondea cada monto a centavos de forma que la suma redondeada quede igual
 * a la suma cruda redondeada (método del mayor resto). Un descuento del 15 %
 * sobre tres líneas da fracciones de centavo en cada una: redondearlas por
 * separado puede sumar un centavo de más o de menos, y la base rechaza un
 * desglose que no cuadra con el total (`DESCUENTO_LINEAS_NO_CUADRA`).
 *
 * Nunca le sube a una línea más que el centavo que le faltaba: como el precio
 * de vitrina está en centavos enteros, una línea no puede quedar por encima de
 * lo que vale.
 */
export function roundPreservingSum(amounts: number[]): number[] {
  const raw = amounts.map((a) => (Number.isFinite(a) && a > 0 ? a * 100 : 0));
  const target = Math.round(raw.reduce((s, x) => s + x, 0));
  const floors = raw.map((x) => Math.floor(x + 1e-9));
  let rest = target - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors.map((c) => c / 100);
}

/**
 * Los tres números de descuento que salen del carrito al cobrar.
 *
 * El manual de una línea nunca puede pesar más que su descuento total (si una
 * oferta o el premio lo pisaron después, `manualDiscount` ya debería haberse
 * ajustado en el store, pero acá se topa igual: declarar de más haría fallar
 * la venta de un trabajador sin permiso por un descuento que no existe).
 *
 * `grossOf` (precio × cantidad de la línea) es opcional: si viene y alguna
 * línea tiene MÁS descuento que lo que vale —un descuento fijo que quedó así
 * al bajar la cantidad—, no se manda el desglose (`lines: null`). La base
 * rechazaría esa línea (`DESCUENTO_EXCEDE_TOTAL`) donde antes aceptaba la
 * venta porque solo miraba el total; sin desglose se comporta como siempre y
 * el recibo reimpreso vuelve al formato de descuento en los totales.
 */
export function checkoutDiscounts<L extends DiscountedLine>(
  cart: L[],
  grossOf?: (line: L) => number,
): CheckoutDiscounts {
  const rounded = roundPreservingSum(cart.map((l) => l.discountAmount ?? 0));
  const total = round2(rounded.reduce((s, x) => s + x, 0));
  const manualRaw = cart.reduce((s, l) => {
    const line = Math.max(l.discountAmount ?? 0, 0);
    const manual = Math.max(l.manualDiscount ?? 0, 0);
    return s + Math.min(manual, line);
  }, 0);
  const overflows = grossOf
    ? cart.some((l, i) => rounded[i] > round2(grossOf(l)) + 0.005)
    : false;
  return { total, manual: Math.min(round2(manualRaw), total), lines: overflows ? null : rounded };
}

/**
 * Cuánto de la línea es manual después de cambiar su descuento total.
 *
 * - `manual`: lo puso el DiscountModal; todo el descuento es manual.
 * - `auto`: lo reemplazó un canal automático (el premio de cortes): el manual
 *   anterior dejó de existir.
 * - `layer`: se SUMÓ o se restauró algo automático encima (los puntos, y su
 *   "Quitar"): el manual sigue en pie, topado por el total nuevo.
 */
export type DiscountSource = "manual" | "auto" | "layer";

export function nextManualDiscount(
  previousManual: number | undefined,
  newDiscount: number,
  source: DiscountSource,
): number | undefined {
  const total = Math.max(newDiscount, 0);
  let manual: number;
  if (source === "manual") manual = total;
  else if (source === "auto") manual = 0;
  else manual = Math.min(Math.max(previousManual ?? 0, 0), total);
  return manual > 0 ? manual : undefined;
}

/** Un item de `p_items` (ver `CheckoutItem` en `services/pos.service.ts`). */
export interface CreateSaleItem {
  product_id?: string;
  service_id?: string;
  quantity: number;
  staff_id?: string | null;
  kind?: "unit" | "package";
  unit_price?: number;
  /** Descuento de la línea. Lo ignora la base vieja; lo valida la nueva. */
  discount_amount?: number;
}

export interface CreateSaleArgsInput {
  workspaceId: string;
  membershipId: string;
  shiftId: string | null;
  customerId: string | null;
  staffId: string | null;
  paymentMethod: string;
  transferMethod?: string | null;
  cardMethod?: string | null;
  discount: number;
  /** Parte manual de `discount`. Ausente en ventas encoladas antes de esto. */
  manualDiscount?: number;
  /** Efectivo recibido. Ausente/null = no se anotó o no fue en efectivo. */
  amountTendered?: number | null;
  items: CreateSaleItem[];
  splits?: { payment_method: string; amount: number; transfer_method?: string | null; card_method?: string | null }[];
  clientSaleId?: string;
}

/** Si la llamada usa algún parámetro que la base vieja no conoce. */
export function usesNewCreateSaleParams(input: CreateSaleArgsInput): boolean {
  return (input.manualDiscount ?? 0) > 0 || input.amountTendered != null;
}

/**
 * Argumentos nombrados de `create_sale`.
 *
 * Los parámetros nuevos viajan SOLO si tienen algo que decir: mandar
 * `p_manual_discount: 0` contra la base vieja daría PGRST202 en cada venta y
 * obligaría a reintentar todas. `legacy: true` arma la firma anterior a la
 * migración (sin `p_manual_discount` ni `p_amount_tendered`); el
 * `discount_amount` de cada item puede quedarse, porque la función vieja lee
 * solo las claves que conoce del JSON.
 *
 * Una venta encolada ANTES de este cambio no trae `manualDiscount`,
 * `amountTendered` ni `discount_amount`: sale exactamente con el payload de
 * siempre, que la base nueva acepta con los defaults.
 */
export function createSaleArgs(input: CreateSaleArgsInput, legacy = false): Record<string, unknown> {
  const args: Record<string, unknown> = {
    p_customer_id: input.customerId,
    p_payment_method: input.paymentMethod,
    p_discount_amount: input.discount,
    p_items: input.items,
    p_staff_id: input.staffId ?? undefined,
    p_expected_workspace_id: input.workspaceId,
    p_expected_membership_id: input.membershipId,
  };
  if (input.shiftId) args.p_expected_shift_id = input.shiftId;
  if (input.transferMethod) args.p_transfer_method = input.transferMethod;
  if (input.cardMethod) args.p_card_method = input.cardMethod;
  if (input.clientSaleId) args.p_client_sale_id = input.clientSaleId;
  if (input.splits && input.splits.length > 0) args.p_payments = input.splits;
  if (!legacy) {
    if ((input.manualDiscount ?? 0) > 0) args.p_manual_discount = input.manualDiscount;
    if (input.amountTendered != null) args.p_amount_tendered = input.amountTendered;
  }
  return args;
}

/**
 * PostgREST no encontró una función con esos argumentos: la base todavía no
 * tiene la migración. Mismo criterio que `voidSale` en `sales.service.ts`.
 * Es seguro reintentar: con PGRST202 no se ejecutó nada.
 */
export function isUnknownSignatureError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: unknown }).code === "PGRST202";
}

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

/**
 * Llama a `create_sale` con la firma nueva y, si la base todavía no la conoce
 * (PGRST202), repite con la vieja. Con PGRST202 no se ejecutó nada, así que el
 * reintento no puede duplicar la venta (y `p_client_sale_id` la protege igual).
 *
 * `legacyKnown` = ya se sabe que la base es vieja: va directo a la firma
 * vieja. Devuelve `legacy: true` cuando la base resultó ser vieja, para que
 * quien llama lo recuerde y no pague dos llamadas por venta.
 */
export async function createSaleWithFallback(
  call: (args: Record<string, unknown>) => PromiseLike<RpcResult>,
  input: CreateSaleArgsInput,
  legacyKnown: boolean,
): Promise<{ saleId: string; legacy: boolean }> {
  const wantsNewParams = !legacyKnown && usesNewCreateSaleParams(input);
  const first = await call(createSaleArgs(input, !wantsNewParams));
  if (!first.error) return { saleId: first.data as string, legacy: legacyKnown };
  if (!wantsNewParams || !isUnknownSignatureError(first.error)) throw first.error;

  const retry = await call(createSaleArgs(input, true));
  if (retry.error) throw retry.error;
  return { saleId: retry.data as string, legacy: true };
}

/**
 * Efectivo recibido que se guarda con la venta. Solo un cobro en efectivo SIN
 * pago dividido tiene "recibido" (mismo criterio que `saleChangeSummary`), y
 * nunca un número negativo o que no sea número.
 */
export function tenderedForSale(
  amountTendered: number | null | undefined,
  paymentMethod: string,
  splitsCount: number,
): number | null {
  if (paymentMethod !== "efectivo" || splitsCount > 0) return null;
  if (amountTendered == null || !Number.isFinite(amountTendered) || amountTendered <= 0) return null;
  return round2(amountTendered);
}

/**
 * Descuentos por línea de una venta GUARDADA, para reimprimir el recibo.
 *
 * Solo se usan si cuadran con el descuento de la venta: las ventas anteriores a
 * la migración tienen `discount_amount = 0` en todas las líneas aunque la venta
 * tenga descuento, y en ese caso el recibo vuelve al formato de siempre (líneas
 * a precio lleno, descuento en los totales) en vez de imprimir un desglose que
 * no suma.
 */
export function savedLineDiscounts(
  lineDiscounts: (number | null | undefined)[],
  saleDiscount: number,
): number[] | null {
  const lines = lineDiscounts.map((d) => Math.max(Number(d) || 0, 0));
  const sum = round2(lines.reduce((s, x) => s + x, 0));
  if (sum <= 0) return null;
  // En centavos enteros: comparar 0,01 en float falla justo en el borde.
  if (Math.abs(Math.round(sum * 100) - Math.round(saleDiscount * 100)) > 1) return null;
  return lines.map(round2);
}
