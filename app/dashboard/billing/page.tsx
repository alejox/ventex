"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { IconFileText, IconPlus, IconSearch, IconXCircle } from "@/app/assets/icons/DashboardIcons";
import { useBillingStore } from "@/stores/billing.store";
import { useCustomersStore } from "@/stores/customers.store";
import { useServicesStore } from "@/stores/services.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useProfile } from "@/components/ProfileProvider";
import type { Invoice, InvoiceItem, InvoiceLineInput, NewInvoiceInput } from "@/services/billing.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Select } from "@/components/ui/Select";
import { CollectionEmpty, CollectionError, CollectionFilteredEmpty, CollectionLoading } from "@/components/CollectionState";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { downloadCsv, downloadXlsx, exportFilename, sheet } from "@/lib/export";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { OpenOnNewParam } from "@/components/ui/OpenOnNewParam";
import {
  INVOICE_FILTERS,
  filterCounts,
  filterFromParam,
  filterInvoices,
  invoiceDue,
  invoiceExportColumns,
  receivableSummary,
  type InvoiceFilter,
} from "./invoice-view";
import { formatDateOnly, todayISO } from "@/lib/date";
import type { MoneyFormatter } from "@/lib/money";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

const formatDate = (iso: string) =>
  formatDateOnly(iso, { day: "2-digit", month: "short", year: "numeric" }, "es-CO");

const today = todayISO;

const EMPTY_LINE: InvoiceLineInput = { service_id: null, description: "", quantity: "1", unit_price: "" };

const newEmptyInvoice = (): NewInvoiceInput => ({
  type: "factura",
  customer_id: null,
  issue_date: today(),
  due_date: "",
  discount_amount: "0",
  tax_rate: "0",
  notes: "",
  items: [{ ...EMPTY_LINE }],
});

const TYPE_LABEL: Record<string, string> = { factura: "Factura", cotizacion: "Cotización" };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  paid: { label: "Pagada", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Cancelada", cls: "bg-error-container/20 text-error-dim border-error-container/30" },
};

