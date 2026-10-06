import test from "node:test";
import assert from "node:assert/strict";
import { plateKey, vehicleMatches } from "../services/vehicles.service";

const v = {
  plate: "ABC123",
  make_model: "Mazda 3 2021",
  color: "Gris",
  customers: { full_name: "José Pérez" },
};

test("plateKey ignora guiones, espacios y mayúsculas", () => {
  assert.equal(plateKey("abc-123"), "ABC123");
  assert.equal(plateKey(" abc 123 "), "ABC123");
});

test("vehicleMatches encuentra la placa escrita de otra forma", () => {
  assert.ok(vehicleMatches(v, "abc-123"));
  assert.ok(vehicleMatches(v, "bc 12"));
});

test("vehicleMatches busca por dueño (sin tildes), modelo y color", () => {
  assert.ok(vehicleMatches(v, "jose"));
  assert.ok(vehicleMatches(v, "mazda"));
  assert.ok(vehicleMatches(v, "gris"));
  assert.equal(vehicleMatches(v, "toyota"), false);
});

test("vehicleMatches con búsqueda vacía deja pasar todo y tolera dueño nulo", () => {
  assert.ok(vehicleMatches(v, "  "));
  assert.equal(vehicleMatches({ ...v, customers: null, make_model: null, color: null }, "ana"), false);
});
