import test from "node:test";
import assert from "node:assert/strict";
import { parseQuantityDraft } from "../lib/stock";

test("1. Un borrador vacío no es una cantidad, pero tampoco un error", () => {
  // Borrar el campo para escribir otro número es el paso NORMAL de editar.
  // Si el vacío se rechaza como inválido, el input controlado repone el valor
  // anterior y el dígito nuevo se pega al viejo: 1 + "2" = 12.
  assert.equal(parseQuantityDraft("", true), null);
  assert.equal(parseQuantityDraft("   ", false), null);
});

test("2. Un número entero se acepta en cualquier producto", () => {
  assert.equal(parseQuantityDraft("2", false), 2);
  assert.equal(parseQuantityDraft("12", true), 12);
});

test("3. Los decimales siguen atados a la unidad de medida", () => {
  // Misma regla que quantityIsValid: media unidad de un televisor no es una
  // venta. El corte lo decide el producto, no el campo de texto.
  assert.equal(parseQuantityDraft("1.5", true), 1.5);
  assert.equal(parseQuantityDraft("1.5", false), null);
});

test("4. La coma es el separador decimal de quien escribe acá", () => {
  // El teclado de Colombia escribe 1,5 — no 1.5. parseFloat lee "1,5" como 1
  // y cobraría un kilo entero de papa por medio kilo.
  assert.equal(parseQuantityDraft("1,5", true), 1.5);
  assert.equal(parseQuantityDraft("0,25", true), 0.25);
  assert.equal(parseQuantityDraft("1,5", false), null);
});

test("5. Cero, negativos y basura no son cantidades", () => {
  assert.equal(parseQuantityDraft("0", true), null);
  assert.equal(parseQuantityDraft("-3", false), null);
  assert.equal(parseQuantityDraft("abc", true), null);
  assert.equal(parseQuantityDraft("1e", true), null);
});

test("6. La precisión es la de la base, no la del teclado", () => {
  // numeric(12,3): lo que no entra en la columna no puede quedar en el carrito.
  assert.equal(parseQuantityDraft("1.2345", true), 1.235);
  assert.equal(parseQuantityDraft("0.0004", true), null);
});
