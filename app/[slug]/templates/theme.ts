import type { CSSProperties } from "react";
import { heroOverlayLayers } from "@/services/public-site.types";
import type { LandingConfig, SiteTemplate } from "@/services/public-site.types";

/**
 * Palette per template.
 *
 * These are deliberately NOT the app's Material-3 tokens. The dashboard tokens
 * describe Ventex's own chrome; a customer-facing site belongs to the business,
 * and the whole point of offering three templates is that they do not look
 * alike. Each palette is published as CSS variables on the template's wrapper,
 * so every shared section below styles itself from `var(--site-*)` and knows
 * nothing about which template it is rendering inside.
 *
 * The root layout forces a `dark` class and `data-theme` from localStorage for
 * the app shell. Every value here is explicit for that reason: a visitor's
 * saved dashboard theme must never repaint a business's public page.
 */

export interface SitePalette extends CSSProperties {
  "--site-bg": string;
  "--site-surface": string;
  "--site-surface-alt": string;
  "--site-text": string;
  "--site-muted": string;
  /**
   * Qué color va ENCIMA de `--site-surface` / `--site-surface-alt`.
   *
   * `--site-text` y `--site-muted` son los del fondo de la página
   * (`--site-bg`), y hasta acá se usaban también sobre las superficies dando por
   * sentado que las dos son del mismo tono. Qutter rompe eso a propósito —fondo
   * blanco, tarjetas negras— y el resultado era `#111` sobre `#1a1a1a`: el
   * formulario de reserva y el nombre de cada producto quedaban invisibles.
   *
   * Los parches puntuales con hex ya se habían escrito tres veces (las tarjetas
   * de servicio, el título de la sección de reserva, su bajada) y cada isla
   * oscura nueva volvía a empezar de cero. Declararlo en la paleta hace que la
   * pregunta se conteste una vez por plantilla, no una vez por componente.
   *
   * En las paletas cuyo fondo y superficies son del mismo tono, estos tres
   * valores son idénticos a `--site-text` / `--site-muted` / `--site-border`.
   * Esa igualdad es lo que vuelve seguro usarlos en el CSS compartido.
   */
  "--site-on-surface": string;
  "--site-on-surface-muted": string;
  "--site-on-surface-border": string;
  "--site-accent": string;
  "--site-on-accent": string;
  "--site-border": string;
  "--site-radius": string;
  "--site-heading-font": string;
  "--site-body-font": string;
  "--site-shadow": string;
  /**
   * Intensidad del velo de la portada, 0–1. Se publica SOLO cuando el negocio
   * movió el control: sin la variable, cada velo cae a su propio valor de
   * diseño con el respaldo de `var()`, y la plantilla se ve como siempre.
   */
  "--site-hero-overlay"?: string;
  /**
   * El `filter` de la foto de portada, ya escrito (`brightness(.4)`). Es el tramo
   * del control que empieza cuando el velo ya no da más de sí.
   *
   * Viaja la declaración entera y no el número para poder NO publicarla: el
   * respaldo del `var()` es `none`, y así una portada que nadie oscureció no
   * arrastra un `filter` identidad que igual crearía contexto de apilamiento
   * sobre unos `z-index` negativos que hoy funcionan.
   */
  "--site-hero-dim"?: string;
}

