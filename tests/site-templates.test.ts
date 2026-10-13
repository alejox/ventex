import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SITE_IMAGES,
  SITE_TEMPLATES,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_GROUP_LABELS,
  TEMPLATE_GROUPS,
  TEMPLATE_LABELS,
  normalizeLandingConfig,
  templatesFor,
} from "../services/public-site.types";

const LEGACY = ["rasm", "fallspa", "qutter"];
const SALON = ["rasm", "fallspa", "qutter", "barberia", "barberia-artesanal", "barberia-urbana", "luxia", "lezar", "zen"];

test("mercado está registrada, en el grupo Tiendas y con copia para el editor", () => {
  assert.ok(SITE_TEMPLATES.includes("mercado"));
  assert.equal(TEMPLATE_GROUPS.mercado, "tienda");
  assert.equal(TEMPLATE_GROUP_LABELS.tienda, "Tiendas");
  assert.ok(TEMPLATE_LABELS.mercado);
  assert.ok(TEMPLATE_DESCRIPTIONS.mercado);
  assert.ok("mercado" in DEFAULT_SITE_IMAGES);
  assert.equal(normalizeLandingConfig({ template: "mercado" }).template, "mercado");
});

test("tienda ve SOLO las plantillas de tienda", () => {
  const offered = templatesFor("tienda");
  assert.deepEqual(offered, ["mercado"]);
  for (const template of offered) assert.equal(TEMPLATE_GROUPS[template], "tienda");
});

test("una tienda con una plantilla vieja la conserva en la lista", () => {
  assert.deepEqual(templatesFor("tienda", "rasm"), ["rasm", "mercado"]);
  assert.deepEqual(templatesFor("tienda", "barberia-artesanal"), ["barberia-artesanal", "mercado"]);
  assert.deepEqual(templatesFor("tienda", "mercado"), ["mercado"]);
});

test("los demás rubros ven exactamente lo de antes, sin plantillas de tienda", () => {
  assert.deepEqual(templatesFor("salon"), SALON);
  for (const type of [null, undefined, "lavaautos", "servicios", "escuela"]) {
    assert.deepEqual(templatesFor(type), LEGACY);
  }
  assert.deepEqual(templatesFor("servicios", "luxia"), [...LEGACY, "luxia"]);
});

test("un negocio que dejó de ser tienda conserva su mercado guardado", () => {
  assert.deepEqual(templatesFor("salon", "mercado"), [...SALON, "mercado"]);
});
