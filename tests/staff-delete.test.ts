import test from "node:test";
import assert from "node:assert/strict";
import { staffDeleteErrorMessage } from "../lib/staff-delete";

const fk = (table: string) => ({
  code: "23503",
  message: `update or delete on table "staff" violates foreign key constraint "${table}_staff_id_fkey" on table "${table}"`,
});

test("eliminar personal con acceso al sistema explica el bloqueo y sugiere inactivo", () => {
  const msg = staffDeleteErrorMessage(fk("workspace_memberships"));
  assert.match(msg, /acceso al sistema/);
  assert.match(msg, /inactiv/i);
});

test("eliminar personal con comisiones pagadas explica el bloqueo", () => {
  assert.match(staffDeleteErrorMessage(fk("commission_settlements")), /comisiones pagadas/);
});

test("eliminar personal con perfil docente explica el bloqueo", () => {
  assert.match(staffDeleteErrorMessage(fk("school_teacher_profiles")), /perfil docente/);
});

test("otra referencia desconocida igual da un mensaje en español con la salida", () => {
  const msg = staffDeleteErrorMessage(fk("otra_tabla"));
  assert.doesNotMatch(msg, /foreign key/);
  assert.match(msg, /inactiv/i);
});

test("un error que no es de referencia pasa por el traductor genérico", () => {
  assert.equal(staffDeleteErrorMessage("Sin conexión"), "Sin conexión");
});