export const SITE_PALETTES: Record<SiteTemplate, SitePalette> = {
  rasm: {
    "--site-bg": "#f8f3ef",
    "--site-surface": "#ffffff",
    "--site-surface-alt": "#f3e7e0",
    "--site-text": "#0d0d0d",
    "--site-muted": "#6d625d",
    "--site-on-surface": "#0d0d0d",
    "--site-on-surface-muted": "#6d625d",
    "--site-on-surface-border": "#e8cdbf",
    "--site-accent": "#b77b65",
    "--site-on-accent": "#33150c",
    "--site-border": "#e8cdbf",
    "--site-radius": "2px",
    "--site-heading-font": "'Cormorant Garamond', Iowan Old Style, Baskerville, Georgia, serif",
    "--site-body-font": "Avenir Next, Avenir, var(--font-plus-jakarta-sans), sans-serif",
    "--site-shadow": "0 24px 70px rgba(70, 42, 29, 0.12)",
  },
  fallspa: {
    "--site-bg": "#ffffff",
    "--site-surface": "#ffffff",
    "--site-surface-alt": "#eee5f0",
    "--site-text": "#141b22",
    "--site-muted": "#687078",
    "--site-on-surface": "#141b22",
    "--site-on-surface-muted": "#687078",
    "--site-on-surface-border": "#eadde8",
    "--site-accent": "#ff4f9d",
    "--site-on-accent": "#3d0a24",
    "--site-border": "#eadde8",
    "--site-radius": "28px",
    "--site-heading-font": "'Playfair Display', Georgia, 'Times New Roman', serif",
    "--site-body-font": "Avenir Next, Avenir, var(--font-plus-jakarta-sans), sans-serif",
    "--site-shadow": "0 24px 70px rgba(98, 72, 96, 0.11)",
  },
  qutter: {
    "--site-bg": "#ffffff",
    "--site-surface": "#1a1a1a",
    "--site-surface-alt": "#242424",
    "--site-text": "#111111",
    // #777777 medía 4.48:1 sobre el blanco del fondo y el mínimo son 4.5.
    "--site-muted": "#6b6b6b",
    "--site-on-surface": "#f2f2f2",
    "--site-on-surface-muted": "#a8a8a8",
    "--site-on-surface-border": "#666666",
    "--site-accent": "#d6a354",
    "--site-on-accent": "#111111",
    "--site-border": "#dedede",
    "--site-radius": "0px",
    "--site-heading-font": "Oswald, Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    "--site-body-font": "Arial, var(--font-plus-jakarta-sans), sans-serif",
    "--site-shadow": "0 24px 70px rgba(0, 0, 0, 0.35)",
  },
  barberia: {
    "--site-bg": "#171715",
    "--site-surface": "#22221f",
    "--site-surface-alt": "#2c2b27",
    "--site-text": "#f4f0e7",
    "--site-muted": "#b9b5aa",
    "--site-on-surface": "#f4f0e7",
    "--site-on-surface-muted": "#b9b5aa",
    "--site-on-surface-border": "#434139",
    "--site-accent": "#c5a572",
    "--site-on-accent": "#1e1b16",
    "--site-border": "#434139",
    "--site-radius": "2px",
    "--site-heading-font": "Iowan Old Style, Baskerville, Georgia, serif",
    "--site-body-font": "var(--font-plus-jakarta-sans), Arial, sans-serif",
    "--site-shadow": "none",
  },
  "barberia-artesanal": {
    "--site-bg": "#fcf9f7",
    "--site-surface": "#ffffff",
    "--site-surface-alt": "#f0e7e1",
    "--site-text": "#151514",
    "--site-muted": "#6d5f59",
    "--site-on-surface": "#151514",
    "--site-on-surface-muted": "#6d5f59",
    "--site-on-surface-border": "#e2d5cd",
    "--site-accent": "#552d25",
    "--site-on-accent": "#fcf9f7",
    "--site-border": "#e2d5cd",
    "--site-radius": "4px",
    "--site-heading-font": "Lora, Georgia, 'Times New Roman', serif",
    "--site-body-font": "var(--font-plus-jakarta-sans), Arial, sans-serif",
    "--site-shadow": "0 18px 50px rgba(85, 45, 37, 0.10)",
  },
  "barberia-urbana": {
    "--site-bg": "#ffffff",
    "--site-surface": "#f9f9f9",
    "--site-surface-alt": "#eef2ef",
    "--site-text": "#333333",
    "--site-muted": "#646f70",
    "--site-on-surface": "#333333",
    "--site-on-surface-muted": "#646f70",
    "--site-on-surface-border": "#d7d7d7",
    "--site-accent": "#47705a",
    "--site-on-accent": "#ffffff",
    "--site-border": "#d7d7d7",
    "--site-radius": "0px",
    "--site-heading-font": "'Arial Narrow', Arial, sans-serif",
    "--site-body-font": "Arial, var(--font-plus-jakarta-sans), sans-serif",
    "--site-shadow": "0 14px 40px rgba(51, 51, 51, 0.08)",
  },
};

export function paletteFor(config: LandingConfig): SitePalette {
  const palette = { ...SITE_PALETTES[config.template] };
  if (config.colors.primary && /^#[0-9a-f]{6}$/i.test(config.colors.primary)) {
    palette["--site-accent"] = config.colors.primary;
  }
  if (config.hero.overlay !== null) {
    const { veil, brightness } = heroOverlayLayers(config.hero.overlay);
    palette["--site-hero-overlay"] = String(veil);
    if (brightness < 1) palette["--site-hero-dim"] = `brightness(${brightness})`;
  }
  return palette;
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * `api.whatsapp.com/send` y no el acortador `wa.me`: wa.me reemplaza todo
 * emoji por U+FFFD al redirigir (evidencia en `whatsappUrl`, config/contact.ts).
 * Hoy este mensaje no lleva emojis, pero el dia que lleve uno fallaria igual.
 */
export function whatsappHref(phone: string, message: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
}
