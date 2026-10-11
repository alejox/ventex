import test from "node:test";
import assert from "node:assert/strict";
import {
  getUnitCost,
  calculateInventoryValue,
  calculateMargin,
  contentPatch,
  handlePresentationModeChange,
  isServiceItem,
  SERVICE_UNIT,
} from "../services/inventory.service";

test("1. Producto en modo Unidad (units_per_package = 1)", () => {
  const product = {
    purchase_price: 50,
    units_per_package: 1,
    stock_level: 10,
  };

  // Costo unitario real debe ser exactamente purchase_price
  const unitCost = getUnitCost(product);
  assert.equal(unitCost, 50, "El costo unitario en modo unidad debe ser 50");

  // Margen con costo $50 y venta $75 en modo unidad: sobre el PRECIO (25 de 75).
  const margin = calculateMargin(50, 75, "unit", "1");
  assert.notEqual(margin, null);
  assert.equal(margin!.costPerUnit, 50);
  assert.equal(margin!.profit, 25);
  assert.equal(Math.round(margin!.pct * 10) / 10, 33.3, "El margen sobre el precio debe ser 33,3%");

  // Valor del inventario: 10 unidades * $50 = $500
  const totalValue = calculateInventoryValue([product]);
  assert.equal(totalValue, 500, "El valor de inventario debe ser 500");
});

test("2. Producto en modo Caja con units_per_package > 1 (e.g. 10 unidades por caja)", () => {
  const product = {
    purchase_price: 100, // Costo total de la caja de 10 u.
    units_per_package: 10,
    stock_level: 50, // 50 unidades sueltas en stock
  };

  // Costo unitario real derivado debe ser 100 / 10 = 10
  const unitCost = getUnitCost(product);
  assert.equal(unitCost, 10, "El costo unitario derivado debe ser 10");

  // Margen con compra de caja $100 (10 u.), precio de venta unitario $15: 5 de 15.
  const margin = calculateMargin(100, 15, "package", "10");
  assert.notEqual(margin, null);
  assert.equal(margin!.costPerUnit, 10);
  assert.equal(margin!.profit, 5);
  assert.equal(Math.round(margin!.pct * 10) / 10, 33.3, "El margen real por unidad debe ser 33,3%");

  // Valor del inventario: 50 unidades * $10 (costo unitario real) = $500
  // NUNCA $100 * 50 = $5000 (que estaría inflado 10 veces)
  const totalValue = calculateInventoryValue([product]);
  assert.equal(totalValue, 500, "El valor de inventario debe ser $500, no $5000");
});

test("3. Un servicio no se inventaría: no suma al valor del inventario", () => {
  const product = { unit: "Unidad", purchase_price: 50, units_per_package: 1, stock_level: 10 };
  const service = { unit: SERVICE_UNIT, purchase_price: 0, units_per_package: 1, stock_level: 0 };

  assert.equal(isServiceItem(service), true);
  assert.equal(isServiceItem(product), false);

  // Solo el producto aporta: 10 unidades * $50.
  assert.equal(calculateInventoryValue([product, service]), 500);

  // Ni siquiera si arrastra stock y costo de antes de la regla: un servicio no
  // es mercadería, así que su "existencia" no es capital parado.
  const dirtyService = { unit: SERVICE_UNIT, purchase_price: 300, units_per_package: 1, stock_level: -2 };
  assert.equal(calculateInventoryValue([dirtyService]), 0);
});

test("4. Transición de presentación de Caja a Unidad y viceversa", () => {
  // Transición de Caja ("package") a Unidad ("unit")
  const transitionToUnit = handlePresentationModeChange("unit", "10");
  assert.equal(transitionToUnit.units_per_package, "1", "Al pasar a Unidad, units_per_package debe ser 1");
  assert.equal(transitionToUnit.package_price, "", "Al pasar a Unidad, package_price debe ser vacio");

  // Margen recalculado inmediatamente tras la transición a Unidad
  // Si compra era $100 y venta unitaria $15, ahora $100 es el costo de 1 sola unidad
  const marginAfterUnitToggle = calculateMargin(100, 15, "unit", transitionToUnit.units_per_package);
  assert.notEqual(marginAfterUnitToggle, null);
  assert.equal(marginAfterUnitToggle!.costPerUnit, 100);
  assert.equal(marginAfterUnitToggle!.profit, -85);
  assert.equal(Math.round(marginAfterUnitToggle!.pct * 10) / 10, -566.7, "Se pierde $85 de cada $15: el margen se recalcula al toque");

  // Transición de Unidad ("unit") a Caja ("package")
  const transitionToPackage = handlePresentationModeChange("package", "1");
  assert.equal(
    transitionToPackage.units_per_package,
    "",
    "Al pasar a Caja desde Unidad, units_per_package debe limpiarse para forzar confirmacion del usuario"
  );
  assert.equal(transitionToPackage.package_price, "");
});

test("5. contentPatch: 'cada unidad trae' solo vale en una unidad que no mide", () => {
  assert.deepEqual(contentPatch({ unit: "Unidad", content_qty: "900", content_unit: "ml" }), { content_qty: 900, content_unit: "ml" });
  assert.deepEqual(contentPatch({ unit: "Unidad", content_qty: "0,9", content_unit: "L" }), { content_qty: 0.9, content_unit: "L" });
  // Un kg ya mide: el contenido sobra y va en null.
  assert.deepEqual(contentPatch({ unit: "kg", content_qty: "900", content_unit: "g" }), { content_qty: null, content_unit: null });
  // Sin cantidad, con cantidad inválida o con una unidad de contenido que no mide: null.
  assert.deepEqual(contentPatch({ unit: "Unidad", content_qty: "", content_unit: "ml" }), { content_qty: null, content_unit: null });
  assert.deepEqual(contentPatch({ unit: "Unidad", content_qty: "abc", content_unit: "ml" }), { content_qty: null, content_unit: null });
  assert.deepEqual(contentPatch({ unit: "Unidad", content_qty: "12", content_unit: "Unidad" }), { content_qty: null, content_unit: null });
  assert.deepEqual(contentPatch({ unit: "Caja" }), { content_qty: null, content_unit: null });
});
