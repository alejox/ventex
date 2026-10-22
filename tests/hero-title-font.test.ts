import test from "node:test";
import assert from "node:assert/strict";
import {
  HERO_TITLE_FONTS,
  HERO_TITLE_FONT_GROUPS,
  HERO_TITLE_FONT_IDS,
  heroTitleFontGroups,
  heroTitleFontOrNull,
  heroTitleFontStyleFrom,
  type HeroTitleFont,
} from "../lib/hero-title-fonts";
import { defaultLandingConfig, normalizeLandingConfig } from "../services/public-site.types";

const FAMILIES = Object.fromEntries(
  HERO_TITLE_FONT_IDS.map((id) => [id, `'${id}-family', serif`]),
) as Record<HeroTitleFont, string>;

test("el normalizador conserva cada fuente conocida", () => {
  for (const id of HERO_TITLE_FONT_IDS) {
    assert.equal(heroTitleFontOrNull(id), id);
  }
});

test("una fuente desconocida, vacía o de otro tipo cae a la de la plantilla", () => {
  for (const value of ["comic-sans", "", "PLAYFAIR", null, undefined, 3, {}]) {
    assert.equal(heroTitleFontOrNull(value), null);
  }
});

test("la configuración por defecto usa la fuente de la plantilla", () => {
  assert.equal(defaultLandingConfig().hero.titleFont, null);
});

test("un sitio guardado antes de la fuente se normaliza con titleFont null", () => {
  const config = normalizeLandingConfig({ version: 1, template: "rasm", hero: { title: "Hola", overlay: 40 } });
  assert.equal(config.hero.titleFont, null);
  assert.equal(config.hero.title, "Hola");
  assert.equal(config.hero.overlay, 40);
});

test("normalizeLandingConfig conserva una fuente conocida y descarta una desconocida", () => {
  assert.equal(normalizeLandingConfig({ hero: { titleFont: "dancing" } }).hero.titleFont, "dancing");
  assert.equal(normalizeLandingConfig({ hero: { titleFont: "inventada" } }).hero.titleFont, null);
});

test("el estilo es undefined para la fuente de la plantilla o una desconocida", () => {
  assert.equal(heroTitleFontStyleFrom(null, FAMILIES), undefined);
  assert.equal(heroTitleFontStyleFrom("inventada", FAMILIES), undefined);
});

test("una fuente conocida fija la familia", () => {
  const style = heroTitleFontStyleFrom("playfair", FAMILIES);
  assert.equal(style?.fontFamily, FAMILIES.playfair);
});

test("toda fuente elegida anula mayúsculas y espaciado de la plantilla", () => {
  for (const font of HERO_TITLE_FONTS) {
    const style = heroTitleFontStyleFrom(font.id, FAMILIES);
    assert.equal(style?.fontFamily, FAMILIES[font.id]);
    assert.equal(style?.textTransform, "none");
    assert.equal(style?.letterSpacing, "normal");
  }
});

test("cada fuente tiene etiqueta y descripción en español", () => {
  assert.equal(new Set(HERO_TITLE_FONT_IDS).size, HERO_TITLE_FONT_IDS.length);
  for (const font of HERO_TITLE_FONTS) {
    assert.ok(font.label.length > 0);
    assert.ok(font.description.length > 0);
  }
});

test("la lista agrupada trae Elegantes, Modernas y Manuscritas, sin perder ni repetir fuentes", () => {
  const groups = heroTitleFontGroups();
  assert.deepEqual(groups.map((group) => group.group), ["Elegantes", "Modernas", "Manuscritas"]);
  const ids = groups.flatMap((group) => group.fonts.map((font) => font.id));
  assert.deepEqual([...ids].sort(), [...HERO_TITLE_FONT_IDS].sort());
});

test("cada fuente pertenece a un grupo conocido y las manuscritas son las cursivas", () => {
  for (const font of HERO_TITLE_FONTS) {
    assert.ok((HERO_TITLE_FONT_GROUPS as readonly string[]).includes(font.group), font.id);
    assert.equal(font.group === "Manuscritas", font.script, font.id);
    assert.ok(font.name.length > 0, font.id);
  }
  const byId = Object.fromEntries(HERO_TITLE_FONTS.map((font) => [font.id, font.group]));
  assert.equal(byId.bebas, "Modernas");
  assert.equal(byId.playfair, "Elegantes");
});

test("ofrece al menos 20 fuentes, entre ellas las nuevas manuscritas", () => {
  assert.ok(HERO_TITLE_FONT_IDS.length >= 20);
  for (const id of ["satisfy", "sacramento", "allura", "kaushan", "lobster", "marker", "shadows", "amatic"]) {
    assert.ok((HERO_TITLE_FONT_IDS as readonly string[]).includes(id), id);
  }
});

test("toda fuente elegida pide título relleno a las plantillas de contorno", () => {
  const vars = (id: string) => heroTitleFontStyleFrom(id, FAMILIES) as Record<string, unknown> | undefined;
  for (const font of HERO_TITLE_FONTS) {
    assert.equal(vars(font.id)?.["--hero-title-fill"], "var(--hero-title-ink)", font.id);
    assert.equal(vars(font.id)?.["--hero-title-stroke"], "0px", font.id);
  }
});

test("Qutter dibuja el contorno con variables que el estilo puede anular", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../app/[slug]/templates/templates.module.css", import.meta.url), "utf8");
  const rule = css.match(/\.qutterHero \.heroTitle \{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /--hero-title-ink: #fff/);
  assert.match(rule, /color: var\(--hero-title-fill, transparent\)/);
  assert.match(rule, /-webkit-text-stroke: var\(--hero-title-stroke, 1px\) #fff/);
});
