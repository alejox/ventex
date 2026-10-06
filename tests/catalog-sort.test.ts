import test from "node:test";
import assert from "node:assert/strict";
import { catalogRowsOf, sortCatalogRows, isCatalogSortKey } from "../lib/catalog";
import type { Product } from "../services/inventory.service";
import type { Service } from "../services/services.service";

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Cera mate",
    category_id: null,
    distributor_id: null,
    sku: "PRD-0001",
    barcode: null,
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
    name: "Corte",
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

const rows = catalogRowsOf(
  [
    product({ id: "a", name: "Talla 10", price: 3000, stock_level: 5, created_at: "2026-08-01T00:00:00Z", categories: { name: "ROPA" } }),
    product({ id: "b", name: "talla 2", price: 1000, stock_level: 0, created_at: "2026-08-03T00:00:00Z", categories: null }),
    product({ id: "c", name: "Álbum", price: 2000, stock_level: 9, tracks_stock: false, created_at: "2026-08-04T00:00:00Z", categories: { name: "ACCESORIOS" } }),
  ],
  [service({ id: "s", name: "Corte", price: 18000, created_at: "2026-08-02T00:00:00Z" })],
);
const ids = (list: { id: string }[]) => list.map((r) => r.id);

test("sin clave conserva el orden por creación (lo último primero)", () => {
  assert.deepEqual(ids(sortCatalogRows(rows, null)), ["c", "b", "s", "a"]);
});

test("nombre: alfabético sin tildes ni mayúsculas, números en orden natural", () => {
  assert.deepEqual(ids(sortCatalogRows(rows, "name", "asc")), ["c", "s", "b", "a"]);
  assert.deepEqual(ids(sortCatalogRows(rows, "name", "desc")), ["a", "b", "s", "c"]);
});

test("precio: por número, no por texto", () => {
  assert.deepEqual(ids(sortCatalogRows(rows, "price", "asc")), ["b", "c", "a", "s"]);
  assert.deepEqual(ids(sortCatalogRows(rows, "price", "desc")), ["s", "a", "c", "b"]);
});

test("stock: lo que no lleva conteo va al final en los dos sentidos", () => {
  assert.deepEqual(ids(sortCatalogRows(rows, "stock", "asc")), ["b", "a", "c", "s"]);
  assert.deepEqual(ids(sortCatalogRows(rows, "stock", "desc")), ["a", "b", "c", "s"]);
});

test("categoría: sin categoría al final", () => {
  assert.deepEqual(ids(sortCatalogRows(rows, "category", "asc")).slice(0, 2), ["c", "a"]);
  assert.deepEqual(ids(sortCatalogRows(rows, "category", "desc")).slice(0, 2), ["a", "c"]);
});

test("no muta la lista original", () => {
  const before = ids(rows);
  sortCatalogRows(rows, "price", "asc");
  assert.deepEqual(ids(rows), before);
});

test("isCatalogSortKey rechaza claves pegadas a mano en la URL", () => {
  assert.ok(isCatalogSortKey("price"));
  assert.equal(isCatalogSortKey("drop table"), false);
});
