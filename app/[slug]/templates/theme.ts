import type { CSSProperties } from "react";
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
  "--site-accent": string;
  "--site-on-accent": string;
  "--site-border": string;
  "--site-radius": string;
  "--site-heading-font": string;
  "--site-body-font": string;
  "--site-shadow": string;
}

export const SITE_PALETTES: Record<SiteTemplate, SitePalette> = {
  rasm: {
    "--site-bg": "#f8f3ef",
    "--site-surface": "#ffffff",
    "--site-surface-alt": "#f3e7e0",
    "--site-text": "#0d0d0d",
    "--site-muted": "#6d625d",
    "--site-accent": "#b77b65",
    "--site-on-accent": "#ffffff",
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
    "--site-accent": "#ff4f9d",
    "--site-on-accent": "#ffffff",
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
    "--site-muted": "#777777",
    "--site-accent": "#d6a354",
    "--site-on-accent": "#111111",
    "--site-border": "#dedede",
    "--site-radius": "0px",
    "--site-heading-font": "Oswald, Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    "--site-body-font": "Arial, var(--font-plus-jakarta-sans), sans-serif",
    "--site-shadow": "0 24px 70px rgba(0, 0, 0, 0.35)",
  },
};

export function paletteFor(config: LandingConfig): SitePalette {
  const palette = { ...SITE_PALETTES[config.template] };
  if (config.colors.primary && /^#[0-9a-f]{6}$/i.test(config.colors.primary)) {
    palette["--site-accent"] = config.colors.primary;
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
