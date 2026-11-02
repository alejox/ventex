import assert from "node:assert/strict";
import test from "node:test";
import { UNASSIGNED_COLUMN, groupByColumn, staffColumnsFor, staffInitials } from "../lib/staff-columns";

const ana = { id: "ana", full_name: "Ana Pérez", photo_url: null };
const beto = { id: "beto", full_name: "Beto", photo_url: "https://x/beto.jpg" };
const appt = (id: string, staff_id: string | null, name?: string) => ({ id, staff_id, staff: name ? { full_name: name } : null });

test("todas las personas: una columna por persona, en el orden del equipo", () => {
  const columns = staffColumnsFor([ana, beto], [appt("1", "beto")], "all");
  assert.deepEqual(columns.map((c) => c.key), ["ana", "beto"]);
  assert.equal(columns[1].photoUrl, "https://x/beto.jpg");
});

test("'Sin asignar' aparece solo si ese día hay citas sin persona", () => {
  assert.deepEqual(staffColumnsFor([ana], [appt("1", "ana")], "all").map((c) => c.key), ["ana"]);
  const withUnassigned = staffColumnsFor([ana], [appt("1", null)], "all");
  assert.deepEqual(withUnassigned.map((c) => c.key), ["ana", UNASSIGNED_COLUMN]);
  assert.equal(withUnassigned[1].staffId, null);
  assert.equal(withUnassigned[1].name, "Sin asignar");
});

test("una cita de alguien que ya no está activo no desaparece: tiene su columna", () => {
  const columns = staffColumnsFor([ana], [appt("1", "old", "Carla")], "all");
  assert.deepEqual(columns.map((c) => [c.key, c.name]), [["ana", "Ana Pérez"], ["old", "Carla"]]);
});

test("filtro por persona: solo su columna", () => {
  assert.deepEqual(staffColumnsFor([ana, beto], [], "beto").map((c) => c.key), ["beto"]);
});

test("filtro 'Sin asignar': solo esa columna, aunque esté vacía (se puede crear ahí)", () => {
  assert.deepEqual(staffColumnsFor([ana, beto], [], "unassigned").map((c) => c.key), [UNASSIGNED_COLUMN]);
});

test("sin equipo no hay columnas por persona: la grilla vuelve a la de un día", () => {
  assert.deepEqual(staffColumnsFor([], [appt("1", null)], "all"), []);
});

test("agrupa cada cita en la columna de su persona", () => {
  const columns = staffColumnsFor([ana, beto], [appt("1", "ana"), appt("2", null), appt("3", "ana")], "all");
  const grouped = groupByColumn([appt("1", "ana"), appt("2", null), appt("3", "ana")], columns);
  assert.deepEqual(grouped.ana.map((a) => a.id), ["1", "3"]);
  assert.deepEqual(grouped.beto, []);
  assert.deepEqual(grouped[UNASSIGNED_COLUMN].map((a) => a.id), ["2"]);
});

test("una cita cuya columna no se muestra no se agrupa en otra", () => {
  const grouped = groupByColumn([appt("1", "ana"), appt("2", "beto")], staffColumnsFor([ana, beto], [], "beto"));
  assert.deepEqual(Object.keys(grouped), ["beto"]);
  assert.deepEqual(grouped.beto.map((a) => a.id), ["2"]);
});

test("iniciales: dos letras del nombre y apellido", () => {
  assert.equal(staffInitials("Ana Pérez"), "AP");
  assert.equal(staffInitials("  beto "), "B");
  assert.equal(staffInitials("María José de la Cruz"), "MC");
  assert.equal(staffInitials(""), "?");
});
