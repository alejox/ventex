import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_WORKER_PERMISSIONS,
  WORKER_PERMISSION_HINTS,
  WORKER_PERMISSION_LABELS,
  WORKER_PERMISSION_PARENT,
  defaultModulesForType,
  hasAnyPermission,
  permissionSummary,
  permissionTemplatesFor,
  permissionsForBusiness,
  suggestedTemplateForRole,
  templatePermissions,
  workerNavItems,
  type WorkerPermission,
} from "../config/business";
import { can } from "../lib/permissions";
import type { Profile } from "../config/business";

const salon = () => permissionsForBusiness("salon", defaultModulesForType("salon"));
const tienda = () => permissionsForBusiness("tienda", {});
const escuela = () => permissionsForBusiness("escuela", defaultModulesForType("escuela"));

test("E6. Un salón no ve Vehículos, Facturación ni Académico (opt-in apagado)", () => {
  const p = salon();
  for (const hidden of ["vehicles", "billing", "school"] as WorkerPermission[]) {
    assert.ok(!p.includes(hidden), `salón no debería ofrecer ${hidden}`);
  }
  for (const shown of ["pos", "pos_discount", "calendar", "customers", "sales", "services", "inventory", "catalogo", "settings"] as WorkerPermission[]) {
    assert.ok(p.includes(shown), `salón debería ofrecer ${shown}`);
  }
});

test("E6. Tienda: productos sí, servicios/calendario/catálogo duplicado no", () => {
  const p = tienda();
  assert.ok(p.includes("inventory") && p.includes("inventory_costs"));
  for (const hidden of ["services", "calendar", "catalogo", "vehicles", "billing", "school"] as WorkerPermission[]) {
    assert.ok(!p.includes(hidden), `tienda no debería ofrecer ${hidden}`);
  }
});

test("E6. Escuela ofrece Académico pero no Calendario ni productos", () => {
  const p = escuela();
  assert.ok(p.includes("school"));
  assert.ok(!p.includes("calendar"));
  assert.ok(!p.includes("inventory") && !p.includes("inventory_costs"));
});

test("E6. Un hijo nunca se ofrece sin su padre; sin tipo de negocio se ofrecen todos", () => {
  for (const p of [salon(), tienda(), escuela()]) {
    for (const child of p) {
      const parent = WORKER_PERMISSION_PARENT[child];
      if (parent) assert.ok(p.includes(parent), `${child} sin ${parent}`);
    }
  }
  assert.equal(permissionsForBusiness(null, null).length, Object.keys(WORKER_PERMISSION_LABELS).length);
});

test("E6. Todo permiso tiene su línea de ayuda", () => {
  for (const k of Object.keys(WORKER_PERMISSION_LABELS)) {
    assert.ok(WORKER_PERMISSION_HINTS[k as WorkerPermission]?.length > 10, `falta ayuda para ${k}`);
  }
});

test("E6. Resumen: solo primer nivel y solo lo que aplica", () => {
  const perms = { pos: true, pos_discount: true, calendar: true, customers: true, vehicles: true };
  assert.deepEqual(permissionSummary(perms, salon()), ["POS", "Calendario", "Clientes"]);
  assert.equal(hasAnyPermission({ vehicles: true }, salon()), false);
  assert.equal(hasAnyPermission({ pos: true }, salon()), true);
});

test("E4. Barbero nace con POS, Calendario y Clientes", () => {
  const templates = permissionTemplatesFor("salon", defaultModulesForType("salon"));
  const t = suggestedTemplateForRole("Barbero", templates);
  assert.ok(t);
  assert.deepEqual(templatePermissions(t!), { pos: true, calendar: true, customers: true });
});

test("E4. Cajero: POS y Ventas, sin descuentos", () => {
  const t = suggestedTemplateForRole("Cajero", permissionTemplatesFor("tienda", {}));
  assert.deepEqual(t?.permissions, ["pos", "sales"]);
});

test("E4. Encargado: todo lo que aplica menos Ajustes (y con descuentos)", () => {
  const t = suggestedTemplateForRole("Encargado de tienda", permissionTemplatesFor("tienda", {}));
  assert.ok(t);
  assert.ok(!t!.permissions.includes("settings"));
  assert.ok(t!.permissions.includes("pos_discount"));
  assert.deepEqual(t!.permissions, tienda().filter((p) => p !== "settings"));
});

test("E4. Las plantillas se recortan a lo que aplica (salón con Servicios apagado)", () => {
  const templates = permissionTemplatesFor("salon", { services: false });
  const recepcion = suggestedTemplateForRole("Recepcionista", templates);
  assert.deepEqual(recepcion?.permissions, ["pos", "calendar", "customers"]);
  for (const t of permissionTemplatesFor("escuela", defaultModulesForType("escuela"))) {
    assert.ok(!t.permissions.includes("calendar"));
  }
});

test("E4. Profesor de escuela recibe Académico; cargo desconocido no sugiere nada", () => {
  const templates = permissionTemplatesFor("escuela", defaultModulesForType("escuela"));
  assert.ok(suggestedTemplateForRole("Profesor", templates)?.permissions.includes("school"));
  assert.equal(suggestedTemplateForRole("Astronauta", templates), null);
  assert.equal(suggestedTemplateForRole(null, templates), null);
});

const worker = (perms: Record<string, boolean>): Profile =>
  ({ isWorker: true, workerPermissions: perms }) as unknown as Profile;

test("C17. `pos_discount` es hijo de `pos`, entra en el preset admin y no es ítem de menú", () => {
  assert.equal(WORKER_PERMISSION_PARENT.pos_discount, "pos");
  assert.equal(ADMIN_WORKER_PERMISSIONS.pos_discount, true);
  assert.deepEqual(
    workerNavItems({ pos: true, pos_discount: true }).map((i) => i.id),
    workerNavItems({ pos: true }).map((i) => i.id),
  );
});

test("C17. Con solo `pos` no se descuenta; el dueño y el admin siempre", () => {
  assert.equal(can(worker({ pos: true }), "pos_discount"), false);
  assert.equal(can(worker({ pos: true, pos_discount: true }), "pos_discount"), true);
  assert.equal(can({ isWorker: false } as unknown as Profile, "pos_discount"), true);
});
