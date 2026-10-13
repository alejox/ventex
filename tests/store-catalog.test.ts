import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCatalog, normalizeSearch, restoreOrder } from "../lib/store-catalog";

const P = (id: string, name: string, categoryId: string | null, inStock = true, price = 1000) => ({
  id,
  name,
  price,
  categoryId,
  inStock,
});

const CATALOG = [
  P("1", "Pan tajado", "panaderia"),
  P("2", "Café molido", "bebidas"),
  P("3", "Arepa", "panaderia", false),
  P("4", "Agua sin gas", "bebidas"),
  P("5", "Cafetera", null),
  P("6", "Café en grano", "bebidas", false),
];

const names = (list: { name: string }[]) => list.map((product) => product.name);

test("normalizeSearch: sin tildes, sin mayúsculas y sin espacios de sobra", () => {
  assert.equal(normalizeSearch("  CAFÉ   Molido "), "cafe molido");
  assert.equal(normalizeSearch("Ñame"), "name");
});

test("sin filtros: todo, primero lo disponible y cada grupo por nombre", () => {
  assert.deepEqual(names(filterCatalog(CATALOG, { categoryId: null, query: "" })), [
    "Agua sin gas",
    "Café molido",
    "Cafetera",
    "Pan tajado",
    "Arepa",
    "Café en grano",
  ]);
});

test("la búsqueda ignora tildes y mayúsculas", () => {
  assert.deepEqual(names(filterCatalog(CATALOG, { categoryId: null, query: "cafe" })), [
    "Café molido",
    "Cafetera",
    "Café en grano",
  ]);
  assert.deepEqual(names(filterCatalog(CATALOG, { categoryId: null, query: "CAFÉ" })), [
    "Café molido",
    "Cafetera",
    "Café en grano",
  ]);
});

test("varias palabras: el nombre tiene que tenerlas todas, en cualquier orden", () => {
  assert.deepEqual(names(filterCatalog(CATALOG, { categoryId: null, query: "grano cafe" })), ["Café en grano"]);
});

test("filtra por categoría y combina con la búsqueda", () => {
  assert.deepEqual(names(filterCatalog(CATALOG, { categoryId: "panaderia", query: "" })), ["Pan tajado", "Arepa"]);
  assert.deepEqual(names(filterCatalog(CATALOG, { categoryId: "bebidas", query: "café" })), ["Café molido", "Café en grano"]);
});

test("una búsqueda sin coincidencias devuelve vacío y no muta la lista", () => {
  const before = names(CATALOG);
  assert.deepEqual(filterCatalog(CATALOG, { categoryId: null, query: "xyz" }), []);
  assert.deepEqual(names(CATALOG), before);
});

test("restoreOrder: recupera solo productos vigentes y disponibles, con el precio de hoy", () => {
  const saved = [
    { productId: "1", name: "Pan viejo", unitPrice: 500, qty: 2 },
    { productId: "3", name: "Arepa", unitPrice: 1000, qty: 1 },
    { productId: "borrado", name: "Ya no existe", unitPrice: 100, qty: 4 },
    { productId: "2", name: "Café molido", unitPrice: 1000, qty: 500 },
  ];
  const catalog = [P("1", "Pan tajado", null, true, 4200), P("2", "Café molido", null), P("3", "Arepa", null, false)];
  assert.deepEqual(restoreOrder(saved, catalog), [
    { productId: "1", name: "Pan tajado", unitPrice: 4200, qty: 2 },
    { productId: "2", name: "Café molido", unitPrice: 1000, qty: 99 },
  ]);
});

test("restoreOrder: basura guardada da un pedido vacío", () => {
  for (const raw of [null, undefined, "x", 3, {}, [null, 1, { productId: 2 }], [{ productId: "1", qty: "dos" }]]) {
    assert.deepEqual(restoreOrder(raw, CATALOG), []);
  }
});
