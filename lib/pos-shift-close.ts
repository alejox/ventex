/**
 * Comprobante de cierre de turno en papel de 80 mm (C21).
 *
 * El arqueo quedaba solo en pantalla: el cajero cerraba, el modal se iba y no
 * había nada que entregarle al dueño junto con la plata. Esto arma el papel
 * —filas y HTML autocontenido— para imprimirlo en una ventana aparte, sin
 * pelear con el CSS de impresión del recibo del POS, que vive en la misma
 * página.
 *
 * Puro y testeado (`tests/pos-shift-close.test.ts`): recibe el formateador de
 * plata por parámetro, igual que el resto de los helpers de dinero.
 */
import type { MoneyFormatter } from "@/lib/money";

export const SHIFT_METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Datáfono",
  transferencia: "Transferencia",
  credito: "Crédito / Fiado",
};

export function shiftMethodLabel(method: string): string {
  return SHIFT_METHOD_LABEL[method] ?? method;
}

// ---- Desglose del efectivo esperado --------------------------------------

/** Cómo se nombra cada tipo de salida de caja (`cash_movements.kind`). */
export const CASH_MOVEMENT_LABEL: Record<string, string> = {
  gasto: "Gastos",
  devolucion: "Devoluciones",
  comision: "Comisiones",
  traslado: "Traslados",
};

/** Orden fijo de las salidas en el arqueo. */
const MOVEMENT_ORDER = ["gasto", "devolucion", "comision", "traslado"] as const;

export interface ShiftCashInput {
  openingCash: number;
  expectedCash: number;
  /** Total de salidas de caja del turno (todas las `kind`). */
  withdrawals: number;
  /** Efectivo de ventas (incluye la parte en efectivo de los pagos divididos). */
  cashIn?: number | null;
  /** Abonos de fiado cobrados en efectivo en el turno. */
  cashAbonos?: number | null;
  /** Salidas agrupadas por `kind`. Sin él (turnos viejos), van en una sola fila. */
  movementsByKind?: Record<string, number | string> | null;
}

