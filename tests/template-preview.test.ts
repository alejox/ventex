import test from "node:test";
import assert from "node:assert/strict";
import { templatePreview, SITE_PALETTES } from "../app/[slug]/templates/theme";
import { SITE_TEMPLATES, TEMPLATE_LABELS, TEMPLATE_DESCRIPTIONS, templatesFor } from "../services/public-site.types";

/**
 * La miniatura del selector de Diseño en Ajustes es lo único que el dueño mira
 * antes de elegir plantilla. Cuando sus colores estaban escritos a mano, mostró
 * lima sobre negro para "Moderno" mientras la plantilla publicaba coral sobre
 * azul, y blanco y negro para "Minimal" cuando el real es crema con malva.
 * Estas pruebas existen para que no vuelva a despegarse.
 */

test("los colores de la miniatura salen de la paleta real, no de una copia", () => {
  for (const template of SITE_TEMPLATES) {
    const preview = templatePreview(template);
    const palette = SITE_PALETTES[template];
    assert.equal(preview.bg, palette["--site-bg"]);
    assert.equal(preview.accent, palette["--site-accent"]);
    assert.equal(preview.text, palette["--site-text"]);
  }
});

test("serif se deduce de la familia real: 'sans-serif' no cuenta como serifa", () => {
  // La trampa: toda familia genérica termina en "serif", así que un endsWith
  // marcaría como serifa a las cuatro plantillas.
  assert.equal(templatePreview("clasico").serif, true, "Iowan Old Style … serif");
  assert.equal(templatePreview("barberia").serif, true, "Iowan Old Style … serif");
  assert.equal(templatePreview("moderno").serif, false, "… sans-serif");
  assert.equal(templatePreview("minimal").serif, false, "Avenir Next … sans-serif");
});

test("barbería es una plantilla elegible, no una consecuencia del tipo de negocio", () => {
  // El bug que cierra: la presentación existía pero se activaba sola con
  // `businessType === "salon"`, así que el selector mostraba tres tarjetas
  // mientras había una cuarta que nadie podía pedir.
  assert.ok(SITE_TEMPLATES.includes("barberia"));
  assert.equal(TEMPLATE_LABELS.barberia, "Barbería");
});

test("cada plantilla tiene etiqueta y descripción, y ninguna se repite", () => {
  const etiquetas = SITE_TEMPLATES.map((t) => TEMPLATE_LABELS[t]);
  const descripciones = SITE_TEMPLATES.map((t) => TEMPLATE_DESCRIPTIONS[t]);
  assert.ok(etiquetas.every(Boolean) && descripciones.every(Boolean));
  assert.equal(new Set(etiquetas).size, SITE_TEMPLATES.length);
  assert.equal(new Set(descripciones).size, SITE_TEMPLATES.length);
});

test("la descripción de barbería avisa que su texto es del oficio", () => {
  // Cualquier negocio puede elegirla, así que el aviso es lo único que evita
  // que una ferretería publique "Personas detrás del oficio" sin enterarse.
  assert.match(TEMPLATE_DESCRIPTIONS.barberia, /barber/i);
});

test("cada plantilla se distingue de las demás por color o por tipografía", () => {
  const vistas = SITE_TEMPLATES.map(templatePreview);
  for (let i = 0; i < vistas.length; i++) {
    for (let j = i + 1; j < vistas.length; j++) {
      const a = vistas[i];
      const b = vistas[j];
      assert.ok(
        a.bg !== b.bg || a.accent !== b.accent || a.serif !== b.serif,
        `${SITE_TEMPLATES[i]} y ${SITE_TEMPLATES[j]} se ven iguales en la miniatura`,
      );
    }
  }
});

/**
 * Qué plantillas se le OFRECEN a cada negocio. La de barbería habla de cortes,
 * de barba y de "personas detrás del oficio": ofrecérsela a una tienda general
 * es invitarla a publicar un sitio que habla de otro negocio.
 */

test("una tienda general no ve las plantillas de rubro", () => {
  const ofrecidas = templatesFor("tienda");
  assert.ok(!ofrecidas.includes("barberia"));
  assert.deepEqual(ofrecidas, ["clasico", "moderno", "minimal"]);
});

test("un salón sí ve la de barbería", () => {
  assert.ok(templatesFor("salon").includes("barberia"));
  assert.equal(templatesFor("salon").length, SITE_TEMPLATES.length);
});

test("lavaautos y servicios tampoco: barbería nombra un oficio que no es el suyo", () => {
  for (const tipo of ["lavaautos", "servicios", null, undefined, ""]) {
    assert.ok(!templatesFor(tipo).includes("barberia"), `${tipo} no debería verla`);
  }
});

test("la plantilla YA GUARDADA se ofrece siempre, aunque deje de corresponder", () => {
  // El caso real: una tienda que eligió barbería antes de que existiera el
  // filtro. Esconderla dejaría el selector sin ninguna tarjeta marcada mientras
  // el sitio publicado la sigue usando — sin forma de ver qué tiene ni de
  // cambiarlo. La restricción es para lo que se elige de ahora en adelante.
  const ofrecidas = templatesFor("tienda", "barberia");
  assert.ok(ofrecidas.includes("barberia"));
  assert.equal(ofrecidas.length, SITE_TEMPLATES.length);
});

test("las plantillas neutras se ofrecen a todos los rubros", () => {
  for (const tipo of ["tienda", "salon", "lavaautos", "servicios", null]) {
    for (const neutra of ["clasico", "moderno", "minimal"] as const) {
      assert.ok(templatesFor(tipo).includes(neutra), `${neutra} le falta a ${tipo}`);
    }
  }
});

test("el orden del selector no depende del rubro", () => {
  // Filtrar no debe reordenar: el dueño que vuelve a Ajustes espera las
  // tarjetas donde estaban.
  const orden = (t: string) => templatesFor(t).join(",");
  assert.ok(SITE_TEMPLATES.join(",").includes(orden("tienda")));
  assert.equal(orden("salon"), SITE_TEMPLATES.join(","));
});
