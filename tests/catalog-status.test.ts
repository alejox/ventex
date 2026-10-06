import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogRowsOf,
  catalogMatchesStatus,
  catalogKpis,
  isArchivedRow,
} from "../lib/catalog";
import type { Product } from "../services/inventory.service";
import type { Service } from "../services/services.service";

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "CERA MATE",
    category_id: null,
    distributor_id: null,
    sku: "PRD-0001",
    barcode: "7701234567890",
    unit: "Unidad",
    purchase_price: 5000,
    price: 12000,
    package_price: null,
    stock_level: 8,
    tracks_stock: true,
    open_price: false,
    allows_fractions: false,
    minimum_stock: 3,
    image_url: null,
    has_commission: false,
    commission_type: null,
    commission_value: null,
    status: "active",
    units_per_package: 1,
    created_at: "2026-08-01T10:00:00.000Z",
    categories: { name: "PELUQUERÍA" },
    distributors: null,
    ...over,
  };
}

function service(over: Partial<Service> = {}): Service {
  return {
    id: "s1",
    name: "CORTE",
    description: null,
    price: 18000,
    duration_minutes: 30,
    status: "active",
    image_url: null,
    has_commission: false,
    commission_type: null,
    commission_value: null,
    category_id: null,
    created_at: "2026-08-02T10:00:00.000Z",
    categories: null,
    ...over,
  };
}

test("Archivado = todo lo que no sea active", () => {
  assert.equal(isArchivedRow({ status: "active" }), false);
  assert.equal(isArchivedRow({ status: "inactive" }), true);
  assert.equal(isArchivedRow({ status: "lo-que-sea" }), true);
});

test("El filtro Estado separa activos, archivados y todos", () => {
  const rows = catalogRowsOf(
    [product(), product({ id: "p2", status: "inactive" })],
    [service(), service({ id: "s2", status: "inactive" })],
  );
  const ids = (f: "active" | "archived" | "all") =>
    rows.filter((r) => catalogMatchesStatus(r, f)).map((r) => r.id).sort();
  assert.deepEqual(ids("active"), ["p1", "s1"]);
  assert.deepEqual(ids("archived"), ["p2", "s2"]);
  assert.deepEqual(ids("all"), ["p1", "p2", "s1", "s2"]);
});

test("Los KPIs no cuentan lo archivado, ni siquiera en Stock bajo", () => {
  const rows = catalogRowsOf(
    [
      product({ id: "p1", stock_level: 1, minimum_stock: 3 }), // activo y bajo
      product({ id: "p2", stock_level: 50, minimum_stock: 3 }), // activo y óptimo
      product({ id: "p3", stock_level: 0, minimum_stock: 3, status: "inactive" }), // archivado y agotado
    ],
    [service(), service({ id: "s2", status: "inactive" })],
  );
  assert.deepEqual(catalogKpis(rows), { products: 2, services: 1, lowStock: 1, archived: 2 });
});

test("Un catálogo vacío da ceros", () => {
  assert.deepEqual(catalogKpis([]), { products: 0, services: 0, lowStock: 0, archived: 0 });
});
