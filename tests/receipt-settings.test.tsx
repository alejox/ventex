import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReceiptContent, PosReceipt } from "../components/PosReceipt";
import { buildSampleReceipt, DEFAULT_RECEIPT_SETTINGS, normalizeReceiptSettings, normalizePaperWidth, RECEIPT_TEXT_MAX_LENGTH } from "../lib/receipt-settings";
import { saveReceiptSettings, saveSettings } from "../services/settings.service";
import type { ReceiptData } from "../lib/receipt";
import type { createClient } from "../utils/supabase/client";

const receipt: ReceiptData = {
  businessName: "Business Name", logoUrl: "https://example.com/logo.png", municipality: "Bogotá", phone: "1234567",
  saleId: "sale-1", saleNumber: 77, queued: false, date: new Date("2026-10-14T15:00:00Z"),
  customer: { full_name: "Customer Name", doc_type: "CC", identification: "123" },
  cashier: "Cashier Name", seller: "Seller Name", includeTax: true,
  items: [{ name: "Product Name", sku: "SKU", quantity: 1, packageLabel: null, unitPrice: 1190, gross: 1190, discount: 190, discountLabel: "Offer", total: 1000 }],
  totals: { gross: 1190, subtotal: 840.34, discount: 190, exemptionDiscount: 0, taxAmount: 159.66, total: 1000 },
  paymentLabel: "Efectivo", payments: [], tendered: 2000, change: 1000,
};

test("receipt settings accept only known booleans and bounded plain text", () => {
  assert.deepEqual(normalizeReceiptSettings(null), DEFAULT_RECEIPT_SETTINGS);
  assert.deepEqual(normalizeReceiptSettings([]), DEFAULT_RECEIPT_SETTINGS);
  const value = normalizeReceiptSettings({ showLogo: false, showBusiness: "false", headerText: "x".repeat(1000), footerText: 42, style: "bad" });
  assert.equal(value.showLogo, false);
  assert.equal(value.showBusiness, true);
  assert.equal(value.headerText.length, RECEIPT_TEXT_MAX_LENGTH);
  assert.equal(value.footerText, "");
  assert.equal("style" in value, false);
  assert.equal(normalizePaperWidth("58mm; color:red"), "80mm");
  assert.equal(normalizePaperWidth("58mm"), "58mm");
});

test("default visible content matches printed receipt and keeps 80mm default", () => {
  const visible = renderToStaticMarkup(<ReceiptContent data={receipt} />);
  const printed = renderToStaticMarkup(<PosReceipt data={receipt} />);
  assert.ok(printed.includes(visible.replace(/<link[^>]+>/g, "")));
  for (const text of ["Business Name", "Bogotá", "1234567", "Customer Name", "Cashier Name", "Seller Name", "Pre-factura", "Sin valor fiscal", "Venta N.º 77", "Product Name", "IVA:", "Pago:", "Recibido:", "Cambio:"]) assert.ok(visible.includes(text), text);
  assert.match(printed, /size: 80mm 297mm/);
  assert.doesNotMatch(visible, /hidden print:block/);
  assert.match(visible, /max-w-full/);
});

test("optional identity sections can hide but financials, date, fiscal text and offline status cannot", () => {
  const settings = normalizeReceiptSettings({ showLogo: false, showBusiness: false, showContact: false, showCustomer: false, showCashier: false, showSeller: false, headerText: '<script>alert("x")</script>', footerText: "Thanks\nAgain" });
  const html = renderToStaticMarkup(<ReceiptContent data={{ ...receipt, saleNumber: null, queued: true }} settings={settings} paperWidth="58mm" />);
  for (const text of ["Business Name", "Bogotá", "1234567", "Customer Name", "Cashier Name", "Seller Name", "<img", "<script>"]) assert.ok(!html.includes(text), text);
  for (const text of ["Pre-factura", "Sin valor fiscal", "Pendiente de env", "2026", "Product Name", "Descuentos aplicados", "IVA:", "Pago:", "Recibido:", "Cambio:", "Thanks\nAgain", "&lt;script&gt;"]) assert.ok(html.includes(text), text);
  assert.match(html, /width:58mm/);
  assert.match(renderToStaticMarkup(<PosReceipt data={receipt} paperWidth="58mm" />), /size: 58mm 297mm/);
});