export interface CashLine {
  key: string;
  label: string;
  /** Siempre positivo; `sign` dice si suma o resta. */
  amount: number;
  sign: 1 | -1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Las filas que explican el efectivo esperado, en el orden en que se suman:
 * Base + Efectivo de ventas + Abonos en efectivo − Gastos − Devoluciones −
 * Comisiones − Traslados = Esperado.
 *
 * Cuadra por construcción: si el servidor no mandó el efectivo de ventas (un
 * `close_shift` anterior a 20261007110100), se deduce de lo que sí mandó; si
 * una salida no tiene `kind` conocido, va a "Otros retiros". Así la columna
 * siempre suma el esperado que calculó la base, que es el que vale.
 */
export function shiftCashBreakdown(input: ShiftCashInput): { lines: CashLine[]; expected: number } {
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const abonos = input.cashAbonos == null ? null : num(input.cashAbonos);
  const cashIn =
    input.cashIn == null
      ? round2(input.expectedCash - input.openingCash + input.withdrawals - (abonos ?? 0))
      : num(input.cashIn);

  const lines: CashLine[] = [
    { key: "base", label: "Base de caja", amount: input.openingCash, sign: 1 },
    { key: "ventas", label: "Efectivo de ventas", amount: cashIn, sign: 1 },
  ];
  if (abonos != null) lines.push({ key: "abonos", label: "Abonos en efectivo", amount: abonos, sign: 1 });

  if (input.movementsByKind) {
    const byKind = input.movementsByKind;
    let attributed = 0;
    for (const kind of MOVEMENT_ORDER) {
      const amount = num(byKind[kind]);
      attributed += amount;
      lines.push({ key: kind, label: CASH_MOVEMENT_LABEL[kind], amount, sign: -1 });
    }
    const rest = round2(input.withdrawals - attributed);
    if (rest > 0) lines.push({ key: "otros", label: "Otros retiros", amount: rest, sign: -1 });
  } else if (input.withdrawals > 0) {
    lines.push({ key: "retiros", label: "Retiros de caja", amount: input.withdrawals, sign: -1 });
  }

  return { lines, expected: input.expectedCash };
}

/** Suma de las filas con su signo: tiene que dar el esperado. */
export function sumCashLines(lines: CashLine[]): number {
  return round2(lines.reduce((s, l) => s + l.sign * l.amount, 0));
}

export interface ShiftCloseReportInput {
  businessName?: string | null;
  cashier?: string | null;
  openedAt: string;
  closedAt: string;
  openingCash: number;
  closingCash: number;
  expectedCash: number;
  difference: number;
  salesCount: number;
  salesTotal: number;
  withdrawals: number;
  byMethod: Record<string, number>;
  /** Desde 20261007110100 (ver `shiftCashBreakdown`). */
  cashIn?: number | null;
  cashAbonos?: number | null;
  movementsByKind?: Record<string, number | string> | null;
  notes?: string | null;
  /** Piezas contadas por denominación, si se usó el contador. */
  denominations?: { label: string; count: number; subtotal: number }[];
}

export interface ReportRow {
  label: string;
  value: string;
  strong?: boolean;
}

export interface ShiftCloseReport {
  title: string;
  header: string[];
  sections: { title: string; rows: ReportRow[] }[];
  footer: string[];
}

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function shiftCloseReport(input: ShiftCloseReportInput, fmt: MoneyFormatter): ShiftCloseReport {
  const header = [input.businessName?.trim() || "Mi Negocio"];
  if (input.cashier) header.push(`Cajero: ${input.cashier}`);
  header.push(`Apertura: ${fmtDateTime(input.openedAt)}`);
  header.push(`Cierre: ${fmtDateTime(input.closedAt)}`);

  const sales: ReportRow[] = [
    { label: "Ventas del turno", value: `${input.salesCount} · ${fmt(input.salesTotal)}` },
    ...Object.entries(input.byMethod).map(([method, total]) => ({
      label: shiftMethodLabel(method),
      value: fmt(total),
    })),
  ];

  const { lines } = shiftCashBreakdown(input);
  const cash: ReportRow[] = lines.map((l) => ({
    label: l.label,
    value: l.sign < 0 && l.amount > 0 ? `-${fmt(l.amount)}` : fmt(l.amount),
  }));
  cash.push({ label: "Efectivo esperado", value: fmt(input.expectedCash), strong: true });
  cash.push({ label: "Efectivo contado", value: fmt(input.closingCash), strong: true });
  const diff = Math.round(input.difference * 100) / 100;
  cash.push({
    label: diff === 0 ? "Diferencia (cuadra)" : diff < 0 ? "Diferencia (faltante)" : "Diferencia (sobrante)",
    value: `${diff > 0 ? "+" : ""}${fmt(diff)}`,
    strong: true,
  });

  const sections = [
    { title: "Ventas", rows: sales },
    { title: "Arqueo", rows: cash },
  ];
  const counted = (input.denominations ?? []).filter((d) => d.count > 0);
  if (counted.length > 0) {
    sections.push({
      title: "Conteo por denominación",
      rows: counted.map((d) => ({ label: `${d.label} × ${d.count}`, value: fmt(d.subtotal) })),
    });
  }

  const footer: string[] = [];
  if (input.notes?.trim()) footer.push(`Justificación: ${input.notes.trim()}`);
  footer.push("Firma cajero: ____________________");
  footer.push("Firma recibe:  ____________________");

  return { title: "Cierre de turno", header, sections, footer };
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Documento HTML completo para una ventana de impresión de 80 mm. */
export function shiftCloseReportHtml(report: ShiftCloseReport): string {
  const rows = (rs: ReportRow[]) =>
    rs
      .map(
        (r) =>
          `<div class="row${r.strong ? " strong" : ""}"><span>${escapeHtml(r.label)}</span><span>${escapeHtml(r.value)}</span></div>`,
      )
      .join("");
  const sections = report.sections
    .map((s) => `<h2>${escapeHtml(s.title)}</h2>${rows(s.rows)}`)
    .join("<hr/>");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>${escapeHtml(report.title)}</title><style>
@page{size:80mm auto;margin:0}
*{box-sizing:border-box}
body{margin:0;padding:4mm;width:80mm;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#000;background:#fff;line-height:1.35}
h1{font-size:15px;text-align:center;margin:0 0 2mm}
h2{font-size:12px;margin:2mm 0 1mm;text-transform:uppercase}
.head{text-align:center;margin-bottom:2mm}
.head p{margin:0}
.row{display:flex;justify-content:space-between;gap:2mm}
.row span:last-child{text-align:right;white-space:nowrap}
.strong{font-weight:bold}
hr{border:0;border-top:1px dashed #000;margin:2mm 0}
.foot p{margin:3mm 0 0}
</style></head><body>
<h1>${escapeHtml(report.title)}</h1>
<div class="head">${report.header.map((h) => `<p>${escapeHtml(h)}</p>`).join("")}</div>
<hr/>${sections}<hr/>
<div class="foot">${report.footer.map((f) => `<p>${escapeHtml(f)}</p>`).join("")}</div>
</body></html>`;
}
