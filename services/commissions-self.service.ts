/**
 * "Mis comisiones": I/O de la vista que cada miembro del equipo tiene sobre
 * SUS comisiones. Nunca manda un staff_id: lo resuelve la base con
 * `current_staff_id()` dentro de los RPC (migración 20261021120000).
 *
 * Los tipos de fila están escritos a mano porque `database.types.ts` se
 * regenera recién cuando la migración se aplica.
 */
import { createClient } from "@/utils/supabase/client";
import { fetchAllRows, PAGE_SIZE } from "@/services/finance.service";
import type {
  MyCommissionLine,
  MyCommissionSummary,
  MyPeriod,
  MyPeriodTotals,
  MySettlement,
} from "@/lib/my-commissions";

export type MyLineRow = {
  sale_item_id: string;
  sale_id: string;
  sale_number: number | null;
  sold_at: string;
  item_name: string | null;
  quantity: number | string | null;
  line_net: number | string | null;
  commission_amount: number | string | null;
  settled: boolean;
  settlement_paid_on: string | null;
};

type PeriodTotalsRow = {
  earned?: number | string | null;
  paid_in_period?: number | string | null;
  pending_in_period?: number | string | null;
  lines_count?: number | null;
};

type SummaryRow = {
  pending_total?: number | string | null;
  pending_count?: number | null;
  settlements?: {
    id: string;
    paid_on: string;
    payment_method: string;
    total_amount: number | string;
    items_count: number;
    period_from: string;
    period_to: string;
    status: string;
  }[] | null;
};

/** El RPC rechazó porque la sesión no tiene ficha de personal activa. */
export class NoStaffRecordError extends Error {
  constructor() {
    super("SIN_FICHA");
    this.name = "NoStaffRecordError";
  }
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

type RpcError = { message?: string; code?: string };

/** RPC sin tipar (todavía no está en `database.types.ts`), con `this` atado. */
function untypedRpc<T>(fn: string, args: Record<string, unknown> = {}) {
  const supabase = createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: T | null; error: RpcError | null }>;
  return rpc(fn, args);
}

/** Supabase devuelve el RAISE en `message`; 42501 + SIN_FICHA = sin ficha. */
function rethrow(error: RpcError): never {
  if (/^SIN_FICHA\b/.test(error.message ?? "")) throw new NoStaffRecordError();
  throw error;
}

const toLine = (r: MyLineRow): MyCommissionLine => ({
  id: r.sale_item_id,
  saleId: r.sale_id,
  saleNumber: r.sale_number,
  soldAt: r.sold_at,
  itemName: r.item_name ?? "—",
  quantity: num(r.quantity),
  lineNet: num(r.line_net),
  commission: num(r.commission_amount),
  settled: Boolean(r.settled),
  paidOn: r.settlement_paid_on,
});

/** Lo mínimo del builder de un RPC que se usa para paginar. */
interface LineQuery {
  order: (col: string, opts: { ascending: boolean }) => LineQuery;
  range: (from: number, to: number) => PromiseLike<{ data: MyLineRow[] | null; error: unknown }>;
}

type LinePage = (from: number, to: number) => PromiseLike<{ data: MyLineRow[] | null; error: unknown }>;

/**
 * Junta TODAS las páginas de líneas. PostgREST corta cada respuesta en
 * max-rows (1.000) sin avisar, igual que en la vista del dueño: un período
 * largo se vería recortado. Separado del cliente para poder testearlo.
 */
export async function collectMyCommissionLines(page: LinePage, pageSize: number = PAGE_SIZE): Promise<MyCommissionLine[]> {
  try {
    const rows = await fetchAllRows<MyLineRow>(page, pageSize);
    return rows.map(toLine);
  } catch (e) {
    if (e && typeof e === "object" && "message" in e) rethrow(e as RpcError);
    throw e;
  }
}

export async function fetchMyCommissionLines(period: MyPeriod): Promise<MyCommissionLine[]> {
  const supabase = createClient();
  // RPC sin tipar todavía: el builder admite order/range igual que una tabla.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => LineQuery;
  // Orden ESTABLE (el mismo del RPC, con desempate por id) o las páginas se pisan.
  return collectMyCommissionLines((from, to) =>
    rpc("my_commission_lines", { p_from: period.fromTs, p_to: period.toTs })
      .order("sold_at", { ascending: false })
      .order("sale_item_id", { ascending: true })
      .range(from, to),
  );
}

/** Totales del período calculados en la base (las tarjetas salen de acá). */
export async function fetchMyCommissionPeriodTotals(period: MyPeriod): Promise<MyPeriodTotals> {
  const { data, error } = await untypedRpc<PeriodTotalsRow>("my_commission_period_totals", {
    p_from: period.fromTs,
    p_to: period.toTs,
  });
  if (error) rethrow(error);
  const row = data ?? {};
  return {
    earned: num(row.earned),
    paidInPeriod: num(row.paid_in_period),
    pendingInPeriod: num(row.pending_in_period),
    linesCount: row.lines_count ?? 0,
  };
}

export async function fetchMyCommissionSummary(): Promise<MyCommissionSummary> {
  const { data, error } = await untypedRpc<SummaryRow>("my_commission_summary");
  if (error) rethrow(error);
  const row = data ?? {};
  const settlements: MySettlement[] = (row.settlements ?? []).map((s) => ({
    id: s.id,
    paidOn: s.paid_on,
    paymentMethod: s.payment_method,
    totalAmount: num(s.total_amount),
    itemsCount: s.items_count,
    periodFrom: s.period_from,
    periodTo: s.period_to,
    status: s.status,
  }));
  return {
    pendingTotal: num(row.pending_total),
    pendingCount: row.pending_count ?? 0,
    settlements,
  };
}
