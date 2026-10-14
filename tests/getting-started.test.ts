import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allGettingStartedDone,
  gettingStartedSteps,
  requiredGettingStartedSteps,
  type GettingStartedFacts,
} from "@/lib/getting-started";

const NOTHING: GettingStartedFacts = {
  hasProduct: false,
  hasService: false,
  hasStaff: false,
  hasDistributor: false,
  businessConfigured: false,
  paymentMethodsConfigured: false,
  sitePublished: false,
  hasSale: false,
};

const EVERYTHING: GettingStartedFacts = {
  hasProduct: true,
  hasService: true,
  hasStaff: true,
  hasDistributor: true,
  businessConfigured: true,
  paymentMethodsConfigured: true,
  sitePublished: true,
  hasSale: true,
};

const ids = (steps: { id: string }[]) => steps.map((s) => s.id);
const step = <T extends { id: string }>(steps: T[], id: string) => steps.find((s) => s.id === id)!;

test("tienda: negocio, proveedor, producto, pagos, personal, primera venta y catálogo web opcional", () => {
  const steps = gettingStartedSteps("tienda", null, NOTHING);
  assert.deepEqual(ids(steps), ["business", "supplier", "catalog", "payments", "staff", "first-sale", "site"]);
  assert.equal(step(steps, "catalog").href, "/dashboard/inventory/product");
  assert.match(step(steps, "catalog").label, /producto/);
  const site = step(steps, "site");
  assert.equal(site.href, "/dashboard/landing");
  assert.equal(site.optional, true);
  assert.match(site.label, /catálogo/);
  assert.match(site.hint, /WhatsApp/);
  assert.doesNotMatch(`${site.label} ${site.hint}`, /reserv/i);
});

test("salón: lleva proveedor y personal, y el sitio de reservas va al final", () => {
  const steps = gettingStartedSteps("salon", null, NOTHING);
  assert.deepEqual(ids(steps), ["business", "supplier", "catalog", "payments", "staff", "first-sale", "site"]);
  assert.equal(step(steps, "catalog").href, "/dashboard/inventory/product?type=servicio");
  assert.equal(step(steps, "site").href, "/dashboard/landing");
});

test("escuela: sin proveedor; el catálogo es el plan de clases y el personal son profesores", () => {
  const steps = gettingStartedSteps("escuela", { school: true }, NOTHING);
  assert.deepEqual(ids(steps), ["business", "catalog", "payments", "staff", "first-sale", "site"]);
  assert.equal(step(steps, "catalog").href, "/dashboard/school/planes");
  assert.match(step(steps, "staff").label, /profesores/);
});

test("servicios: sin proveedor (no tiene ese ítem en el menú)", () => {
  const steps = gettingStartedSteps("servicios", null, NOTHING);
  assert.deepEqual(ids(steps), ["business", "catalog", "payments", "staff", "first-sale", "site"]);
});

test("el paso del proveedor y el de pagos apuntan a su sección", () => {
  const steps = gettingStartedSteps("tienda", null, NOTHING);
  assert.equal(step(steps, "supplier").href, "/dashboard/distributors?new=1");
  assert.match(step(steps, "supplier").label, /proveedor/);
  assert.equal(step(steps, "payments").href, "/dashboard/settings/pagos");
  assert.match(step(steps, "payments").label, /métodos de pago/);
});

test("el personal y el sitio son opcionales", () => {
  const steps = gettingStartedSteps("salon", null, NOTHING);
  assert.deepEqual(
    steps.filter((s) => s.optional).map((s) => s.id),
    ["staff", "site"],
  );
});

test("sin tipo de negocio no hay checklist", () => {
  assert.deepEqual(gettingStartedSteps(null, null, NOTHING), []);
  assert.equal(allGettingStartedDone([]), false);
});

test("cualquier ítem del catálogo marca el paso del catálogo", () => {
  const conServicio = gettingStartedSteps("tienda", null, { ...NOTHING, hasService: true });
  assert.equal(step(conServicio, "catalog").done, true);
  const conProducto = gettingStartedSteps("salon", null, { ...NOTHING, hasProduct: true });
  assert.equal(step(conProducto, "catalog").done, true);
});