function fakeSettings(initial: Record<string, unknown> | null) {
  let row = initial;
  const writes: Record<string, unknown>[] = [];
  let readError: Error | null = null;
  const client = { from: (table: string) => {
    assert.equal(table, "settings");
    const write = (payload: Record<string, unknown>) => {
      writes.push(payload);
      row = { id: "settings-1", ...row, ...payload };
      return { eq: (key: string, id: string) => { assert.equal(key, "id"); assert.equal(id, "settings-1"); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; }, select: () => ({ single: async () => ({ data: row, error: null }) }) };
    };
    return { select: () => ({ maybeSingle: async () => ({ data: row, error: readError }) }), update: write, insert: write };
  } } as unknown as ReturnType<typeof createClient>;
  return { client, writes, failRead: () => { readError = new Error("Read failed"); } };
}

test("narrow appearance save preserves unknown profile keys and unrelated settings", async () => {
  const db = fakeSettings({ id: "settings-1", tax_rate: 0.05, currency: "USD", business_profile: { businessName: "Keep", futureKey: { nested: true }, receiptSettings: { showLogo: true } } });
  const saved = await saveReceiptSettings(normalizeReceiptSettings({ showLogo: false }), db.client);
  assert.equal(saved.currency, "USD");
  assert.equal(saved.tax_rate, 0.05);
  assert.deepEqual(Object.keys(db.writes[0]), ["business_profile"]);
  assert.deepEqual(db.writes[0].business_profile, { businessName: "Keep", futureKey: { nested: true }, receiptSettings: normalizeReceiptSettings({ showLogo: false }) });
});

test("appearance save lazily inserts only its profile and returns mapped defaults", async () => {
  const db = fakeSettings(null);
  const saved = await saveReceiptSettings(DEFAULT_RECEIPT_SETTINGS, db.client);
  assert.equal(saved.currency, "COP");
  assert.equal(saved.include_tax, true);
  assert.deepEqual(db.writes, [{ business_profile: { receiptSettings: DEFAULT_RECEIPT_SETTINGS } }]);
});

test("stale business form cannot overwrite latest receipt preferences or unknown profile keys", async () => {
  const latest = normalizeReceiptSettings({ showLogo: false, footerText: "New footer" });
  const db = fakeSettings({ id: "settings-1", business_profile: { receiptSettings: latest, futureKey: 1 } });
  const result = await saveSettings({ allow_oversell: false, currency: "COP", business_profile: { businessName: "Updated", receiptSettings: DEFAULT_RECEIPT_SETTINGS } }, db.client);
  assert.deepEqual(result.business_profile.receiptSettings, latest);
  assert.equal(result.business_profile.businessName, "Updated");
  assert.equal((db.writes[0].business_profile as Record<string, unknown>).futureKey, 1);
});

test("ordinary settings save cannot create receipt preferences and read failure prevents writes", async () => {
  const db = fakeSettings(null);
  const result = await saveSettings({ allow_oversell: true, currency: "COP", business_profile: { businessName: "New", receiptSettings: DEFAULT_RECEIPT_SETTINGS } }, db.client);
  assert.equal(result.business_profile.receiptSettings, undefined);
  db.failRead();
  await assert.rejects(saveReceiptSettings(DEFAULT_RECEIPT_SETTINGS, db.client), /Read failed/);
  assert.equal(db.writes.length, 1);
});


test("sample receipt is synthetic, visibly labelled and retains fiscal information", () => {
  const date = new Date("2026-10-14T15:00:00Z");
  const sample = buildSampleReceipt({ businessName: "Example" }, date, true);
  assert.equal(sample.saleId, "EJEMPLO-001");
  assert.equal(sample.saleNumber, null);
  assert.equal(sample.date, date);
  assert.equal(sample.totals.subtotal + sample.totals.taxAmount, sample.totals.total);
  const html = renderToStaticMarkup(<PosReceipt data={sample} sample />);
  assert.match(html, /EJEMPLO \/ IMPRESIÓN DE PRUEBA/);
  assert.match(html, /EJEMPLO-001/);
  assert.match(html, /Pre-factura/);
  assert.match(html, /Sin valor fiscal/);
  assert.doesNotMatch(renderToStaticMarkup(<PosReceipt data={receipt} />), /IMPRESIÓN DE PRUEBA/);
  assert.equal(buildSampleReceipt({}, date, false).totals.taxAmount, 0);
});
