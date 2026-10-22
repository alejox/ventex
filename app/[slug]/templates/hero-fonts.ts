import type { CSSProperties } from "react";
import {
  Abril_Fatface,
  Allura,
  Amatic_SC,
  Anton,
  Bebas_Neue,
  Caveat,
  Cormorant_Garamond,
  Dancing_Script,
  Great_Vibes,
  Kaushan_Script,
  Lobster,
  Montserrat,
  Oswald,
  Pacifico,
  Permanent_Marker,
  Playfair_Display,
  Raleway,
  Sacramento,
  Satisfy,
  Shadows_Into_Light,
} from "next/font/google";
import { heroTitleFontStyleFrom, type HeroTitleFont } from "@/lib/hero-title-fonts";

// `preload: false`: solo se descarga la fuente que el sitio realmente usa (el
// `@font-face` existe para todas, pero el navegador baja el archivo recién
// cuando un elemento la pide).
const playfair = Playfair_Display({ subsets: ["latin"], weight: "700", display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin"], weight: "800", display: "swap", preload: false });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const dancing = Dancing_Script({ subsets: ["latin"], weight: "700", display: "swap", preload: false });
const pacifico = Pacifico({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const greatvibes = Great_Vibes({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const caveat = Caveat({ subsets: ["latin"], weight: "700", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: "700", display: "swap", preload: false });
const abril = Abril_Fatface({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], weight: "700", display: "swap", preload: false });
const raleway = Raleway({ subsets: ["latin"], weight: "800", display: "swap", preload: false });
const anton = Anton({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const satisfy = Satisfy({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const sacramento = Sacramento({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const allura = Allura({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const kaushan = Kaushan_Script({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const lobster = Lobster({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const shadows = Shadows_Into_Light({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const amatic = Amatic_SC({ subsets: ["latin"], weight: "700", display: "swap", preload: false });

/** `font-family` de cada fuente elegible (una entrada por id de `HERO_TITLE_FONTS`). */
export const HERO_TITLE_FONT_FAMILIES: Record<HeroTitleFont, string> = {
  playfair: playfair.style.fontFamily,
  montserrat: montserrat.style.fontFamily,
  bebas: bebas.style.fontFamily,
  dancing: dancing.style.fontFamily,
  pacifico: pacifico.style.fontFamily,
  greatvibes: greatvibes.style.fontFamily,
  caveat: caveat.style.fontFamily,
  cormorant: cormorant.style.fontFamily,
  abril: abril.style.fontFamily,
  oswald: oswald.style.fontFamily,
  raleway: raleway.style.fontFamily,
  anton: anton.style.fontFamily,
  satisfy: satisfy.style.fontFamily,
  sacramento: sacramento.style.fontFamily,
  allura: allura.style.fontFamily,
  kaushan: kaushan.style.fontFamily,
  lobster: lobster.style.fontFamily,
  marker: marker.style.fontFamily,
  shadows: shadows.style.fontFamily,
  amatic: amatic.style.fontFamily,
};

/** Estilo del `<h1>` de la portada; `undefined` = la fuente de la plantilla. */
export function heroTitleFontStyle(id: HeroTitleFont | null | undefined): CSSProperties | undefined {
  return heroTitleFontStyleFrom(id, HERO_TITLE_FONT_FAMILIES);
}
