import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULES_BY_TYPE,
  defaultModulesForType,
  effectiveModules,
  groupNavItems,
  permissionTemplatesFor,
  permissionsForBusiness,
  visibleNavItems,
  workerNavItems,
  type BusinessType,
} from "../config/business";

const TYPES: BusinessType[] = ["salon", "tienda", "lavaautos", "servicios", "escuela"];

test("Recetas y producción se ofrece en TODO rubro", () => {
  for (const type of TYPES) {
    assert.ok(MODULES_BY_TYPE[type].some((m) => m.id === "production"), `falta en ${type}`);
  }
});

test("es opt-in: ningún rubro lo preselecciona ni lo enciende solo", () => {
  for (const type of TYPES) {
    assert.equal(defaultModulesForType(type).production, undefined, type);
    assert.equal(effectiveModules(type, {}).production, undefined, type);
  }
});

test("el ítem Producción aparece solo con el módulo encendido, dentro de Inventario", () => {
  const ids = (type: BusinessType, modules: Record<string, boolean>) =>
    visibleNavItems(type, modules).map((i) => i.id);
  assert.ok(!ids("tienda", {}).includes("production"));
  assert.ok(ids("tienda", { production: true }).includes("production"));
  assert.ok(ids("salon", { production: true }).includes("production"));
  const groups = groupNavItems(visibleNavItems("tienda", { production: true }));
  const inventario = groups.find((g) => g.id === "inventario");
  assert.deepEqual(inventario?.items.slice(0, 2).map((i) => i.id), ["inventory", "production"]);
});

test("el permiso `production` se ofrece solo si el negocio tiene el módulo", () => {
  assert.ok(!permissionsForBusiness("tienda", {}).includes("production"));
  assert.ok(permissionsForBusiness("tienda", { production: true }).includes("production"));
  assert.ok(permissionsForBusiness("salon", { production: true }).includes("production"));
});

test("un trabajador con el permiso ve Producción solo si el módulo está encendido", () => {
  const ids = (modules: Record<string, boolean> | null) =>
    workerNavItems({ production: true }, modules).map((i) => i.id);
  assert.ok(ids({ production: true }).includes("production"));
  assert.ok(!ids({ production: false }).includes("production"));
  assert.ok(!ids({}).includes("production"));
});

test("el bodeguero de la tienda incluye Producción cuando el módulo aplica", () => {
  const bodega = (modules: Record<string, boolean>) =>
    permissionTemplatesFor("tienda", modules).find((t) => t.id === "bodega")?.permissions ?? [];
  assert.ok(bodega({ production: true }).includes("production"));
  assert.ok(!bodega({}).includes("production"));
});
