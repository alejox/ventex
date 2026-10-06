/**
 * Lógica pura de la lista de Facturación (F12): vencimiento, filtros, búsqueda
 * y resumen de cartera. Sin I/O ni React; testeada en `tests/billing-view.test.ts`.
 *
 * `today` entra siempre por parámetro como "YYYY-MM-DD" local: así se prueba
 * sin mockear el reloj, y el corte del día es el del negocio, no el de UTC.
 */
import type { Invoice } from "@/services/billing.service";
import { MONEY_NUM_FMT, type ExportColumn } from "@/lib/export";

export type InvoiceFilter = "all" | "pending" | "overdue" | "paid" | "quotes" | "cancelled";

export const INVOICE_FILTERS: { id: InvoiceFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Por cobrar" },
  { id: "overdue", label: "Vencidas" },
  { id: "paid", label: "Pagadas" },
  { id: "quotes", label: "Cotizaciones" },
  { id: "cancelled", label: "Canceladas" },
];

/** `?filtro=vencidas` (desde "Pendientes de hoy") → filtro de la lista. */
export function filterFromParam(value: string | null): InvoiceFilter | null {
  const map: Record<string, InvoiceFilter> = {
    vencidas: "overdue",
    "por-cobrar": "pending",
    pagadas: "paid",
    cotizaciones: "quotes",
    canceladas: "cancelled",
  };
  return value ? (map[value] ?? null) : null;
}

/** Días entre dos fechas "YYYY-MM-DD" (b − a), por calendario. */
function dayDiff(a: string, b: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export interface DueInfo {
  /** Días que faltan (negativo = vencida). null = no aplica. */
  days: number | null;
  overdue: boolean;
  label: string | null;
}

/**
 * Vencimiento de un documento. Solo cuenta para una FACTURA pendiente con
 * fecha de vencimiento: una pagada o cancelada ya no vence, y una cotización
 * no se cobra (vence su vigencia, no una deuda).
 */
export function invoiceDue(inv: Pick<Invoice, "type" | "status" | "due_date">, today: string): DueInfo {
  if (inv.type !== "factura" || inv.status !== "pending" || !inv.due_date) {
    return { days: null, overdue: false, label: null };
  }
  const days = dayDiff(today, inv.due_date);
  if (days < 0) {
    const n = -days;
    return { days, overdue: true, label: `Vencida hace ${n} día${n === 1 ? "" : "s"}` };
  }
  if (days === 0) return { days, overdue: false, label: "Vence hoy" };
  return { days, overdue: false, label: `Vence en ${days} día${days === 1 ? "" : "s"}` };
}

export function matchesFilter(inv: Invoice, filter: InvoiceFilter, today: string): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return inv.type === "factura" && inv.status === "pending";
    case "overdue":
      return invoiceDue(inv, today).overdue;
    case "paid":
      return inv.type === "factura" && inv.status === "paid";
    case "quotes":
      return inv.type === "cotizacion";
    case "cancelled":
      return inv.status === "cancelled";
  }
}

/** Sin tildes ni mayúsculas: "Gómez" se encuentra escribiendo "gomez". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Búsqueda por número ("#12" o "12"), cliente o notas. */
export function matchesSearch(inv: Invoice, query: string): boolean {
  const q = fold(query.trim().replace(/^#/, ""));
  if (!q) return true;
  return (
    String(inv.invoice_number).includes(q) ||
    fold(inv.customers?.full_name ?? "").includes(q) ||
    fold(inv.notes ?? "").includes(q)
  );
}

export function filterInvoices(list: Invoice[], filter: InvoiceFilter, query: string, today: string): Invoice[] {
  return list.filter((inv) => matchesFilter(inv, filter, today) && matchesSearch(inv, query));
}

export interface ReceivableSummary {
  /** Total de facturas pendientes (cartera). Las cotizaciones no son deuda. */
  receivable: number;
  pendingCount: number;
  overdueCount: number;
  overdueAmount: number;
}

export function receivableSummary(list: Invoice[], today: string): ReceivableSummary {
  const out: ReceivableSummary = { receivable: 0, pendingCount: 0, overdueCount: 0, overdueAmount: 0 };
  for (const inv of list) {
    if (inv.type !== "factura" || inv.status !== "pending") continue;
    out.receivable += Number(inv.total) || 0;
    out.pendingCount += 1;
    if (invoiceDue(inv, today).overdue) {
      out.overdueCount += 1;
      out.overdueAmount += Number(inv.total) || 0;
    }
  }
  return out;
}

/** Cuántos documentos hay en cada chip, para mostrarlo al lado de la etiqueta. */
export function filterCounts(list: Invoice[], today: string): Record<InvoiceFilter, number> {
  const out = Object.fromEntries(INVOICE_FILTERS.map((f) => [f.id, 0])) as Record<InvoiceFilter, number>;
  for (const inv of list) {
    for (const f of INVOICE_FILTERS) if (matchesFilter(inv, f.id, today)) out[f.id] += 1;
  }
  return out;
}

const TYPE_LABEL: Record<string, string> = { factura: "Factura", cotizacion: "Cotización" };
const STATUS_LABEL: Record<string, string> = { pending: "Pendiente", paid: "Pagada", cancelled: "Cancelada" };

/** Columnas de la exportación: lo mismo que la tabla, con el vencimiento en días. */
export function invoiceExportColumns(today: string): ExportColumn<Invoice>[] {
  return [
    { header: "Tipo", value: (i) => TYPE_LABEL[i.type] ?? i.type, width: 12 },
    { header: "N.º", value: (i) => i.invoice_number, width: 8 },
    { header: "Cliente", value: (i) => i.customers?.full_name ?? "", width: 28 },
    { header: "Emisión", value: (i) => i.issue_date, width: 12 },
    { header: "Vencimiento", value: (i) => i.due_date ?? "", width: 12 },
    {
      header: "Estado",
      value: (i) =>
        i.type === "cotizacion" && i.status === "pending" ? "Vigente" : (STATUS_LABEL[i.status] ?? i.status),
      width: 12,
    },
    { header: "Días vencida", value: (i) => { const d = invoiceDue(i, today); return d.overdue ? -(d.days ?? 0) : null; }, width: 12 },
    { header: "Subtotal", value: (i) => i.subtotal, width: 14, numFmt: MONEY_NUM_FMT },
    { header: "Descuento", value: (i) => i.discount_amount, width: 12, numFmt: MONEY_NUM_FMT },
    { header: "Impuesto", value: (i) => i.tax_amount, width: 12, numFmt: MONEY_NUM_FMT },
    { header: "Total", value: (i) => i.total, width: 14, numFmt: MONEY_NUM_FMT },
  ];
}
