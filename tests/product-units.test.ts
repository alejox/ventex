import assert from "node:assert/strict";
import test from "node:test";
import { parseQuantityUnit } from "../lib/autofill";
import { MEASURE_UNITS, PRODUCT_UNITS } from "../lib/units";

test("every measure unit can be chosen for a product", () => {
  for (const unit of MEASURE_UNITS) assert.ok(PRODUCT_UNITS.includes(unit), unit);
});

test("units read from a barcode are always selectable product units", () => {
  // The quick-add modal mapped "kg" to "Kg", which is not a measure unit:
  // those products could not be sold in fractions nor converted in recipes.
  for (const raw of ["1 kg", "500 g", "1 lb", "12 oz", "1 L", "250 ml", "33 cl", "2 m", "30 cm", "1 unidad", "1 docena", "1 pack", "1 caja"]) {
    const unit = parseQuantityUnit(raw);
    assert.ok(unit && PRODUCT_UNITS.includes(unit), `${raw} → ${unit}`);
  }
});

test("there is no capitalized or spelled-out variant of a measure unit", () => {
  for (const legacy of ["Kg", "Litro", "Gramo", "Lb"]) assert.ok(!PRODUCT_UNITS.includes(legacy), legacy);
});
