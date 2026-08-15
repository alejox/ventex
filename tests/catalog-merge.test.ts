import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogRowsOf,
  catalogEditHref,
  catalogMatchesQuery,
  isLegacyServiceProduct,
} from "../lib/catalog";
import { SERVICE_UNIT } from "../services/inventory.service";
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
    has_commission: false,
    commission_type: null,
    commission_value: null,
    category_id: null,
    created_at: "2026-08-02T10:00:00.000Z",
    categories: null,
    ...over,
  };
}

test("1. El catálogo junta las dos tablas y cada fila sabe de cuál salió", () => {
  const rows = catalogRowsOf([product()], [service()]);

  assert.equal(rows.length, 2);
  // Lo último creado primero: el servicio es del 02, el producto del 01.
  assert.equal(rows[0].kind, "service");
  assert.equal(rows[1].kind, "product");

  // El tipo discrimina a qué tabla va la edición. Un mismo `id` para las dos
  // obligaría al formulario a adivinar, y un uuid no dice de dónde salió.
  assert.equal(catalogEditHref(rows[1]), "/dashboard/inventory/product?id=p1");
  assert.equal(catalogEditHref(rows[0]), "/dashboard/inventory/product?serviceId=s1");
});

test("2. El servicio duplicado como producto NO se muestra dos veces", () => {
  // Este es el bug que la unificación vino a cerrar: hasta la migración
  // 20260815 un servicio se guardaba en `services` Y en `products` con la
  // unidad "Servicio". Las filas viejas siguen en la base por el histórico de
  // `sale_items`, así que el catálogo tiene que dejarlas afuera.
  const legacy = product({ id: "p-legacy", name: "CORTE", unit: SERVICE_UNIT, stock_level: 0 });
  assert.equal(isLegacyServiceProduct(legacy), true);

  const rows = catalogRowsOf([legacy, product()], [service({ name: "CORTE" })]);

  assert.equal(rows.length, 2, "la fila legada no suma una tercera entrada");
  assert.equal(rows.filter((r) => r.name === "CORTE").length, 1);
  // Y la que queda es la de `services`: es la que tiene duración y la que
  // referencian las citas y el sitio público.
  const corte = rows.find((r) => r.name === "CORTE")!;
  assert.equal(corte.kind, "service");
});

test("3. La fila legada se descarta aunque el nombre NO coincida", () => {
  // El emparejado viejo era por nombre con `ilike`, así que renombrar rompía el
  // vínculo y el ítem volvía a aparecer duplicado. Acá el descarte es por la
  // unidad de la fila, no por su texto: renombrar no lo resucita.
  const legacy = product({ id: "p-legacy", name: "CORTE VIEJO", unit: SERVICE_UNIT, stock_level: 0 });
  const rows = catalogRowsOf([legacy], [service({ name: "CORTE NUEVO" })]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "CORTE NUEVO");
});

test("4. Buscar por SKU o código de barras es cosa de productos", () => {
  const [servicio] = catalogRowsOf([], [service()]);
  const [prod] = catalogRowsOf([product()], []);

  assert.equal(catalogMatchesQuery(prod, "prd-0001"), true, "el SKU no distingue mayúsculas");
  assert.equal(catalogMatchesQuery(prod, "7701234567890"), true, "el código del escáner también busca");
  assert.equal(catalogMatchesQuery(prod, "cera"), true);

  // Un servicio no tiene SKU ni código: solo se lo encuentra por nombre, y una
  // búsqueda por código no puede devolverlo por accidente.
  assert.equal(catalogMatchesQuery(servicio, "corte"), true);
  assert.equal(catalogMatchesQuery(servicio, "PRD-0001"), false);

  // Sin búsqueda, entra todo.
  assert.equal(catalogMatchesQuery(servicio, ""), true);
  assert.equal(catalogMatchesQuery(servicio, "   "), true);
});

test("5. La categoría se lee de cada tabla, no solo de productos", () => {
  const rows = catalogRowsOf(
    [product()],
    [service({ categories: { name: "SERVICIOS DE BARBERÍA" } })],
  );

  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.categoryName]));
  assert.equal(byKind.product, "PELUQUERÍA");
  // `services.category_id` se agregó en la migración 20260815 justo por esto:
  // el catálogo filtra por categoría y antes un servicio no tenía dónde
  // guardarla salvo en el gemelo que se retiró.
  assert.equal(byKind.service, "SERVICIOS DE BARBERÍA");
});