test("pagos se marca solo cuando se guardó la sección, aunque se cobre solo en efectivo", () => {
  assert.equal(step(gettingStartedSteps("tienda", null, NOTHING), "payments").done, false);
  const guardado = gettingStartedSteps("tienda", null, { ...NOTHING, paymentMethodsConfigured: true });
  assert.equal(step(guardado, "payments").done, true);
});

test("cada paso se marca con su propio hecho", () => {
  const steps = gettingStartedSteps("salon", null, {
    ...NOTHING,
    hasStaff: true,
    hasDistributor: true,
    sitePublished: true,
  });
  const done = Object.fromEntries(steps.map((s) => [s.id, s.done]));
  assert.deepEqual(done, {
    business: false,
    supplier: true,
    catalog: false,
    payments: false,
    staff: true,
    "first-sale": false,
    site: true,
  });
  assert.equal(allGettingStartedDone(steps), false);
});

test("todo hecho: el checklist se da por completo", () => {
  assert.equal(allGettingStartedDone(gettingStartedSteps("salon", null, EVERYTHING)), true);
});

test("un sitio sin publicar no impide completar los primeros pasos", () => {
  const sinSitio = { ...EVERYTHING, sitePublished: false };
  for (const type of ["tienda", "salon", "escuela", "lavaautos", "servicios"] as const) {
    const steps = gettingStartedSteps(type, type === "escuela" ? { school: true } : null, sinSitio);
    assert.equal(step(steps, "site").done, false, type);
    assert.equal(allGettingStartedDone(steps), true, type);
  }
});

test("un paso obligatorio pendiente sí impide completarlos", () => {
  const sinPagos = { ...EVERYTHING, paymentMethodsConfigured: false };
  assert.equal(allGettingStartedDone(gettingStartedSteps("tienda", null, sinPagos)), false);
  const sinProveedor = { ...EVERYTHING, hasDistributor: false };
  assert.equal(allGettingStartedDone(gettingStartedSteps("tienda", null, sinProveedor)), false);
  // La escuela no tiene paso de proveedor: no tenerlo no la frena.
  assert.equal(allGettingStartedDone(gettingStartedSteps("escuela", { school: true }, sinProveedor)), true);
});

test("staff and site never block required completion or change required progress", () => {
  for (const type of ["tienda", "salon", "escuela", "lavaautos", "servicios"] as const) {
    const modules = type === "escuela" ? { school: true } : null;
    const facts = { ...EVERYTHING, hasStaff: false, sitePublished: false };
    const steps = gettingStartedSteps(type, modules, facts);
    assert.equal(step(steps, "staff").done, false, type);
    assert.equal(step(steps, "staff").optional, true, type);
    assert.equal(allGettingStartedDone(steps), true, type);
    const required = requiredGettingStartedSteps(steps);
    assert.equal(required.length, type === "escuela" || type === "servicios" ? 4 : 5, type);
    assert.equal(required.every((entry) => entry.done), true, type);
  }
});

test("manual staff completion is reversible and never overrides actual staff", () => {
  assert.equal(step(gettingStartedSteps("salon", null, NOTHING, true), "staff").done, true);
  assert.equal(step(gettingStartedSteps("salon", null, NOTHING, false), "staff").done, false);
  assert.equal(step(gettingStartedSteps("salon", null, EVERYTHING, false), "staff").done, true);
  assert.equal(allGettingStartedDone(gettingStartedSteps("salon", null, NOTHING, true)), false);
});

test("manual completion preserves teacher wording and staff navigation visibility", () => {
  const school = gettingStartedSteps("escuela", { school: true }, NOTHING, true);
  assert.match(step(school, "staff").label, /profesores/);
  assert.equal(step(school, "staff").href, "/dashboard/staff");
  assert.equal(step(school, "staff").done, true);
  const staffModuleDisabled = gettingStartedSteps("tienda", { staff: false }, NOTHING, true);
  assert.equal(step(staffModuleDisabled, "staff").href, "/dashboard/staff");
});