/** Columnas de la tabla; el formateador trae la moneda del negocio. */
const invoiceColumns = (formatMoney: MoneyFormatter, todayDay: string): DataColumn<Invoice>[] => [
  {
    header: "Documento",
    mobile: "title",
    className: "pl-6 font-medium text-on-surface",
    headerClassName: "pl-6",
    cell: (inv) => (
      <>
        <span className="text-on-surface-variant">{TYPE_LABEL[inv.type] ?? inv.type}</span>{" "}
        <span className="font-mono">#{inv.invoice_number}</span>
      </>
    ),
  },
  {
    header: "Cliente",
    mobile: "subtitle",
    className: "text-on-surface-variant",
    cell: (inv) => inv.customers?.full_name ?? "—",
  },
  {
    header: "Total",
    align: "right",
    mobile: "trailing",
    className: "font-bold text-on-surface tabular-nums",
    cell: (inv) => formatMoney(inv.total),
  },
  {
    header: "Estado",
    align: "center",
    mobile: "badge",
    cell: (inv) => {
      const st = STATUS[inv.status] ?? STATUS.pending;
      return (
        <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${st.cls}`}>
          {st.label}
        </span>
      );
    },
  },
  {
    header: "Emisión",
    sortKey: "emision",
    sortValue: (inv) => inv.issue_date,
    className: "text-on-surface-variant whitespace-nowrap",
    cell: (inv) => formatDate(inv.issue_date),
  },
  {
    // F12: la cartera se gestiona por vencimiento. "Vencida hace N días" en
    // rojo dice a quién llamar primero; una pagada o cotización no vence.
    header: "Vencimiento",
    mobile: "field",
    sortKey: "vencimiento",
    sortValue: (inv) => inv.due_date ?? "9999-12-31",
    cell: (inv) => {
      if (!inv.due_date) return <span className="text-on-surface-variant">—</span>;
      const due = invoiceDue(inv, todayDay);
      return (
        <span className="block whitespace-nowrap">
          <span className={`block tabular-nums ${due.overdue ? "text-error font-semibold" : "text-on-surface-variant"}`}>
            {formatDate(inv.due_date)}
          </span>
          {due.label && (
            <span
              className={`block text-[11px] mt-0.5 ${
                due.overdue ? "text-error font-semibold" : due.days === 0 ? "text-warning font-semibold" : "text-on-surface-variant"
              }`}
            >
              {due.label}
            </span>
          )}
        </span>
      );
    },
  },
];

export default function BillingPage() {
  const fmtMoney = useFormatMoney();
  // Hoy, según el reloj del negocio. Fijo durante la visita: el vencimiento no
  // tiene que recalcularse a cada render.
  const [todayDay] = useState(todayISO);
  const invoiceColumnsForCurrency = useMemo(() => invoiceColumns(fmtMoney, todayDay), [fmtMoney, todayDay]);
  const invoices = useBillingStore((s) => s.invoices);
  const loading = useBillingStore((s) => s.loading);
  const error = useBillingStore((s) => s.error);
  const submitting = useBillingStore((s) => s.submitting);
  const fetchInvoices = useBillingStore((s) => s.fetchInvoices);
  const addInvoice = useBillingStore((s) => s.addInvoice);
  const updateStatus = useBillingStore((s) => s.updateStatus);
  const items = useBillingStore((s) => s.items);
  const itemsLoading = useBillingStore((s) => s.itemsLoading);
  const fetchItems = useBillingStore((s) => s.fetchItems);

  const customers = useCustomersStore((s) => s.customers);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const services = useServicesStore((s) => s.services);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const businessProfile = useSettingsStore((s) => s.settings?.business_profile);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const profile = useProfile();

  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<NewInvoiceInput>(newEmptyInvoice());
  const [detailId, setDetailId] = useState<string | null>(null);
  /** "Cancelada" pide confirmación: saca el documento de cartera y de ingresos. */
  const [confirmCancel, setConfirmCancel] = useState(false);
  /** Al convertir una cotización, de cuál viene (para la nota de la factura). */
  const [convertedFrom, setConvertedFrom] = useState<number | null>(null);
  // El detalle se lee de la lista del store y no de una copia: `updateStatus`
  // actualiza la lista, y con una copia local el botón del estado nuevo no se
  // marcaba hasta cerrar y volver a abrir.
  const detail = useMemo(
    () => (detailId ? invoices.find((i) => i.id === detailId) ?? null : null),
    [detailId, invoices],
  );
  const setDetail = (inv: Invoice | null) => {
    setDetailId(inv?.id ?? null);
    setConfirmCancel(false);
  };

  useEffect(() => {
    fetchInvoices();
    fetchSettings();
    if (customers.length === 0) fetchCustomers();
    if (services.length === 0) fetchServices();
  }, [fetchInvoices, fetchSettings, customers.length, fetchCustomers, services.length, fetchServices]);

  const activeServices = services.filter((s) => s.status === "active");

  const totals = useMemo(() => {
    const subtotal = form.items.reduce(
      (acc, l) => acc + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0),
      0,
    );
    const discount = parseFloat(form.discount_amount) || 0;
    const rate = (parseFloat(form.tax_rate) || 0) / 100;
    const taxable = Math.max(subtotal - discount, 0);
    const tax = taxable * rate;
    return { subtotal, discount, tax, total: taxable + tax };
  }, [form.items, form.discount_amount, form.tax_rate]);

  const openCreate = useCallback(() => {
    setForm(newEmptyInvoice());
    setConvertedFrom(null);
    setFormOpen(true);
  }, []);

  const applyFilterParam = useCallback((value: string) => {
    const f = filterFromParam(value);
    if (f) setFilter(f);
  }, []);

  const visible = useMemo(() => filterInvoices(invoices, filter, query, todayDay), [invoices, filter, query, todayDay]);
  const summary = useMemo(() => receivableSummary(invoices, todayDay), [invoices, todayDay]);
  const counts = useMemo(() => filterCounts(invoices, todayDay), [invoices, todayDay]);

  /** Exporta lo que la tabla muestra: mismo chip y misma búsqueda. */
  const exportAs = async (kind: "csv" | "xlsx") => {
    const cols = invoiceExportColumns(todayDay);
    const name = exportFilename(filter === "all" ? "facturacion" : `facturacion ${filter}`, kind, {}, todayDay);
    if (kind === "csv") {
      downloadCsv(name, cols, visible);
      return;
    }
    setExporting(true);
    try {
      await downloadXlsx(name, [sheet({ name: "Facturación", columns: cols, rows: visible })]);
    } finally {
      setExporting(false);
    }
  };

  /**
   * "Convertir en factura": abre el formulario de una FACTURA nueva con los
   * conceptos, cliente, descuento e impuesto de la cotización. La cotización
   * queda como está —es el registro de lo que se ofreció— y la factura es un
   * documento nuevo con su propio número, que es lo que se cobra.
   */
  const convertToInvoice = (quote: Invoice, lines: InvoiceItem[]) => {
    setForm({
      type: "factura",
      customer_id: quote.customer_id,
      issue_date: today(),
      due_date: "",
      discount_amount: String(quote.discount_amount ?? 0),
      // `tax_rate` se guarda como fracción (0.19) y el formulario pide el %.
      tax_rate: String(Math.round((quote.tax_rate ?? 0) * 10000) / 100),
      notes: [quote.notes, `Generada desde la cotización #${quote.invoice_number}.`].filter(Boolean).join("\n"),
      items:
        lines.length > 0
          ? lines.map((l) => ({
              service_id: l.service_id,
              description: l.description,
              quantity: String(l.quantity),
              unit_price: String(l.unit_price),
            }))
          : [{ ...EMPTY_LINE }],
    });
    setConvertedFrom(quote.invoice_number);
    setDetail(null);
    setFormOpen(true);
  };

  const openDetail = (inv: Invoice) => {
    setDetail(inv);
    fetchItems(inv.id);
  };

  /** Abre una vista limpia del documento e invoca la impresión (permite Guardar como PDF). */
  const printInvoice = (inv: Invoice, lines: InvoiceItem[]) => {
    const business = escapeHtml(businessProfile?.businessName || profile?.fullName || "Ventex");
    const logoUrl = businessProfile?.logoUrl
      ? `<img src="${escapeHtml(businessProfile.logoUrl)}" alt="" style="max-height:64px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px" />`
      : "";
    const rows = lines
      .map(
        (it) =>
          `<tr><td>${escapeHtml(it.description)}</td><td class="c">${it.quantity}</td><td class="r">${fmtMoney(it.unit_price)}</td><td class="r">${fmtMoney(it.line_total)}</td></tr>`,
      )
      .join("");
    const totalsRows = [
      `<tr><td colspan="3" class="r">Subtotal</td><td class="r">${fmtMoney(inv.subtotal)}</td></tr>`,
      inv.discount_amount > 0
        ? `<tr><td colspan="3" class="r">Descuento</td><td class="r">-${fmtMoney(inv.discount_amount)}</td></tr>`
        : "",
      inv.tax_amount > 0
        ? `<tr><td colspan="3" class="r">Impuesto (${(inv.tax_rate * 100).toFixed(0)}%)</td><td class="r">${fmtMoney(inv.tax_amount)}</td></tr>`
        : "",
      `<tr class="tot"><td colspan="3" class="r">Total</td><td class="r">${fmtMoney(inv.total)}</td></tr>`,
    ].join("");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${TYPE_LABEL[inv.type] ?? inv.type} #${inv.invoice_number}</title>
<style>
  * { font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  body { margin: 40px; color: #1a1a1a; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .biz { font-size: 20px; font-weight: 800; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 22px; }
  .muted { color: #666; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; color: #888; }
  .r { text-align: right; } .c { text-align: center; }
  .tot td { font-weight: 800; border-top: 2px solid #1a1a1a; border-bottom: none; font-size: 15px; }
  .notes { margin-top: 24px; font-size: 12px; color: #444; white-space: pre-wrap; }
</style></head><body>
  <div class="head">
    <div>${logoUrl}<div class="biz">${business}</div></div>
    <div class="doc">
      <h1>${TYPE_LABEL[inv.type] ?? inv.type} #${inv.invoice_number}</h1>
      <div class="muted">Emisión: ${formatDate(inv.issue_date)}</div>
      ${inv.due_date ? `<div class="muted">Vencimiento: ${formatDate(inv.due_date)}</div>` : ""}
    </div>
  </div>
  <div class="muted">Cliente: <strong>${escapeHtml(inv.customers?.full_name ?? "—")}</strong></div>
  <table>
    <thead><tr><th>Concepto</th><th class="c">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead>
    <tbody>${rows}${totalsRows}</tbody>
  </table>
  ${inv.notes ? `<div class="notes">${escapeHtml(inv.notes)}</div>` : ""}
</body></html>`;
    const w = window.open("", "_blank", "width=820,height=920");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const setLine = (idx: number, patch: Partial<InvoiceLineInput>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));

  const onLineService = (idx: number, serviceId: string) => {
    const svc = activeServices.find((s) => s.id === serviceId);
    setLine(idx, {
      service_id: serviceId || null,
      description: svc ? svc.name : form.items[idx].description,
      unit_price: svc ? String(svc.price) : form.items[idx].unit_price,
    });
  };

  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_LINE }] }));
  const removeLine = (idx: number) =>
    setForm((f) => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items,
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addInvoice(form);
    if (ok) setFormOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Facturación</h1>
          <p className="text-sm text-on-surface-variant mt-1">Genera facturas y cotizaciones para tus clientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons disabled={loading || visible.length === 0} busy={exporting} onExport={exportAs} />
          <button
            onClick={openCreate}
            className="bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-primary/20 transition-colors flex items-center justify-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span>Nueva factura</span>
          </button>
        </div>
      </div>

      <Suspense fallback={null}>
        <OpenOnNewParam onOpen={openCreate} onFilter={applyFilterParam} />
      </Suspense>

      {error && <CollectionError message={error} onRetry={fetchInvoices} />}

      {loading ? (
        <CollectionLoading label="Cargando documentos…" />
      ) : invoices.length === 0 ? (
        <CollectionEmpty icon={<IconFileText className="w-8 h-8" />} title="Aún no hay documentos" description="Crea tu primera factura o cotización para tus clientes." action={{ label: "Crear tu primer documento", onClick: openCreate }} />
      ) : (
        <>
          {/* Resumen de cartera: lo que falta cobrar y cuánto ya se pasó de fecha. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-outline-variant/10 bg-surface-container px-4 py-3 text-sm">
            <span className="text-on-surface-variant">
              Por cobrar{" "}
              <strong className="text-on-surface tabular-nums">{fmtMoney(summary.receivable)}</strong>
              <span className="text-on-surface-variant"> ({summary.pendingCount} {summary.pendingCount === 1 ? "factura" : "facturas"})</span>
            </span>
            <span aria-hidden="true" className="text-outline-variant">·</span>
            {summary.overdueCount > 0 ? (
              <button
                type="button"
                onClick={() => setFilter("overdue")}
                className="text-error font-semibold hover:underline"
              >
                Vencidas {summary.overdueCount} ({fmtMoney(summary.overdueAmount)})
              </button>
            ) : (
              <span className="text-on-surface-variant">Vencidas 0</span>
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative lg:w-72">
              <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por número, cliente o nota…"
                aria-label="Buscar documentos"
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container border border-outline-variant/20 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
              {INVOICE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    filter === f.id
                      ? f.id === "overdue"
                        ? "bg-error/10 border-error/40 text-error"
                        : "bg-primary/10 border-primary/40 text-primary"
                      : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          {visible.length === 0 ? (
            <CollectionFilteredEmpty
              action={{ label: "Limpiar filtros", onClick: () => { setFilter("all"); setQuery(""); } }}
            />
          ) : (
          <DataTable
            rows={visible}
            rowKey={(inv) => inv.id}
            minWidth={720}
            caption="Facturas y cotizaciones"
            onRowClick={openDetail}
            columns={invoiceColumnsForCurrency}
          />
          )}
        </div>
        </>
      )}

      {/* Modal crear */}
      {formOpen && (
        <Modal
          open
          onClose={() => {
            if (!submitting) setFormOpen(false);
          }}
          title="Nuevo Documento"
          description={
            convertedFrom !== null
              ? `Desde la cotización #${convertedFrom}. Revisa los datos antes de crearla.`
              : undefined
          }
          size="lg"
          placement="sheet"
          dismissible={false}
          className="sm:max-h-[92vh]"
          bodyClassName="border-t border-outline-variant/10"
        >
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
              {error && (
                <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                  {error}
                </div>
              )}

              {/* Tipo */}
              <div className="flex gap-2">
                {(["factura", "cotizacion"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      form.type === t
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/20 hover:bg-surface-container-high"
                    }`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>

              {/* Cliente + fechas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select
                  label="Cliente"
                  containerClassName="sm:col-span-1"
                  value={form.customer_id || ""}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value || null })}
                >
                  <option value="">Sin cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </Select>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Emisión</label>
                  <input
                    type="date"
                    required
                    value={form.issue_date}
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Vencimiento</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>
              </div>

              {/* Líneas */}
              <div className="space-y-2">
                <label className="text-[13px] font-semibold text-on-surface block">Conceptos</label>
                {form.items.map((line, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start bg-surface-container-lowest rounded-xl p-2 border border-outline-variant/10">
                    <div className="flex-1 w-full space-y-2">
                      <div className="flex gap-2">
                        {activeServices.length > 0 && (
                          <Select
                            size="sm"
                            aria-label="Prellenar desde un servicio"
                            containerClassName="w-32 shrink-0"
                            value={line.service_id || ""}
                            onChange={(e) => onLineService(idx, e.target.value)}
                          >
                            <option value="">Servicio…</option>
                            {activeServices.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </Select>
                        )}
                        <input
                          type="text"
                          required
                          value={line.description}
                          onChange={(e) => setLine(idx, { description: e.target.value })}
                          className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg py-2 px-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50"
                          placeholder="Concepto / descripción"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => setLine(idx, { quantity: e.target.value })}
                        className="w-16 bg-surface-container border border-outline-variant/20 rounded-lg py-2 px-2 text-sm text-on-surface text-center focus:outline-none focus:border-primary transition-all"
                        placeholder="Cant."
                        title="Cantidad"
                      />
                      <div className="w-32">
                        <MoneyInput
                          value={line.unit_price}
                          onChange={(raw) => setLine(idx, { unit_price: raw })}
                          placeholder="Precio"
                          aria-label="Precio unitario"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-on-surface-variant hover:text-error transition-colors p-1 disabled:opacity-30"
                        disabled={form.items.length === 1}
                        aria-label="Quitar línea"
                      >
                        <IconXCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addLine}
                  className="text-sm font-semibold text-primary hover:text-primary-dim transition-colors flex items-center gap-1.5"
                >
                  <IconPlus className="w-4 h-4" /> Añadir concepto
                </button>
              </div>

              {/* Descuento + impuesto */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="invoice-discount" className="text-[13px] font-semibold text-on-surface block">Descuento</label>
                  <MoneyInput
                    id="invoice-discount"
                    value={form.discount_amount === "0" ? "" : form.discount_amount}
                    onChange={(raw) => setForm({ ...form, discount_amount: raw || "0" })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Impuesto (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Totales */}
              <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 space-y-1.5 text-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal</span><span className="tabular-nums">{fmtMoney(totals.subtotal)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Descuento</span><span className="tabular-nums">−{fmtMoney(totals.discount)}</span>
                  </div>
                )}
                {totals.tax > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Impuesto</span><span className="tabular-nums">{fmtMoney(totals.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-on-surface pt-1.5 border-t border-outline-variant/10">
                  <span>Total</span><span className="tabular-nums">{fmtMoney(totals.total)}</span>
                </div>
              </div>

              {/* Notas */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Notas</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none"
                  placeholder="Condiciones, datos de pago… (opcional)"
                />
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Guardando…" : `Crear ${TYPE_LABEL[form.type]}`}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Detalle */}
      {detail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={
            <>
              {TYPE_LABEL[detail.type] ?? detail.type} <span className="font-mono">#{detail.invoice_number}</span>
            </>
          }
          description={`${detail.customers?.full_name ?? "Sin cliente"} · ${formatDate(detail.issue_date)}`}
          placement="sheet"
          bodyClassName="border-t border-outline-variant/10"
        >
            <div className="px-4 sm:px-6 pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => printInvoice(detail, items)}
                disabled={itemsLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
              >
                Imprimir / PDF
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Estado. Una COTIZACIÓN no se paga: es una oferta, y marcarla
                  "Pagada" la sumaba como ingreso en el panel. Lo que se cobra
                  es la factura que sale de ella ("Convertir en factura"). */}
              <div className="flex flex-wrap items-center gap-2">
                {(detail.type === "cotizacion"
                  ? (["pending", "cancelled"] as const)
                  : (["pending", "paid", "cancelled"] as const)
                ).map((st) => (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={detail.status === st}
                    onClick={() => {
                      if (detail.status === st) return;
                      // Cancelar saca el documento de cartera e ingresos: un
                      // clic suelto no alcanza.
                      if (st === "cancelled") {
                        setConfirmCancel(true);
                        return;
                      }
                      setConfirmCancel(false);
                      void updateStatus(detail.id, st);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      detail.status === st
                        ? STATUS[st].cls
                        : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {detail.type === "cotizacion" && st === "pending" ? "Vigente" : STATUS[st].label}
                  </button>
                ))}
                {detail.type === "cotizacion" && detail.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => convertToInvoice(detail, items)}
                    disabled={itemsLoading}
                    className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 transition-colors disabled:opacity-50"
                  >
                    Convertir en factura
                  </button>
                )}
              </div>

              {confirmCancel && (
                <div role="alert" className="rounded-xl border border-error-container/30 bg-error-container/10 p-3 space-y-2">
                  <p className="text-sm font-medium text-on-surface">
                    ¿Cancelar {detail.type === "cotizacion" ? "esta cotización" : "esta factura"}?
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {detail.type === "cotizacion"
                      ? "Queda como no vigente."
                      : detail.status === "paid"
                        ? `Deja de contar como ingreso (${fmtMoney(detail.total)}) en el panel.`
                        : "Sale de lo pendiente por cobrar."}{" "}
                    Puedes volver a cambiar el estado después.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await updateStatus(detail.id, "cancelled");
                        if (ok) setConfirmCancel(false);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-error-container/20 text-error hover:bg-error hover:text-on-error transition-colors"
                    >
                      Sí, cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {/* El error de cambiar el estado se muestra acá: el de la página
                  queda detrás del modal. */}
              {error && (
                <p role="alert" className="rounded-xl bg-error-container/20 border border-error-container/30 px-3 py-2 text-xs text-error-dim">
                  {error}
                </p>
              )}

              {/* Líneas */}
              {itemsLoading ? (
                <p className="text-center text-sm text-on-surface-variant py-6">Cargando…</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => (
                    <div key={it.id} className="flex justify-between gap-3 text-sm">
                      <span className="text-on-surface">
                        {it.description}
                        <span className="text-on-surface-variant"> × {it.quantity}</span>
                      </span>
                      <span className="tabular-nums text-on-surface-variant shrink-0">{fmtMoney(it.line_total)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totales */}
              <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 space-y-1.5 text-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal</span><span className="tabular-nums">{fmtMoney(detail.subtotal)}</span>
                </div>
                {detail.discount_amount > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Descuento</span><span className="tabular-nums">−{fmtMoney(detail.discount_amount)}</span>
                  </div>
                )}
                {detail.tax_amount > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Impuesto ({(detail.tax_rate * 100).toFixed(0)}%)</span>
                    <span className="tabular-nums">{fmtMoney(detail.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-on-surface pt-1.5 border-t border-outline-variant/10">
                  <span>Total</span><span className="tabular-nums">{fmtMoney(detail.total)}</span>
                </div>
              </div>

              {detail.notes && (
                <p className="text-xs text-on-surface-variant whitespace-pre-wrap">{detail.notes}</p>
              )}
            </div>
        </Modal>
      )}
    </div>
  );
}
