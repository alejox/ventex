import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterCounts,
  filterFromParam,
  filterInvoices,
  invoiceDue,
  receivableSummary,
} from "@/app/dashboard/billing/invoice-view";
import type { Invoice } from "@/services/billing.service";

const TODAY = "2026-10-06";

const inv = (over: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36).slice(2),
  invoice_number: 1,
  customer_id: null,
  type: "factura",
  status: "pending",
  issue_date: "2026-09-01",
  due_date: null,
  subtotal: 0,
  discount_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  total: 100,
  notes: null,
  created_at: "2026-09-01T00:00:00Z",
  customers: null,
  ...over,
});

test("invoiceDue: vencida hace N días, vence hoy, vence en N días", () => {
  assert.deepEqual(invoiceDue(inv({ due_date: "2026-10-01" }), TODAY), {
    days: -5,
    overdue: true,
    label: "Vencida hace 5 días",
  });
  assert.equal(invoiceDue(inv({ due_date: "2026-10-05" }), TODAY).label, "Vencida hace 1 día");
  assert.equal(invoiceDue(inv({ due_date: TODAY }), TODAY).label, "Vence hoy");
  assert.equal(invoiceDue(inv({ due_date: "2026-10-08" }), TODAY).label, "Vence en 2 días");
});

test("invoiceDue: una pagada, cancelada o cotización no vence", () => {
  assert.equal(invoiceDue(inv({ due_date: "2026-01-01", status: "paid" }), TODAY).overdue, false);
  assert.equal(invoiceDue(inv({ due_date: "2026-01-01", status: "cancelled" }), TODAY).label, null);
  assert.equal(invoiceDue(inv({ due_date: "2026-01-01", type: "cotizacion" }), TODAY).overdue, false);
  assert.equal(invoiceDue(inv({ due_date: null }), TODAY).label, null);
});

const LIST = [
  inv({ invoice_number: 1, due_date: "2026-09-30", total: 500, customers: { full_name: "José Gómez" } }),
  inv({ invoice_number: 2, due_date: "2026-10-20", total: 300 }),
  inv({ invoice_number: 3, status: "paid", total: 1000 }),
  inv({ invoice_number: 4, type: "cotizacion", total: 9999 }),
  inv({ invoice_number: 5, status: "cancelled", total: 50, notes: "Pedido urgente" }),
];

test("receivableSummary: por cobrar = facturas pendientes; las cotizaciones no son deuda", () => {
  assert.deepEqual(receivableSummary(LIST, TODAY), {
    receivable: 800,
    pendingCount: 2,
    overdueCount: 1,
    overdueAmount: 500,
  });
});

test("filterInvoices: chips y búsqueda sin tildes ni '#'", () => {
  const nums = (l: Invoice[]) => l.map((i) => i.invoice_number);
  assert.deepEqual(nums(filterInvoices(LIST, "overdue", "", TODAY)), [1]);
  assert.deepEqual(nums(filterInvoices(LIST, "pending", "", TODAY)), [1, 2]);
  assert.deepEqual(nums(filterInvoices(LIST, "quotes", "", TODAY)), [4]);
  assert.deepEqual(nums(filterInvoices(LIST, "all", "gomez", TODAY)), [1]);
  assert.deepEqual(nums(filterInvoices(LIST, "all", "#3", TODAY)), [3]);
  assert.deepEqual(nums(filterInvoices(LIST, "all", "URGENTE", TODAY)), [5]);
});

test("filterCounts y filterFromParam", () => {
  const c = filterCounts(LIST, TODAY);
  assert.equal(c.all, 5);
  assert.equal(c.overdue, 1);
  assert.equal(c.cancelled, 1);
  assert.equal(filterFromParam("vencidas"), "overdue");
  assert.equal(filterFromParam("cualquiera"), null);
  assert.equal(filterFromParam(null), null);
});
