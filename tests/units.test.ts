import test from "node:test";
import assert from "node:assert/strict";
import {
  areUnitsCompatible,
  compatibleUnits,
  consumedQty,
  convertQty,
  losesPrecision,
  roundStock,
  unitFactor,
} from "../lib/units";

test("factores dentro de una misma dimensión (espejo de public.unit_factor)", () => {
  assert.equal(unitFactor("g", "kg"), 0.001);
  assert.equal(unitFactor("kg", "g"), 1000);
  assert.equal(unitFactor("ml", "L"), 0.001);
  assert.equal(unitFactor("L", "ml"), 1000);
  assert.equal(unitFactor("cm", "m"), 0.01);
  assert.equal(unitFactor("lb", "g"), 453.59237);
  assert.equal(unitFactor("Unidad", "Unidad"), 1);
});

test("unidades de distinta dimensión o sin dimensión no se convierten", () => {
  assert.equal(unitFactor("kg", "L"), null);
  assert.equal(unitFactor("Unidad", "kg"), null);
  assert.equal(unitFactor("Caja", "Unidad"), null);
  assert.equal(unitFactor(null, "kg"), null);
  assert.equal(areUnitsCompatible("ml", "L"), true);
  assert.equal(areUnitsCompatible("ml", "kg"), false);
});

test("convertQty: 20 g de un café que se maneja en kg son 0,02 kg", () => {
  assert.equal(convertQty(20, "g", "kg"), 0.02);
  assert.equal(convertQty(300, "ml", "L"), 0.3);
  assert.equal(convertQty(1, "kg", "L"), null);
});

test("el selector ofrece primero la unidad del insumo y luego sus compatibles", () => {
  assert.deepEqual(compatibleUnits("kg"), ["kg", "g", "lb"]);
  assert.deepEqual(compatibleUnits("L"), ["L", "ml"]);
  assert.deepEqual(compatibleUnits("Unidad"), ["Unidad"]);
  assert.deepEqual(compatibleUnits("Pack"), ["Pack"]);
});

test("roundStock redondea como Postgres: 3 decimales, mitad lejos del cero", () => {
  assert.equal(roundStock(0.0005), 0.001);
  assert.equal(roundStock(-0.0005), -0.001);
  assert.equal(roundStock(1.0005), 1.001);
  assert.equal(roundStock(0.0004), 0);
  assert.equal(roundStock(2.5), 2.5);
});

test("consumedQty: latte ×2 con 20 g de café (insumo en kg) descuenta 0,04", () => {
  assert.equal(consumedQty(20, "g", "kg", 2), 0.04);
  assert.equal(consumedQty(60, "ml", "L", 1), 0.06);
  assert.equal(consumedQty(1, "Unidad", "Unidad", 3), 3);
  assert.equal(consumedQty(1, "kg", "Unidad", 1), null);
});

test("losesPrecision avisa cuando 3 decimales no alcanzan para la cantidad por unidad", () => {
  assert.equal(losesPrecision(0.5, "g", "kg"), true); // 0,0005 kg
  assert.equal(losesPrecision(20, "g", "kg"), false); // 0,02 kg
  assert.equal(losesPrecision(0.5, "g", "g"), false);
  assert.equal(losesPrecision(1, "kg", "Unidad"), false); // incompatibles: lo marca otra validación
});
