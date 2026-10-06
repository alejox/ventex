import test from "node:test";
import assert from "node:assert/strict";
import { enterPick, highlightFor, nextHighlight } from "../lib/pos-search-nav";

test("↓ arranca en el primero y da la vuelta al final", () => {
  assert.equal(nextHighlight(-1, "ArrowDown", 3), 0);
  assert.equal(nextHighlight(0, "ArrowDown", 3), 1);
  assert.equal(nextHighlight(2, "ArrowDown", 3), 0);
});

test("↑ arranca en el último y da la vuelta al principio", () => {
  assert.equal(nextHighlight(-1, "ArrowUp", 3), 2);
  assert.equal(nextHighlight(1, "ArrowUp", 3), 0);
  assert.equal(nextHighlight(0, "ArrowUp", 3), 2);
});

test("sin resultados no hay resaltado", () => {
  assert.equal(nextHighlight(0, "ArrowDown", 0), -1);
});

test("el resaltado se suelta al cambiar la búsqueda (p. ej. una lectura del escáner)", () => {
  const state = { index: 1, forQuery: "coca" };
  assert.equal(highlightFor(state, "coca", 3), 1);
  assert.equal(highlightFor(state, "coca-cola", 3), -1);
  assert.equal(highlightFor(state, "coca", 1), -1);
  assert.equal(highlightFor(null, "coca", 3), -1);
});

test("Enter: el resaltado manda; si no hay, solo un resultado único", () => {
  assert.equal(enterPick(["a", "b"], 1), "b");
  assert.equal(enterPick(["a"], -1), "a");
  assert.equal(enterPick(["a", "b"], -1), null);
  assert.equal(enterPick([], -1), null);
});
