import test from "node:test";
import assert from "node:assert/strict";
import { heldTabUnits, heldTabsKey, MAX_AGE_MS, restoreHeldTabs, snapshotHeldTabs } from "../lib/pos-held-tabs";

type Item = { id: string; kind: "product" | "service"; price: number };
const coca: Item = { id: "p1", kind: "product", price: 3000 };
const corte: Item = { id: "s1", kind: "service", price: 20000 };

const tab = (
  id: string,
  cart: { item: Item; quantity: number; staffId?: string | null }[],
  extra: { customerId?: string | null; staffId?: string | null } = {},
) => ({
  id,
  name: `Venta ${id}`,
  cart,
  customerId: null as string | null,
  staffId: null as string | null,
  ...extra,
});

const now = new Date("2026-10-06T15:00:00Z");

test("la clave separa usuario y negocio (IndexedDB es por origen, no por cuenta)", () => {
  assert.equal(heldTabsKey({ authUserId: "u1", workspaceId: "w1" }), "u1:w1");
  assert.notEqual(
    heldTabsKey({ authUserId: "u1", workspaceId: "w2" }),
    heldTabsKey({ authUserId: "u1", workspaceId: "w1" }),
  );
});

test("una sola pestaña vacía no se guarda (se borra la foto)", () => {
  assert.equal(snapshotHeldTabs([tab("a", [])], "a", now), null);
  assert.equal(snapshotHeldTabs([], "a", now), null);
});

test("ida y vuelta: las ventas en espera vuelven con el ítem del catálogo de HOY", () => {
  const snap = snapshotHeldTabs(
    [
      tab("a", [{ item: coca, quantity: 2 }]),
      tab("b", [{ item: corte, quantity: 1 }], { customerId: "c1", staffId: "st1" }),
    ],
    "b",
    now,
  );
  assert.ok(snap);
  const cocaHoy = { ...coca, price: 3500 };
  const r = restoreHeldTabs(snap, {
    catalog: [cocaHoy, corte],
    customerIds: new Set(["c1"]),
    staffIds: new Set(["st1"]),
    now: new Date(now.getTime() + 60_000),
  });
  assert.ok(r);
  assert.equal(r.activeTabId, "b");
  assert.equal(r.tabs[0].cart[0].item.price, 3500);
  assert.equal(r.tabs[1].customerId, "c1");
  assert.equal(r.tabs[1].staffId, "st1");
  assert.equal(r.droppedLines, 0);
});

test("ítems que ya no existen se descartan; cliente y personal que no están se sueltan", () => {
  const snap = snapshotHeldTabs(
    [
      tab("a", [{ item: coca, quantity: 1, staffId: "viejo" }, { item: corte, quantity: 1 }], {
        customerId: "borrado",
        staffId: "viejo",
      }),
    ],
    "a",
    now,
  );
  const r = restoreHeldTabs(snap, { catalog: [coca], customerIds: new Set(), staffIds: new Set(), now });
  assert.ok(r);
  assert.equal(r.tabs[0].cart.length, 1);
  assert.equal(r.tabs[0].cart[0].staffId, null);
  assert.equal(r.tabs[0].customerId, null);
  assert.equal(r.tabs[0].staffId, null);
  assert.equal(r.droppedLines, 1);
});

test("un producto y un servicio con el mismo id no se confunden", () => {
  const svc: Item = { id: "p1", kind: "service", price: 9 };
  const snap = snapshotHeldTabs([tab("a", [{ item: svc, quantity: 1 }])], "a", now);
  assert.equal(restoreHeldTabs(snap, { catalog: [coca], customerIds: new Set(), staffIds: new Set(), now }), null);
});

test("foto vieja, de otra versión o sin nada que restaurar: no se restaura", () => {
  const snap = snapshotHeldTabs([tab("a", [{ item: coca, quantity: 1 }])], "a", now)!;
  const opts = { catalog: [coca], customerIds: new Set<string>(), staffIds: new Set<string>() };
  assert.equal(restoreHeldTabs(snap, { ...opts, now: new Date(now.getTime() + MAX_AGE_MS + 1) }), null);
  assert.equal(restoreHeldTabs({ ...snap, version: 99 }, { ...opts, now }), null);
  assert.equal(restoreHeldTabs(null, { ...opts, now }), null);
  assert.equal(restoreHeldTabs(snap, { ...opts, catalog: [] as Item[], now }), null);
});

test("unidades de la pestaña para la etiqueta 'N · $X'", () => {
  assert.equal(heldTabUnits([{ quantity: 2 }, { quantity: 1.5 }]), 3.5);
  assert.equal(heldTabUnits([]), 0);
});
