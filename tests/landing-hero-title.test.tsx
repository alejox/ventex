import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroTitleField } from "../components/landing/HeroTitleField";
Object.assign(globalThis, { React });

const noop = () => {};

test("vacío: muestra el nombre real del negocio y explica de dónde sale", () => {
  const html = renderToStaticMarkup(<HeroTitleField value={null} siteName="Alejoxgaming" onChange={noop} />);
  assert.match(html, /placeholder="Alejoxgaming"/);
  assert.match(html, /nombre de tu negocio/);
  assert.match(html, /Alejoxgaming/);
  assert.match(html, /Negocio/);
  assert.doesNotMatch(html, /Usar el nombre del negocio/);
});

test("con título propio: ofrece volver al nombre del negocio", () => {
  const html = renderToStaticMarkup(<HeroTitleField value="Cortes con estilo" siteName="Alejoxgaming" onChange={noop} />);
  assert.match(html, /value="Cortes con estilo"/);
  assert.match(html, /Usar el nombre del negocio/);
});

test("la ayuda está asociada al campo para lectores de pantalla", () => {
  const html = renderToStaticMarkup(<HeroTitleField value={null} siteName="Alejoxgaming" onChange={noop} />);
  const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(id);
  assert.ok(html.includes(`id="${id}"`));
});

import { HeroTitleFontField, heroTitleFontSelectOptions } from "../components/landing/HeroTitleFontField";
import { readOptions } from "../components/ui/Select";
import { HERO_TITLE_FONTS } from "../lib/hero-title-fonts";

const FONT_FAMILIES = { dancing: "'Dancing Script', cursive" };

function decode(html: string) {
  return html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

test("fuente del título: una sola vista previa con la fuente elegida y su leyenda", () => {
  const html = decode(renderToStaticMarkup(<HeroTitleFontField value="dancing" sample="Alejoxgaming" families={FONT_FAMILIES} onChange={noop} />));
  assert.equal(html.match(/data-hero-font-preview/g)?.length, 1);
  assert.match(html, /data-hero-font-preview[^>]*style="[^"]*font-family:'Dancing Script', cursive/);
  assert.match(html, /<p[^>]*>Manuscrita · Dancing Script<\/p>/);
  assert.equal(html.match(/>Alejoxgaming</g)?.length, 1);
});

test("fuente del título: usa el Select de la plataforma, que muestra la actual en su fuente", () => {
  const html = decode(renderToStaticMarkup(<HeroTitleFontField value="dancing" sample="Alejoxgaming" families={FONT_FAMILIES} onChange={noop} />));
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /<span class="truncate " style="font-family:'Dancing Script', cursive">Manuscrita · Dancing Script<\/span>/);
});

test("fuente del título: las opciones van agrupadas, cada una en su fuente, con la plantilla primero", () => {
  const options = readOptions(heroTitleFontSelectOptions(FONT_FAMILIES));
  assert.deepEqual(options[0], { value: "", label: "De la plantilla", disabled: false });
  assert.deepEqual([...new Set(options.slice(1).map((o) => o.group))], ["Elegantes", "Modernas", "Manuscritas"]);
  assert.equal(options.length, HERO_TITLE_FONTS.length + 1);
  for (const font of HERO_TITLE_FONTS) {
    const option = options.find((o) => o.value === font.id);
    assert.equal(option?.label, `${font.label} · ${font.name}`);
  }
  assert.deepEqual(options.find((o) => o.value === "dancing")?.style, { fontFamily: FONT_FAMILIES.dancing });
});

test("fuente del título: sin elegir muestra la de la plantilla, con etiqueta y ayuda asociadas", () => {
  const html = decode(renderToStaticMarkup(<HeroTitleFontField value={null} sample="" families={FONT_FAMILIES} onChange={noop} />));
  assert.match(html, /data-hero-font-preview[^>]*>Aa</);
  assert.match(html, /<span class="truncate ">De la plantilla<\/span>/);
  assert.match(html, /Fuente del título principal<\/label>/);
  const id = html.match(/<button[^>]*id="([^"]+)"[^>]*role="combobox"/)?.[1];
  assert.ok(id && html.includes(`for="${id}"`));
  const described = html.match(/role="combobox"[^>]*aria-describedby="([^"]+)"/)?.[1];
  assert.ok(described);
  const hintId = html.match(/<p id="([^"]+)"[^>]*>Cambia la letra/)?.[1];
  assert.ok(hintId && described.split(" ").includes(hintId));
});
