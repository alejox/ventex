import test from "node:test";
import assert from "node:assert/strict";
import { templatePreview, SITE_PALETTES } from "../app/[slug]/templates/theme";

/**
 * La miniatura del selector de Diseño en Ajustes es lo único que el dueño mira
 * antes de elegir plantilla. Cuando sus colores estaban escritos a mano, mostró
 * durante meses lima sobre negro para "Moderno" mientras la plantilla publicaba
 * coral sobre azul. Estas pruebas existen para que no vuelva a despegarse.
 */

test("los colores de la miniatura salen de la paleta real, no de una copia", () => {
  for (const template of ["clasico", "moderno", "minimal"] as const) {
    const preview = templatePreview(template);
    const palette = SITE_PALETTES[template];
    assert.equal(preview.bg, palette["--site-bg"]);
    assert.equal(preview.accent, palette["--site-accent"]);
    assert.equal(preview.text, palette["--site-text"]);
  }
});

test("un salón en 'moderno' recibe la variante de barbería, y la miniatura lo dice", () => {
  const salon = templatePreview("moderno", "salon");
  const generico = templatePreview("moderno");

  assert.notEqual(salon.accent, generico.accent, "el dorado no es el coral genérico");
  assert.notEqual(salon.bg, generico.bg);
  assert.equal(salon.serif, true, "la plantilla de barbería titula con serifa");
  assert.ok(salon.description, "la descripción genérica no describe esta variante");
});

test("los demás tipos de negocio siguen viendo la moderna genérica", () => {
  for (const tipo of ["tienda", "lavaautos", "servicios", null, undefined]) {
    assert.deepEqual(templatePreview("moderno", tipo), templatePreview("moderno"));
  }
});

test("la variante de barbería solo aplica a 'moderno'", () => {
  assert.deepEqual(templatePreview("clasico", "salon"), templatePreview("clasico"));
  assert.deepEqual(templatePreview("minimal", "salon"), templatePreview("minimal"));
});

test("serif se deduce de la familia real: 'sans-serif' no cuenta como serifa", () => {
  // La trampa: toda familia genérica termina en "serif", así que un endsWith
  // marcaría como serifa a las tres plantillas.
  assert.equal(templatePreview("clasico").serif, true, "Iowan Old Style … serif");
  assert.equal(templatePreview("moderno").serif, false, "… sans-serif");
  assert.equal(templatePreview("minimal").serif, false, "Avenir Next … sans-serif");
});
