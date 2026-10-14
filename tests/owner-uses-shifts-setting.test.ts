import test from "node:test";
import assert from "node:assert/strict";
import { mapSettings } from "../services/settings.service";

test("owner_uses_shifts arranca apagado si la columna todavía no existe", () => {
  // Antes de aplicar la migración, `select *` no trae la clave.
  assert.equal(mapSettings({ id: "s1" }).owner_uses_shifts, false);
  assert.equal(mapSettings({ id: "s1", owner_uses_shifts: null }).owner_uses_shifts, false);
});

test("owner_uses_shifts respeta lo guardado", () => {
  assert.equal(mapSettings({ id: "s1", owner_uses_shifts: true }).owner_uses_shifts, true);
  assert.equal(mapSettings({ id: "s1", owner_uses_shifts: false }).owner_uses_shifts, false);
});
