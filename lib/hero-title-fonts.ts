import type { CSSProperties } from "react";

/**
 * Fuentes que el negocio puede elegir para el título de la portada.
 *
 * Esta lista es PURA (sin `next/font`) para poder normalizar la configuración
 * y testearla con `tsx --test`. Las fuentes en sí se cargan en
 * `app/[slug]/templates/hero-fonts.ts`, que tiene que tener una entrada por
 * cada id de acá.
 */
export const HERO_TITLE_FONT_GROUPS = ["Elegantes", "Modernas", "Manuscritas"] as const;

export type HeroTitleFontGroup = (typeof HERO_TITLE_FONT_GROUPS)[number];

export const HERO_TITLE_FONTS = [
  { id: "playfair", name: "Playfair Display", label: "Elegante", description: "Serif clásica, con contraste.", group: "Elegantes", script: false },
  { id: "cormorant", name: "Cormorant Garamond", label: "Clásica", description: "Serif fina, de libro antiguo.", group: "Elegantes", script: false },
  { id: "abril", name: "Abril Fatface", label: "Revista", description: "Serif gruesa, de portada de revista.", group: "Elegantes", script: false },
  { id: "montserrat", name: "Montserrat", label: "Moderna", description: "Sin serifa, gruesa y limpia.", group: "Modernas", script: false },
  { id: "bebas", name: "Bebas Neue", label: "Impacto", description: "Alta y angosta, para destacar.", group: "Modernas", script: false },
  { id: "oswald", name: "Oswald", label: "Condensada", description: "Angosta y firme.", group: "Modernas", script: false },
  { id: "raleway", name: "Raleway", label: "Geométrica", description: "Formas redondas y precisas.", group: "Modernas", script: false },
  { id: "anton", name: "Anton", label: "Cartel", description: "Muy gruesa, de afiche.", group: "Modernas", script: false },
  { id: "dancing", name: "Dancing Script", label: "Manuscrita", description: "Cursiva escrita a mano.", group: "Manuscritas", script: true },
  { id: "pacifico", name: "Pacifico", label: "Pincel", description: "Trazo de pincel, redondeado.", group: "Manuscritas", script: true },
  { id: "greatvibes", name: "Great Vibes", label: "Firma", description: "Caligrafía fina, como una firma.", group: "Manuscritas", script: true },
  { id: "caveat", name: "Caveat", label: "A mano", description: "Letra de marcador, informal.", group: "Manuscritas", script: true },
  { id: "satisfy", name: "Satisfy", label: "Retro", description: "Cursiva de letrero antiguo.", group: "Manuscritas", script: true },
  { id: "sacramento", name: "Sacramento", label: "Delicada", description: "Cursiva de trazo muy fino.", group: "Manuscritas", script: true },
  { id: "allura", name: "Allura", label: "Caligrafía", description: "Caligrafía inclinada y elegante.", group: "Manuscritas", script: true },
  { id: "kaushan", name: "Kaushan Script", label: "Brocha", description: "Trazo de brocha, con fuerza.", group: "Manuscritas", script: true },
  { id: "lobster", name: "Lobster", label: "Letrero", description: "Cursiva gruesa, de vitrina.", group: "Manuscritas", script: true },
  { id: "marker", name: "Permanent Marker", label: "Marcador", description: "Escrita con marcador.", group: "Manuscritas", script: true },
  { id: "shadows", name: "Shadows Into Light", label: "Cuaderno", description: "Letra de apuntes, ligera.", group: "Manuscritas", script: true },
  { id: "amatic", name: "Amatic SC", label: "Tiza", description: "Angosta, como escrita en tablero.", group: "Manuscritas", script: true },
] as const satisfies readonly {
  id: string;
  name: string;
  label: string;
  description: string;
  group: HeroTitleFontGroup;
  script: boolean;
}[];

export type HeroTitleFont = (typeof HERO_TITLE_FONTS)[number]["id"];

export const HERO_TITLE_FONT_IDS: readonly HeroTitleFont[] = HERO_TITLE_FONTS.map((font) => font.id);

/** Etiqueta de la opción `null`: la fuente propia de la plantilla. */
export const HERO_TITLE_TEMPLATE_FONT_LABEL = "De la plantilla";

export type HeroTitleFontOption = (typeof HERO_TITLE_FONTS)[number];

/** Las fuentes por grupo, en el orden de `HERO_TITLE_FONT_GROUPS` (para el selector). */
export function heroTitleFontGroups(): { group: HeroTitleFontGroup; fonts: HeroTitleFontOption[] }[] {
  return HERO_TITLE_FONT_GROUPS.map((group) => ({
    group,
    fonts: HERO_TITLE_FONTS.filter((font) => font.group === group),
  }));
}

/** Solo acepta ids conocidos; cualquier otra cosa es la fuente de la plantilla. */
export function heroTitleFontOrNull(value: unknown): HeroTitleFont | null {
  return typeof value === "string" && (HERO_TITLE_FONT_IDS as readonly string[]).includes(value)
    ? (value as HeroTitleFont)
    : null;
}

/**
 * Estilo en línea para el `<h1>` de la portada. Va en línea a propósito: gana
 * sobre el CSS module de cada plantilla. Varias plantillas ponen el título en
 * mayúsculas y con espaciado, lo que arruina una cursiva: las manuscritas lo
 * anulan.
 */
export function heroTitleFontStyleFrom(
  id: unknown,
  families: Partial<Record<HeroTitleFont, string>>,
): CSSProperties | undefined {
  const font = HERO_TITLE_FONTS.find((item) => item.id === id);
  const fontFamily = font ? families[font.id] : undefined;
  if (!font || !fontFamily) return undefined;
  // Una fuente elegida se ve tal cual es, sin el tratamiento que la plantilla
  // le da a la suya: ni mayúsculas forzadas, ni espaciado, ni contorno (Qutter
  // dibuja relleno transparente con borde de 1px). Las plantillas de contorno
  // leen estas variables y rellenan con su propia tinta; las demás las ignoran.
  // "De la plantilla" (null) no pasa por acá y conserva todo su estilo.
  return {
    fontFamily,
    textTransform: "none",
    letterSpacing: "normal",
    "--hero-title-fill": "var(--hero-title-ink)",
    "--hero-title-stroke": "0px",
  } as CSSProperties;
}
