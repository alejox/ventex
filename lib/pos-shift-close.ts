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

  const cash: ReportRow[] = [{ label: "Base de caja", value: fmt(input.openingCash) }];
  if (input.withdrawals > 0) cash.push({ label: "Retiros de caja", value: `-${fmt(input.withdrawals)}` });
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
