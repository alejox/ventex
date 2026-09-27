import test from "node:test";
import assert from "node:assert/strict";
import { filterStudents } from "../services/school-people.service";
import type { SchoolStudent } from "../services/school-people.service";

// ---- filterStudents ----
//
// El texto de búsqueda SIEMPRE lee `full_name` del alumno (columna propia),
// nunca `customer_name` (la cuenta de cobro, que puede ser un padre) — es
// justo la confusión que T8 corrige.

function student(overrides: Partial<SchoolStudent> = {}): SchoolStudent {
  return {
    id: "s1",
    customer_id: "c1",
    full_name: "Ana Pérez",
    customer_name: "Juan Pérez",
    customer_phone: null,
    customer_email: null,
    instrument: "Piano",
    level: null,
    birth_date: null,
    status: "active",
    is_minor: false,
    contact_email: null,
    contact_phone: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("1. Sin filtro, devuelve solo los activos (inactivos ocultos por defecto)", () => {
  const students = [student({ id: "a", status: "active" }), student({ id: "b", status: "inactive" })];
  assert.deepEqual(filterStudents(students).map((s) => s.id), ["a"]);
});

test("2. showInactive: true revela los inactivos también", () => {
  const students = [student({ id: "a", status: "active" }), student({ id: "b", status: "inactive" })];
  assert.deepEqual(
    filterStudents(students, { showInactive: true }).map((s) => s.id).sort(),
    ["a", "b"],
  );
});

test("3. La búsqueda usa el nombre PROPIO del alumno, no el del cliente", () => {
  const students = [
    student({ id: "a", full_name: "Ana Pérez", customer_name: "Juan Pérez" }),
    student({ id: "b", full_name: "Luis Gómez", customer_name: "Ana Pérez" }),
  ];
  assert.deepEqual(filterStudents(students, { query: "ana" }).map((s) => s.id), ["a"]);
});

test("4. La búsqueda también matchea por especialidad", () => {
  const students = [student({ id: "a", instrument: "Guitarra" }), student({ id: "b", instrument: "Piano" })];
  assert.deepEqual(filterStudents(students, { query: "guitarra" }).map((s) => s.id), ["a"]);
});

test("5. Búsqueda insensible a mayúsculas y espacios", () => {
  const students = [student({ id: "a", full_name: "Ana Pérez" })];
  assert.deepEqual(filterStudents(students, { query: "  ANA  " }).map((s) => s.id), ["a"]);
});

test("6. Query vacía no filtra por texto", () => {
  const students = [student({ id: "a" }), student({ id: "b", full_name: "Otro" })];
  assert.equal(filterStudents(students, { query: "" }).length, 2);
});

test("7. Query + showInactive se combinan (AND)", () => {
  const students = [
    student({ id: "a", full_name: "Ana Pérez", status: "inactive" }),
    student({ id: "b", full_name: "Ana Gómez", status: "active" }),
  ];
  assert.deepEqual(
    filterStudents(students, { query: "ana", showInactive: true }).map((s) => s.id).sort(),
    ["a", "b"],
  );
  assert.deepEqual(
    filterStudents(students, { query: "ana", showInactive: false }).map((s) => s.id),
    ["b"],
  );
});
