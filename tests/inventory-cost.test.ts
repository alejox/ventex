import test from "node:test";
import assert from "node:assert/strict";
import {
  getUnitCost,
  calculateInventoryValue,
  calculateMargin,
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

  // Margen con costo $50 y venta $75 en modo unidad
  const margin = calculateMargin(50, 75, "unit", "1");
  assert.notEqual(margin, null);
  assert.equal(margin!.costPerUnit, 50);
  assert.equal(margin!.pct, 50, "El margen debe ser 50%");

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

  // Margen con compra de caja $100 (10 u.), precio de venta unitario $15
  const margin = calculateMargin(100, 15, "package", "10");
  assert.notEqual(margin, null);
  assert.equal(margin!.costPerUnit, 10);
  assert.equal(margin!.pct, 50, "El margen real por unidad debe ser 50%");

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
  assert.equal(marginAfterUnitToggle!.pct, -85, "El margen inmediatamente se recalcula a -85%");

  // Transición de Unidad ("unit") a Caja ("package")
  const transitionToPackage = handlePresentationModeChange("package", "1");
  assert.equal(
    transitionToPackage.units_per_package,
    "",
    "Al pasar a Caja desde Unidad, units_per_package debe limpiarse para forzar confirmacion del usuario"
  );
  assert.equal(transitionToPackage.package_price, "");
});
