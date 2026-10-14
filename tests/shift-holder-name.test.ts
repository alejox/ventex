import test from "node:test";
import assert from "node:assert/strict";
import { shiftHolderName } from "../services/shifts.service";

const workers = [
  { id: "w1", full_name: "Ana" },
  { id: "a1", full_name: "Admin Luis" },
  { id: "w2", full_name: null },
];
const owner = { id: "own", workspaceId: "own", fullName: "Carla Dueña" };
const admin = { id: "a1", workspaceId: "own", fullName: "Admin Luis" };

test("un trabajador o admin con cuenta sale con su nombre", () => {
  assert.equal(shiftHolderName("w1", workers, owner), "Ana");
  assert.equal(shiftHolderName("a1", workers, owner), "Admin Luis");
});

test("el turno del dueño sale con su nombre, no como Empleado", () => {
  assert.equal(shiftHolderName("own", workers, owner), "Carla Dueña");
  // Un admin mirando la caja del dueño no tiene su nombre a mano.
  assert.equal(shiftHolderName("own", workers, admin), "Dueño del negocio");
});

test("quien mira su propio turno se ve con su nombre aunque no esté en la lista", () => {
  assert.equal(shiftHolderName("a1", [], admin), "Admin Luis");
});

test("sin dato, Empleado", () => {
  assert.equal(shiftHolderName("w2", workers, owner), "Empleado");
  assert.equal(shiftHolderName("zz", workers, null), "Empleado");
});
