import test from "node:test";
import assert from "node:assert/strict";
import { movementUnits, applyMovement, stockUnitsOf } from "../lib/stock";

test("1. En modo unidad la cantidad NO se multiplica por las unidades por caja", () => {
  // El caso que no se podía expresar: un producto que viene de a 24, del que
  // entran 5 unidades sueltas. El RPC multiplicaba siempre, así que esas 5
  // unidades entraban como 120 y el inventario quedaba inflado 24 veces.
  assert.equal(movementUnits(5, "unit", 24), 5);
  assert.equal(movementUnits(1, "unit", 60), 1);
});

test("2. En modo caja la cantidad se multiplica por las unidades por caja", () => {
  assert.equal(movementUnits(2, "package", 24), 48);
  assert.equal(movementUnits(3, "package", 1), 3, "una caja de 1 es una unidad");
});

test("3. Unidades por caja inválidas caen a 1, nunca a 0", () => {
  // Un `units_per_package` en 0 o nulo multiplicaría el movimiento hasta
  // anularlo: el usuario cargaría 10 cajas y no entraría nada.
  assert.equal(movementUnits(10, "package", 0), 10);
  assert.equal(movementUnits(10, "package", null), 10);
  assert.equal(movementUnits(10, "package", undefined), 10);
  assert.equal(movementUnits(10, "package", NaN), 10);
});

test("4. Una cantidad que no es un número positivo no mueve nada", () => {
  // El decimal SÍ mueve: lo que se vende por peso se carga por peso. Quién
  // puede usarlo lo decide la unidad de medida del producto —ver
  // `quantityIsValid` en tests/fractional-quantity.test.ts—, no esta función.
  assert.equal(movementUnits(0, "unit", 24), 0);
  assert.equal(movementUnits(-3, "unit", 24), 0);
  assert.equal(movementUnits(NaN, "package", 24), 0);
  assert.equal(movementUnits(2.5, "unit", 24), 2.5);
});

test("5. Cajas y unidades sueltas se suman: 2 cajas de 24 y 20 sueltas son 68", () => {
  // El caso real: llega mercadería en cajas completas MÁS un resto suelto, y
  // las dos mitades tienen que poder cargarse en el mismo ingreso.
  assert.equal(stockUnitsOf("2", "20", "24"), 68);
  assert.equal(stockUnitsOf("1", "0", "24"), 24, "solo cajas");
  assert.equal(stockUnitsOf("0", "23", "24"), 23, "solo sueltas: la caja incompleta");
});

test("6. La definición del empaque no aporta stock por sí sola", () => {
  // "Unidades por caja" describe el EMPAQUE, no la mercadería. Sin cajas
  // cargadas, un producto definido como caja de 24 al que se le cargan 23
  // unidades tiene 23, no 47.
  assert.equal(stockUnitsOf("", "23", "24"), 23);
  assert.equal(stockUnitsOf("", "", "24"), 0);
});

test("7. Los vacíos y la basura valen cero, no NaN", () => {
  // `parseInt("")` es NaN y NaN escrito en `stock_level` rompe el alta entera.
  assert.equal(stockUnitsOf("", "", ""), 0);
  assert.equal(stockUnitsOf("abc", "x", "24"), 0);
  assert.equal(stockUnitsOf("-4", "-9", "24"), 0);
});

test("8. Sin unidades por caja definidas, una caja vale una unidad", () => {
  // Al cambiar a presentación caja el campo arranca vacío. Multiplicar por 0
  // dejaría el ingreso en cero sin decir por qué.
  assert.equal(stockUnitsOf("3", "0", ""), 3);
  assert.equal(stockUnitsOf("3", "0", "0"), 3);
});

test("9. La entrada suma y la salida resta, en unidades sueltas", () => {
  assert.equal(applyMovement(100, "in", 68), 168);
  assert.equal(applyMovement(100, "out", 48), 52);
});

test("10. 'Ajustar a' fija el stock absoluto, no lo suma", () => {
  assert.equal(applyMovement(100, "adjust", 68), 68);
  assert.equal(applyMovement(100, "adjust", 0), 0, "cero es agotado, no 'sin cambio'");
});

test("11. La salida en exceso devuelve el negativo, no lo recorta", () => {
  // La base rechaza el stock negativo (STOCK_INSUFICIENTE). Si esta función
  // recortara a cero, la UI no podría avisar antes de enviar y el comerciante
  // se comería el error del servidor.
  assert.equal(applyMovement(10, "out", 24), -14);
});
