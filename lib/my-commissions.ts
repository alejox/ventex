/**
 * Lógica pura de "Mis comisiones" (la vista de cada miembro del equipo sobre
 * SUS comisiones). Sin I/O: la base la trae `services/commissions-self.service.ts`
 * vía los RPC `my_commission_lines` / `my_commission_summary`.
 *
 * Las definiciones son las mismas de la pantalla del dueño
 * (`services/staff.service.ts`): la comisión es la congelada al vender, una
 * línea está pagada si tiene liquidación y las ventas anuladas no cuentan.
 */
import { calendarDayIn, zonedMidnight } from "@/lib/tz";

/** Una línea de venta atribuida a quien mira, tal como la devuelve el RPC. */
export interface MyCommissionLine {
  id: string;
  saleId: string;
  saleNumber: number | null;
  /** `sales.created_at` (instante). */
  soldAt: string;
  itemName: string;
  quantity: number;
  /** `line_total − discount_amount` de la línea (IVA incluido). */
  lineNet: number;
  /** Comisión congelada al vender. */
  commission: number;
  settled: boolean;
  /** Fecha de pago de la liquidación que la cubrió; null si sigue pendiente. */
  paidOn: string | null;
}

/** Una liquidación de quien mira. */
export interface MySettlement {
  id: string;
  paidOn: string;
  paymentMethod: string;
  totalAmount: number;
  itemsCount: number;
  periodFrom: string;
  periodTo: string;
  status: string;
}

export interface MyCommissionSummary {
  /** Todo lo que se le debe, sin límite de fecha (el "Por pagar" del dueño). */
  pendingTotal: number;
  pendingCount: number;
  settlements: MySettlement[];
}

/** Rango elegido: fechas para mostrar, instantes (corte exclusivo) para el RPC. */
export interface MyPeriod {
  from: string;
  to: string;
  fromTs: string;
  toTs: string;
}

export type MyPeriodPreset = "this-month" | "last-month";

/** Tope del rango, el mismo que valida el RPC (22023). */
export const MAX_PERIOD_DAYS = 370;

const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Suma `n` días a un "YYYY-MM-DD" (aritmética de calendario, sin zona). */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * Período de `from` a `to` (inclusivo para el usuario) cortado en la
 * medianoche del NEGOCIO: con la zona del navegador, la venta de las 20:00 en
 * Bogotá caería en otro día si quien mira está de viaje.
 */
export function myPeriodOf(from: string, to: string, tz: string): MyPeriod {
  return {
    from,
    to,
    fromTs: zonedMidnight(from, tz).toISOString(),
    toTs: zonedMidnight(addDays(to, 1), tz).toISOString(),
  };
}

/** "Este mes" (del 1 a hoy) o "Mes anterior" (completo), en la zona del negocio. */
export function presetPeriod(preset: MyPeriodPreset, tz: string, now: Date = new Date()): MyPeriod {
  const today = calendarDayIn(tz, now);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  if (preset === "this-month") return myPeriodOf(firstOfMonth, today, tz);
  const lastOfPrev = addDays(firstOfMonth, -1);
  return myPeriodOf(`${lastOfPrev.slice(0, 7)}-01`, lastOfPrev, tz);
}

/** Rango vacío, al revés o más largo que el tope del RPC. */
export function isPeriodTooLong(period: MyPeriod): boolean {
  const span = new Date(period.toTs).getTime() - new Date(period.fromTs).getTime();
  return !(span > 0) || span > MAX_PERIOD_DAYS * DAY_MS;
}

/**
 * Totales del período calculados por la BASE (`my_commission_period_totals`).
 * Las tarjetas salen de acá y no de sumar las líneas cargadas: si alguna vez
 * la lista quedara incompleta, el número de la tarjeta igual tiene que ser el
 * mismo que ve el dueño.
 */
export interface MyPeriodTotals {
  earned: number;
  paidInPeriod: number;
  pendingInPeriod: number;
  linesCount: number;
}

/** Valores de las tarjetas. `null` = todavía no llegó el dato (se pinta "—"). */
export function myCommissionCards(
  summary: MyCommissionSummary | null,
  totals: MyPeriodTotals | null,
): {
  porCobrar: number | null;
  pagadoEnPeriodo: number | null;
  generadoEnPeriodo: number | null;
  lineas: number | null;
} {
  return {
    porCobrar: summary ? summary.pendingTotal : null,
    pagadoEnPeriodo: totals ? totals.paidInPeriod : null,
    generadoEnPeriodo: totals ? totals.earned : null,
    lineas: totals ? totals.linesCount : null,
  };
}

export function commissionChip(line: Pick<MyCommissionLine, "settled">): {
  label: "Pagada" | "Pendiente";
  tone: "paid" | "pending";
} {
  return line.settled ? { label: "Pagada", tone: "paid" } : { label: "Pendiente", tone: "pending" };
}

export function settlementStatusLabel(status: string): "Pagada" | "Anulada" {
  return status === "void" ? "Anulada" : "Pagada";
}
