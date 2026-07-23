"use client";

import { useEffect, useMemo, useState } from "react";
import { IconFileText, IconPlus, IconXCircle } from "@/app/assets/icons/DashboardIcons";
import { useBillingStore } from "@/stores/billing.store";
import { useCustomersStore } from "@/stores/customers.store";
import { useServicesStore } from "@/stores/services.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useProfile } from "@/components/ProfileProvider";
import type { Invoice, InvoiceItem, InvoiceLineInput, NewInvoiceInput } from "@/services/billing.service";
import { DataTable, type DataColumn } from "@/components/DataTable";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

const today = () => new Date().toISOString().split("T")[0];

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

const INVOICE_COLUMNS: DataColumn<Invoice>[] = [
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
    cell: (inv) => `$${money(inv.total)}`,
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
    header: "Fecha",
    className: "text-on-surface-variant",
    cell: (inv) => formatDate(inv.issue_date),
  },
];

export default function BillingPage() {
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
  const [form, setForm] = useState<NewInvoiceInput>(newEmptyInvoice());
  const [detail, setDetail] = useState<Invoice | null>(null);

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

  const openCreate = () => {
    setForm(newEmptyInvoice());
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
          `<tr><td>${escapeHtml(it.description)}</td><td class="c">${it.quantity}</td><td class="r">$${money(it.unit_price)}</td><td class="r">$${money(it.line_total)}</td></tr>`,
      )
      .join("");
    const totalsRows = [
      `<tr><td colspan="3" class="r">Subtotal</td><td class="r">$${money(inv.subtotal)}</td></tr>`,
      inv.discount_amount > 0
        ? `<tr><td colspan="3" class="r">Descuento</td><td class="r">-$${money(inv.discount_amount)}</td></tr>`
        : "",
      inv.tax_amount > 0
        ? `<tr><td colspan="3" class="r">Impuesto (${(inv.tax_rate * 100).toFixed(0)}%)</td><td class="r">$${money(inv.tax_amount)}</td></tr>`
        : "",
      `<tr class="tot"><td colspan="3" class="r">Total</td><td class="r">$${money(inv.total)}</td></tr>`,
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
        <button
          onClick={openCreate}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Nueva Factura</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando documentos…</p>
      ) : invoices.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconFileText className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay documentos</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Crea tu primera factura o cotización para tus clientes.
          </p>
          <button
            onClick={openCreate}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Crear tu primer documento
          </button>
        </div>
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <DataTable
            rows={invoices}
            rowKey={(inv) => inv.id}
            minWidth={720}
            caption="Facturas y cotizaciones"
            onRowClick={openDetail}
            columns={INVOICE_COLUMNS}
          />
        </div>
      )}

      {/* Modal crear */}
      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">Nuevo Documento</h2>
              <button
                onClick={() => setFormOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto">
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
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-[13px] font-semibold text-on-surface block">Cliente</label>
                  <select
                    value={form.customer_id || ""}
                    onChange={(e) => setForm({ ...form, customer_id: e.target.value || null })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  >
                    <option value="">Sin cliente</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>
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
                          <select
                            value={line.service_id || ""}
                            onChange={(e) => onLineService(idx, e.target.value)}
                            className="w-32 shrink-0 bg-surface-container border border-outline-variant/20 rounded-lg py-2 px-2 text-xs text-on-surface focus:outline-none focus:border-primary transition-all"
                            title="Prellenar desde un servicio"
                          >
                            <option value="">Servicio…</option>
                            {activeServices.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
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
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => setLine(idx, { unit_price: e.target.value })}
                        className="w-24 bg-surface-container border border-outline-variant/20 rounded-lg py-2 px-2 text-sm text-on-surface text-right focus:outline-none focus:border-primary transition-all"
                        placeholder="Precio"
                        title="Precio unitario"
                      />
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
                  <label className="text-[13px] font-semibold text-on-surface block">Descuento</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.discount_amount}
                    onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="0.00"
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
                  <span>Subtotal</span><span className="tabular-nums">${money(totals.subtotal)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Descuento</span><span className="tabular-nums">−${money(totals.discount)}</span>
                  </div>
                )}
                {totals.tax > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Impuesto</span><span className="tabular-nums">${money(totals.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-on-surface pt-1.5 border-t border-outline-variant/10">
                  <span>Total</span><span className="tabular-nums">${money(totals.total)}</span>
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

              <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3 border-t border-outline-variant/10">
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
          </div>
        </div>
      )}

      {/* Detalle */}
      {detail && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                  {TYPE_LABEL[detail.type] ?? detail.type} <span className="font-mono">#{detail.invoice_number}</span>
                </h2>
                <p className="text-xs text-on-surface-variant truncate">
                  {detail.customers?.full_name ?? "Sin cliente"} · {formatDate(detail.issue_date)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => printInvoice(detail, items)}
                  disabled={itemsLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                >
                  Imprimir / PDF
                </button>
                <button
                  onClick={() => setDetail(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                  aria-label="Cerrar"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {/* Estado */}
              <div className="flex flex-wrap gap-2">
                {(["pending", "paid", "cancelled"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => updateStatus(detail.id, st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      detail.status === st
                        ? STATUS[st].cls
                        : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {STATUS[st].label}
                  </button>
                ))}
              </div>

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
                      <span className="tabular-nums text-on-surface-variant shrink-0">${money(it.line_total)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totales */}
              <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 space-y-1.5 text-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal</span><span className="tabular-nums">${money(detail.subtotal)}</span>
                </div>
                {detail.discount_amount > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Descuento</span><span className="tabular-nums">−${money(detail.discount_amount)}</span>
                  </div>
                )}
                {detail.tax_amount > 0 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Impuesto ({(detail.tax_rate * 100).toFixed(0)}%)</span>
                    <span className="tabular-nums">${money(detail.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-on-surface pt-1.5 border-t border-outline-variant/10">
                  <span>Total</span><span className="tabular-nums">${money(detail.total)}</span>
                </div>
              </div>

              {detail.notes && (
                <p className="text-xs text-on-surface-variant whitespace-pre-wrap">{detail.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
