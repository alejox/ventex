import test from "node:test";
import assert from "node:assert/strict";
import { catalogOptions, catalogLabel } from "../services/school-settings.service";

// ---- catalogOptions ----

test("1. Sin valor elegido, devuelve el catálogo tal cual", () => {
  assert.deepEqual(catalogOptions(["Piano", "Guitarra"], []), ["Piano", "Guitarra"]);
});

test("2. Un valor ya elegido que está en el catálogo no se duplica", () => {
  assert.deepEqual(catalogOptions(["Piano", "Guitarra"], ["Piano"]), ["Piano", "Guitarra"]);
});

test("3. Un valor legado (fuera del catálogo) se agrega al final, sin perderse", () => {
  assert.deepEqual(catalogOptions(["Piano", "Guitarra"], ["Violín"]), ["Piano", "Guitarra", "Violín"]);
});

test("4. Varios valores legados no se duplican entre sí", () => {
  assert.deepEqual(
    catalogOptions(["Piano"], ["Violín", "Violín", "Canto"]),
    ["Piano", "Violín", "Canto"],
  );
});

test("5. Valores vacíos o nulos se ignoran", () => {
  assert.deepEqual(catalogOptions(["Piano"], ["", null, undefined, "  "]), ["Piano"]);
});

test("6. Catálogo vacío con un valor legado lo mantiene seleccionable", () => {
  assert.deepEqual(catalogOptions([], ["Piano"]), ["Piano"]);
});

// ---- catalogLabel ----

test("7. Una especialidad del catálogo se etiqueta sin marca", () => {
  assert.equal(catalogLabel("Piano", ["Piano", "Guitarra"]), "Piano");
});

test("8. Una especialidad fuera del catálogo se marca como tal", () => {
  assert.equal(catalogLabel("Violín", ["Piano", "Guitarra"]), "Violín (fuera del catálogo)");
});
