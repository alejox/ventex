import test from "node:test";
import assert from "node:assert/strict";
import { cleanModulesForType, modulesForSwitch, navChangeOnSwitch } from "../lib/business-change";
import { defaultModulesForType, visibleNavItems } from "../config/business";

test("Pasar de salón a tienda avisa que desaparecen Calendario y Promociones", () => {
  const change = navChangeOnSwitch(
    { businessType: "salon", modules: defaultModulesForType("salon") },
    { businessType: "tienda", modules: cleanModulesForType({}, "tienda") },
  );
  assert.ok(change.removed.includes("Calendario"), change.removed.join(", "));
  assert.ok(change.removed.includes("Promociones"), change.removed.join(", "));
  // Lo que queda en los dos no aparece en ninguna lista.
  assert.ok(!change.removed.includes("Punto de Venta"));
  assert.ok(!change.added.includes("Punto de Venta"));
});

test("El aviso sale del mismo cálculo que el sidebar", () => {
  const from = { businessType: "tienda" as const, modules: {} };
  const to = { businessType: "lavaautos" as const, modules: defaultModulesForType("lavaautos") };
  const change = navChangeOnSwitch(from, to);
  const before = new Set(visibleNavItems(from.businessType, from.modules).map((i) => i.name));
  const after = new Set(visibleNavItems(to.businessType, to.modules).map((i) => i.name));
  assert.deepEqual(change.added, [...after].filter((n) => !before.has(n)));
  assert.deepEqual(change.removed, [...before].filter((n) => !after.has(n)));
  assert.ok(change.added.length > 0);
});

test("Mismo rubro y mismos módulos: no cambia nada", () => {
  const m = defaultModulesForType("salon");
  assert.deepEqual(
    navChangeOnSwitch({ businessType: "salon", modules: m }, { businessType: "salon", modules: m }),
    { added: [], removed: [] },
  );
});

test("Cambiar de rubro preselecciona los módulos del nuevo y respeta lo apagado a mano", () => {
  const next = modulesForSwitch({ appointments: true, inventory: false }, "lavaautos");
  assert.equal(next.inventory, false, "inventario lo había apagado el dueño");
  assert.equal(next.vehicles, true, "vehículos es nuevo y viene preseleccionado");
  assert.equal(next.appointments, true);
});

test("Lo que se guarda son solo los módulos del rubro, con valor explícito", () => {
  const cleaned = cleanModulesForType({ appointments: true, vehicles: true }, "salon");
  assert.equal("vehicles" in cleaned, false);
  assert.equal(cleaned.appointments, true);
  assert.equal(cleaned.services, false);
});
