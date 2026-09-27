import test from "node:test";
import assert from "node:assert/strict";
import { addTags, cleanTag, TAG_MAX_LENGTH } from "../lib/tags";

// ---- addTags ----
//
// Los catálogos de Académico (especialidades, niveles, salas) se cargan como
// chips. Esta función decide qué entra: la persona no tiene que saber que
// antes había que separar con comas.

test("1. agrega una etiqueta a una lista vacía", () => {
  assert.deepEqual(addTags([], "Piano"), { values: ["Piano"], duplicates: [] });
});

test("2. lo pegado con comas se parte en varias etiquetas", () => {
  assert.deepEqual(addTags([], "Guitarra, Piano,Violín").values, ["Guitarra", "Piano", "Violín"]);
});

test("3. también parte por punto y coma y salto de línea", () => {
  assert.deepEqual(addTags([], "Sala 1;Sala 2\nSala 3").values, ["Sala 1", "Sala 2", "Sala 3"]);
});

test("4. ignora pedazos vacíos y espacios sobrantes", () => {
  assert.deepEqual(addTags([], " , Canto  lírico ,, ").values, ["Canto lírico"]);
});

test("5. un repetido no entra y se informa, sin distinguir mayúsculas", () => {
  assert.deepEqual(addTags(["Piano"], "piano"), { values: ["Piano"], duplicates: ["piano"] });
});

test("6. tampoco distingue tildes: Violin es Violín", () => {
  assert.deepEqual(addTags(["Violín"], "Violin").duplicates, ["Violin"]);
});

test("7. repetidos dentro del mismo pegado entran una sola vez", () => {
  const r = addTags([], "Bajo, bajo, BAJO");
  assert.deepEqual(r.values, ["Bajo"]);
  assert.deepEqual(r.duplicates, ["bajo", "BAJO"]);
});

test("8. no toca la lista original", () => {
  const current = ["Piano"];
  addTags(current, "Guitarra");
  assert.deepEqual(current, ["Piano"]);
});

test("9. cleanTag recorta al largo máximo", () => {
  assert.equal(cleanTag("x".repeat(TAG_MAX_LENGTH + 20)).length, TAG_MAX_LENGTH);
});
