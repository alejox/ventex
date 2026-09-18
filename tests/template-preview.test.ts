import test from "node:test";
import assert from "node:assert/strict";
import { templatePreview, SITE_PALETTES } from "../app/[slug]/templates/theme";
import { SITE_TEMPLATES, TEMPLATE_LABELS, TEMPLATE_DESCRIPTIONS } from "../services/public-site.types";

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
