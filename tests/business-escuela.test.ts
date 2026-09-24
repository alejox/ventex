import test from "node:test";
import assert from "node:assert/strict";
import {
  REGISTER_BUSINESS_OPTIONS,
  defaultModulesForType,
  effectiveModules,
  visibleNavItems,
} from "../config/business";

// ---- Escuela de música como rubro propio (1-4) ----

test("1. El registro ofrece 'Escuela de música' como tipo de negocio", () => {
  assert.ok(REGISTER_BUSINESS_OPTIONS.some((o) => o.id === "escuela"));
});

test("2. Una escuela viene con la Escuela, Servicios y Personal preseleccionados, sin Citas", () => {
  assert.deepEqual(defaultModulesForType("escuela"), { school: true, services: true, staff: true });
});

test("3. Salón y servicios siguen sin preseleccionar la Escuela (opt-in)", () => {
  assert.equal(defaultModulesForType("salon").school, undefined);
  assert.equal(defaultModulesForType("servicios").school, undefined);
});

test("4. Sin `school` guardado, el menú no inventa la Escuela ni para una escuela", () => {
  // `school_module_enabled()` lee lo guardado: el menú no puede prometer más.
  assert.equal(effectiveModules("escuela", {}).school, undefined);
  const ids = (modules: Record<string, boolean>) => visibleNavItems("escuela", modules).map((i) => i.id);
  assert.ok(!ids({}).includes("school"));
  assert.ok(ids(defaultModulesForType("escuela")).includes("school-agenda"));
  assert.ok(!ids(defaultModulesForType("escuela")).includes("calendar"));
});
