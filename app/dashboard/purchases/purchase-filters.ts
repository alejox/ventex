/**
 * Filtros rápidos del listado de compras (D15). Puro: `today` llega como
 * `YYYY-MM-DD` LOCAL, nunca como `Date`, así la regla de "vencida" se testea
 * sin mockear el reloj y no se corre de día por UTC.
 *
 * Modelo real (`invoices`): `status` ∈ paid | pending | cancelled y
 * `due_date` opcional. No hay pagos parciales: una compra pendiente debe su
 * total entero, una pagada no debe nada y una anulada no existe para la plata.
 */

export interface PurchaseLike {
  status: string;
  due_date: string | null;
  total: number | string;
}

export type PurchaseBucket = "paid" | "pending" | "overdue" | "cancelled";

/** "Vencida" = pendiente con vencimiento ANTERIOR a hoy (el día del vencimiento todavía no lo está). */
export function isOverdue(inv: PurchaseLike, today: string): boolean {
  return inv.status === "pending" && !!inv.due_date && inv.due_date.slice(0, 10) < today;
}

export function purchaseBucketOf(inv: PurchaseLike, today: string): PurchaseBucket {
  if (inv.status === "cancelled") return "cancelled";
  if (inv.status === "paid") return "paid";
  return isOverdue(inv, today) ? "overdue" : "pending";
}

/** Lo que falta pagar de esta compra. */
export function amountDue(inv: PurchaseLike): number {
  if (inv.status !== "pending") return 0;
  const total = Number(inv.total);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/** Filtro de los chips. "pending" INCLUYE las vencidas: también están por pagar. */
export type PurchaseFilter = "all" | "pending" | "overdue" | "paid" | "cancelled";

export const PURCHASE_FILTERS: { value: PurchaseFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "overdue", label: "Vencidas" },
  { value: "paid", label: "Pagadas" },
  { value: "cancelled", label: "Anuladas" },
];

export function parsePurchaseFilter(raw: string | null | undefined): PurchaseFilter {
  return PURCHASE_FILTERS.some((f) => f.value === raw) ? (raw as PurchaseFilter) : "all";
}

export function matchesPurchaseFilter(inv: PurchaseLike, filter: PurchaseFilter, today: string): boolean {
  if (filter === "all") return true;
  const bucket = purchaseBucketOf(inv, today);
  if (filter === "pending") return bucket === "pending" || bucket === "overdue";
  return bucket === filter;
}

/** Totales para el resumen: cuánto se debe y cuánto de eso ya venció. */
export function purchaseTotals(
  invoices: PurchaseLike[],
  today: string,
): { due: number; overdue: number; overdueCount: number; pendingCount: number } {
  let due = 0;
  let overdue = 0;
  let overdueCount = 0;
  let pendingCount = 0;
  for (const inv of invoices) {
    const owed = amountDue(inv);
    if (inv.status === "pending") pendingCount++;
    due += owed;
    if (isOverdue(inv, today)) {
      overdue += owed;
      overdueCount++;
    }
  }
  return { due, overdue, overdueCount, pendingCount };
}

/** Cuántas compras caen en cada chip, para mostrar el número al lado. */
export function purchaseFilterCounts(invoices: PurchaseLike[], today: string): Record<PurchaseFilter, number> {
  const counts: Record<PurchaseFilter, number> = { all: 0, pending: 0, overdue: 0, paid: 0, cancelled: 0 };
  for (const inv of invoices) {
    for (const f of PURCHASE_FILTERS) if (matchesPurchaseFilter(inv, f.value, today)) counts[f.value]++;
  }
  return counts;
}
