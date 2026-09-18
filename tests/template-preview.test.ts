import test from "node:test";
import assert from "node:assert/strict";
import { templatePreview, SITE_PALETTES } from "../app/[slug]/templates/theme";
import {
  SITE_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_DESCRIPTIONS,
  templatesFor,
  textoDelSitio,
  SITE_COPY_KEYS,
  SITE_COPY_LABELS,
  TEMPLATE_COPY_DEFAULTS,
  encuadreDelHero,
  veloDelHero,
  type PublicSite,
} from "../services/public-site.types";

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
  // El nombre visible dejó de ser "Barbería" a secas cuando apareció la
  // segunda: con dos, el rótulo tiene que decir CUÁL de las dos es.
  assert.match(TEMPLATE_LABELS.barberia, /barber/i);
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
 * Qué plantillas se le OFRECEN a cada negocio.
 *
 * Ninguna plantilla es neutra: las de barbería hablan de cortes y de barba, y
 * las genéricas no hablan de nada en particular. Cruzarlas en el selector es
 * ofrecerle a cada uno el diseño equivocado.
 */

test("una tienda general ve las genéricas y ninguna de barbería", () => {
  assert.deepEqual(templatesFor("tienda"), ["clasico", "moderno", "minimal"]);
});

test("una barbería ve SOLO las de barbería", () => {
  const ofrecidas = templatesFor("salon");
  assert.ok(ofrecidas.length >= 2, "tiene que haber de dónde elegir");
  assert.ok(ofrecidas.every((t) => t.startsWith("barberia")), ofrecidas.join(","));
  for (const generica of ["clasico", "moderno", "minimal"]) {
    assert.ok(!ofrecidas.includes(generica as never), generica);
  }
});

test("las tres de barbería son estéticas distintas, no la misma con otro color", () => {
  const vistas = templatesFor("salon").map(templatePreview);
  for (let i = 0; i < vistas.length; i++) {
    for (let j = i + 1; j < vistas.length; j++) {
      assert.notEqual(vistas[i].accent, vistas[j].accent, `acentos repetidos en ${i} y ${j}`);
    }
  }
});

test("cada plantilla de barbería tiene un nombre propio en el selector", () => {
  // Con tres, el rótulo es lo único que las distingue antes de elegir.
  const rotulos = templatesFor("salon").map((t) => TEMPLATE_LABELS[t]);
  assert.equal(new Set(rotulos).size, rotulos.length, rotulos.join(" / "));
});

test("lavaautos y servicios se parecen a la tienda, no a la barbería", () => {
  for (const tipo of ["lavaautos", "servicios"]) {
    assert.deepEqual(templatesFor(tipo), templatesFor("tienda"), tipo);
  }
});

test("sin tipo de negocio no se ofrece ninguna plantilla de rubro", () => {
  // Preferimos quedarnos cortos: mostrar las cinco a quien no sabemos qué es
  // garantiza que la mayoría vea algo que no le sirve.
  for (const tipo of [null, undefined, ""]) {
    assert.deepEqual(templatesFor(tipo), [], String(tipo));
  }
});

test("la plantilla YA GUARDADA se ofrece siempre, aunque deje de corresponder", () => {
  // El caso real: una tienda que eligió barbería antes de que existiera el
  // filtro. Esconderla dejaría el selector sin ninguna tarjeta marcada mientras
  // el sitio publicado la sigue usando — sin forma de ver qué tiene ni de
  // cambiarlo. La restricción es para lo que se elige de ahora en adelante.
  const ofrecidas = templatesFor("tienda", "barberia");
  assert.ok(ofrecidas.includes("barberia"));
  assert.deepEqual(ofrecidas, ["clasico", "moderno", "minimal", "barberia"]);
});

test("el orden del selector no depende del rubro", () => {
  // Filtrar no debe reordenar: el dueño que vuelve a Ajustes espera las
  // tarjetas donde estaban.
  for (const tipo of ["tienda", "salon", "lavaautos"]) {
    const ofrecidas = templatesFor(tipo);
    const posiciones = ofrecidas.map((t) => SITE_TEMPLATES.indexOf(t));
    assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b), tipo);
  }
});

/**
 * Textos editables del micrositio. Lo que el negocio escribe gana; lo que deja
 * vacío vuelve al texto de su plantilla — nunca a un título en blanco, que se
 * lee como una página rota y no como una decisión.
 */

