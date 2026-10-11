import test from "node:test";
import assert from "node:assert/strict";
import {
  areUnitsCompatible,
  compatibleUnits,
  consumedQty,
  contentLabel,
  convertQty,
  isMeasureUnit,
  losesPrecision,
  productUnitFactor,
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

const bolsaLeche = { unit: "Unidad", content_qty: 900, content_unit: "ml" };
const bultoHarina = { unit: "Unidad", content_qty: 50, content_unit: "kg" };

test("presentación: una bolsa de 900 ml se puede medir en ml y en L (espejo de product_unit_factor)", () => {
  assert.equal(productUnitFactor("Unidad", bolsaLeche), 1);
  assert.equal(productUnitFactor("ml", bolsaLeche), 1 / 900);
  assert.equal(productUnitFactor("L", bolsaLeche), 1000 / 900);
  assert.equal(productUnitFactor("g", bolsaLeche), null);
  assert.equal(productUnitFactor("g", bultoHarina), 1 / 50000);
  // Sin contenido, Unidad solo es Unidad.
  assert.equal(productUnitFactor("ml", "Unidad"), null);
  assert.equal(productUnitFactor("ml", { unit: "Unidad" }), null);
  // Un producto que ya mide ignora el contenido (la base lo deja en null).
  assert.equal(productUnitFactor("g", { unit: "kg", content_qty: 900, content_unit: "ml" }), 0.001);
  assert.equal(productUnitFactor("ml", { unit: "kg", content_qty: 900, content_unit: "ml" }), null);
  assert.equal(areUnitsCompatible("ml", bolsaLeche), true);
});

test("convertQty y consumedQty con contenido: 150 ml de leche son 0,167 bolsas", () => {
  assert.equal(convertQty(150, "ml", bolsaLeche), 150 / 900);
  assert.equal(consumedQty(150, "ml", bolsaLeche, 1), 0.167);
  assert.equal(consumedQty(150, "ml", bolsaLeche, 6), 1);
  assert.equal(consumedQty(900, "ml", bolsaLeche, 1), 1);
  assert.equal(consumedQty(2, "Unidad", bolsaLeche, 1), 2);
});

test("compatibleUnits con contenido ofrece la unidad y la dimensión del contenido", () => {
  assert.deepEqual(compatibleUnits(bolsaLeche), ["Unidad", "ml", "L"]);
  assert.deepEqual(compatibleUnits(bultoHarina), ["Unidad", "g", "kg", "lb"]);
  assert.deepEqual(compatibleUnits({ unit: "Unidad" }), ["Unidad"]);
  assert.deepEqual(compatibleUnits({ unit: "Caja", content_qty: 0, content_unit: "ml" }), ["Caja"]);
});

test("losesPrecision es relativo: la bolsa de 900 ml no avisa, el medio gramo en kg sí", () => {
  assert.equal(losesPrecision(150, "ml", bolsaLeche), false); // 0,1667 → 0,167 (0,2 %)
  assert.equal(losesPrecision(0.3, "ml", bolsaLeche), true); // 0,00033 → 0
  assert.equal(losesPrecision(50, "ml", bolsaLeche), false); // 0,05556 → 0,056 (0,8 %)
  assert.equal(losesPrecision(5, "ml", bolsaLeche), true); // 0,00556 → 0,006 (8 %): un chorrito en bolsa se deforma
});

test("isMeasureUnit y contentLabel", () => {
  assert.equal(isMeasureUnit("kg"), true);
  assert.equal(isMeasureUnit("Unidad"), false);
  assert.equal(isMeasureUnit(null), false);
  assert.equal(contentLabel(bolsaLeche), "900 ml c/u");
  assert.equal(contentLabel({ unit: "Unidad", content_qty: 0.9, content_unit: "L" }), "0,9 L c/u");
  assert.equal(contentLabel({ unit: "Unidad" }), null);
  assert.equal(contentLabel({ unit: "kg", content_qty: 1, content_unit: "L" }), null);
});
