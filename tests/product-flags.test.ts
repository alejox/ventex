import test from "node:test";
import assert from "node:assert/strict";
import { tracksStock, needsRestock, stockLabelOf } from "../lib/stock";
import { calculateInventoryValue, SERVICE_UNIT } from "../services/inventory.service";
import { linePrice } from "../services/pos.service";
import type { CartLine, CatalogItem } from "../services/pos.service";

const papa = { unit: "kg", tracks_stock: false, stock_level: 0, minimum_stock: 10 };
const gaseosa = { unit: "Unidad", tracks_stock: true, stock_level: 7, minimum_stock: 10 };

test("1. Un producto marcado sin inventario no lleva stock", () => {
  assert.equal(tracksStock(papa), false);
  assert.equal(tracksStock(gaseosa), true);
});

test("2. Un servicio tampoco, y las filas viejas sí", () => {
  // `tracks_stock` no existía hasta esta migración: una fila sin el campo es un
  // producto normal, no uno sin inventario. Asumir lo contrario apagaría el
  // inventario de todo el catálogo de golpe.
  assert.equal(tracksStock({ unit: SERVICE_UNIT }), false);
  assert.equal(tracksStock({ unit: "Unidad" }), true);
  assert.equal(tracksStock({ unit: "Unidad", tracks_stock: undefined }), true);
});

test("3. Sin inventario no hay reposición que sugerir", () => {
  // El caso exacto de las papas: 0 unidades contra un mínimo de 10 es
  // "reponer YA" para cualquier producto normal. Para uno que no se cuenta, ese
  // cero no significa nada y el aviso sería ruido permanente.
  assert.equal(needsRestock(papa), false);
  assert.equal(needsRestock(gaseosa), true);
});

test("4. La etiqueta no afirma un estado de stock que no existe", () => {
  assert.equal(stockLabelOf(0, 10), "Agotado", "un producto normal en cero sí está agotado");
  assert.equal(tracksStock(papa) ? stockLabelOf(0, 10) : "Sin inventario", "Sin inventario");
});

test("5. La valorización ignora lo que no se cuenta", () => {
  // Valorizar papas por un stock que nadie mantiene es inventar capital: el
  // número saldría de un conteo que el negocio declaró imposible de sostener.
  const value = calculateInventoryValue([
    { unit: "Unidad", purchase_price: 1000, stock_level: 5, tracks_stock: true },
    { unit: "kg", purchase_price: 2000, stock_level: 50, tracks_stock: false },
    { unit: SERVICE_UNIT, purchase_price: 3000, stock_level: 9 },
  ]);
  assert.equal(value, 5000);
});

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "p1",
  kind: "product",
  name: "PAPA",
  sku: "PAPA",
  barcode: null,
  price: 3000,
  package_price: null,
  units_per_package: 1,
  stock_level: null,
  category_name: null,
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
  open_price: true,
  allows_fractions: true,
  ...over,
});

test("6. El precio asignado al vender manda sobre el del catálogo", () => {
  const line: CartLine = { item: item(), quantity: 2, customPrice: 4200 };
  assert.equal(linePrice(line), 4200);
});

test("7. Sin precio asignado se muestra el sugerido, no NaN ni cero", () => {
  // El servidor RECHAZA la venta sin precio (PRECIO_REQUERIDO). Hasta que el
  // cajero lo asigne, la vitrina muestra el sugerido: un 0 en pantalla se lee
  // como "es gratis" y un NaN rompe el total entero.
  assert.equal(linePrice({ item: item(), quantity: 1 }), 3000);
});

test("8. Un precio asignado en cero es un precio, no un vacío", () => {
  // Regalar una unidad es una decisión legítima del mostrador, y `0 || x` la
  // convertiría en el precio de catálogo a espaldas del cajero.
  assert.equal(linePrice({ item: item(), quantity: 1, customPrice: 0 }), 0);
});

test("9. La caja sigue cobrándose a precio de caja cuando no hay precio asignado", () => {
  const line: CartLine = {
    item: item({ open_price: false, package_price: 24000, units_per_package: 24 }),
    unitKind: "package",
    quantity: 1,
  };
  assert.equal(linePrice(line), 24000);
});