test("sin nada escrito, cada plantilla usa su propio texto", () => {
  const site = { template: "barberia-artesanal", copy: null } as unknown as PublicSite;
  assert.equal(textoDelSitio(site, "servicesTitle"), "Nuestros servicios");

  const otra = { template: "barberia", copy: null } as unknown as PublicSite;
  assert.equal(textoDelSitio(otra, "servicesTitle"), "Tu estilo, en buenas manos.");
});

test("lo que escribe el negocio gana sobre el texto de la plantilla", () => {
  const site = {
    template: "barberia",
    copy: { servicesTitle: "Lo que hacemos acá" },
  } as unknown as PublicSite;
  assert.equal(textoDelSitio(site, "servicesTitle"), "Lo que hacemos acá");
});

test("un campo vaciado o en blanco vuelve al texto por defecto", () => {
  for (const vacio of ["", "   ", "\n\t"]) {
    const site = { template: "barberia", copy: { teamTitle: vacio } } as unknown as PublicSite;
    assert.equal(textoDelSitio(site, "teamTitle"), "Conoce a tu equipo.");
  }
});

test("se recortan los espacios de los bordes", () => {
  const site = { template: "barberia", copy: { teamTitle: "  Nuestro equipo  " } } as unknown as PublicSite;
  assert.equal(textoDelSitio(site, "teamTitle"), "Nuestro equipo");
});

test("una clave que la plantilla no dibuja devuelve cadena vacía, no 'undefined'", () => {
  // `clasico` no tiene subtítulo de equipo. Devolver undefined lo pintaría
  // literalmente en la página.
  const site = { template: "clasico", copy: {} } as unknown as PublicSite;
  assert.equal(textoDelSitio(site, "teamSubtitle"), "");
});

test("toda clave editable existe en al menos una plantilla", () => {
  // Si no, el selector de Ajustes ofrecería un campo que nunca se publica.
  for (const clave of SITE_COPY_KEYS) {
    const usada = SITE_TEMPLATES.some((t) => TEMPLATE_COPY_DEFAULTS[t]?.[clave]);
    assert.ok(usada, `${clave} no la usa ninguna plantilla`);
  }
});

test("toda clave editable tiene etiqueta para el formulario", () => {
  for (const clave of SITE_COPY_KEYS) assert.ok(SITE_COPY_LABELS[clave], clave);
});

/**
 * Encuadre y oscurecido del hero. Con la foto de referencia manda la plantilla;
 * en cuanto el negocio sube la suya, manda el negocio.
 */

const conHero = (extra: Record<string, unknown> = {}) =>
  ({ template: "barberia", heroImageUrl: "/mi-foto.webp", ...extra }) as unknown as PublicSite;

test("sin foto propia NO se toca el encuadre de la plantilla", () => {
  // Devolver "50% 50%" acá pisaría el `object-position` que cada plantilla
  // eligió a mano para la foto de muestra.
  const site = { template: "barberia", heroImageUrl: null } as unknown as PublicSite;
  assert.equal(encuadreDelHero(site), undefined);
});

test("con foto propia y sin elegir nada, queda centrada", () => {
  assert.equal(encuadreDelHero(conHero()), "50% 50%");
});

test("el punto que elige el negocio manda", () => {
  assert.equal(encuadreDelHero(conHero({ heroFocusX: 78, heroFocusY: 20 })), "78% 20%");
});

test("un valor fuera de rango se recorta en vez de romper el CSS", () => {
  // La base ya lo limita, pero un `object-position` de "-40%" saldría del
  // encuadre y dejaría el hero en blanco.
  assert.equal(encuadreDelHero(conHero({ heroFocusX: -40, heroFocusY: 900 })), "0% 100%");
});

test("sin oscurecido extra no se pinta ninguna capa", () => {
  // Devolver "rgb(0 0 0 / 0%)" haría pintar un div transparente en cada render.
  assert.equal(veloDelHero(conHero()), null);
  assert.equal(veloDelHero(conHero({ heroOverlay: 0 })), null);
});

test("el oscurecido extra se pinta encima del velo de la plantilla", () => {
  assert.equal(veloDelHero(conHero({ heroOverlay: 40 })), "rgb(0 0 0 / 40%)");
});

test("el oscurecido NO puede aclarar por debajo del piso de la plantilla", () => {
  // Ese piso es de contraste: sin él, el titular sobre una foto clara no se lee.
  assert.equal(veloDelHero(conHero({ heroOverlay: -30 })), null);
});

test("el oscurecido se topa en 70: en negro total deja de ser una foto", () => {
  assert.equal(veloDelHero(conHero({ heroOverlay: 999 })), "rgb(0 0 0 / 70%)");
});
