import test from "node:test";
import assert from "node:assert/strict";
import {
  movementUnits,
  applyMovement,
  stockUnitsOf,
  formatQty,
  quantityIsValid,
} from "../lib/stock";

test("1. Se puede mover media unidad de lo que se vende por peso", () => {
  // 1,5 kg de papa. Hasta acá la cantidad tenía que ser un entero, así que
  // vender por peso obligaba a inventar una unidad ('malla de 5 kg') o a
  // esconder el peso dentro del precio.
  assert.equal(movementUnits(1.5, "unit", 1), 1.5);
  assert.equal(movementUnits(0.25, "unit", 1), 0.25);
});

test("2. Una cantidad que no es un número positivo sigue sin mover nada", () => {
  assert.equal(movementUnits(0, "unit", 1), 0);
  assert.equal(movementUnits(-1.5, "unit", 1), 0);
  assert.equal(movementUnits(NaN, "unit", 1), 0);
});

test("3. Cajas y sueltas se suman con decimales", () => {
  assert.equal(stockUnitsOf("2", "20.5", "24"), 68.5);
  assert.equal(stockUnitsOf("", "0.75", "1"), 0.75);
});

test("4. La suma no arrastra basura de coma flotante", () => {
  // 0.1 + 0.2 = 0.30000000000000004 en binario. Escrito en la base como stock
  // eso es un número que nadie escribió y que no se puede volver a igualar.
  assert.equal(stockUnitsOf("", "0.1", "1") + stockUnitsOf("", "0.2", "1"), 0.30000000000000004);
  assert.equal(applyMovement(0.1, "in", 0.2), 0.3);
  assert.equal(applyMovement(10, "out", 2.5), 7.5);
});

test("5. Solo lo que se mide admite fracciones", () => {
  // "Media unidad" de un televisor no es una venta, es un error de tipeo. El
  // corte no es una preferencia: sale de la unidad de medida del producto.
  assert.equal(quantityIsValid(1.5, true), true);
  assert.equal(quantityIsValid(1.5, false), false);
  assert.equal(quantityIsValid(2, false), true);
  assert.equal(quantityIsValid(0, true), false, "cero no es una cantidad que vender");
  assert.equal(quantityIsValid(-1, true), false);
  assert.equal(quantityIsValid(NaN, true), false);
});

test("6. La cantidad se muestra sin ceros de relleno", () => {
  // `numeric(12,3)` devuelve "2.000". Mostrar "2.000 unidades" en la vitrina de
  // un producto que se vende de a uno se lee como dos mil.
  assert.equal(formatQty(2), "2");
  assert.equal(formatQty(1.5), "1.5");
  assert.equal(formatQty(1.5), formatQty(1.500));
  assert.equal(formatQty(0.125), "0.125");
  assert.equal(formatQty(0), "0");
});

test("7. Más de tres decimales se redondean, no se arrastran", () => {
  // La base guarda `numeric(12,3)`: mostrar más precisión de la que se guarda
  // es prometer un número que la próxima lectura va a desmentir.
  assert.equal(formatQty(1.23456), "1.235");
  assert.equal(movementUnits(1.23456, "unit", 1), 1.235);
});
