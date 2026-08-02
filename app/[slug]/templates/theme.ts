import type { CSSProperties } from "react";
import type { SiteTemplate } from "@/services/public-site.types";

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
}

export const SITE_PALETTES: Record<SiteTemplate, SitePalette> = {
  clasico: {
    "--site-bg": "#f5efe6",
    "--site-surface": "#fffdfa",
    "--site-surface-alt": "#efe4d5",
    "--site-text": "#2b2118",
    "--site-muted": "#7a6a58",
    "--site-accent": "#8a5a2b",
    "--site-on-accent": "#fffdfa",
    "--site-border": "#ddcdb8",
    "--site-radius": "4px",
    "--site-heading-font": "Georgia, 'Times New Roman', serif",
  },
  moderno: {
    "--site-bg": "#0c0d12",
    "--site-surface": "#16181f",
    "--site-surface-alt": "#1f222c",
    "--site-text": "#f2f3f7",
    "--site-muted": "#9aa0b0",
    "--site-accent": "#c8f450",
    "--site-on-accent": "#0c0d12",
    "--site-border": "#2a2e3a",
    "--site-radius": "18px",
    "--site-heading-font": "var(--font-plus-jakarta-sans), system-ui, sans-serif",
  },
  minimal: {
    "--site-bg": "#ffffff",
    "--site-surface": "#ffffff",
    "--site-surface-alt": "#f6f6f6",
    "--site-text": "#141414",
    "--site-muted": "#767676",
    "--site-accent": "#141414",
    "--site-on-accent": "#ffffff",
    "--site-border": "#e6e6e6",
    "--site-radius": "0px",
    "--site-heading-font": "var(--font-plus-jakarta-sans), system-ui, sans-serif",
  },
};

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function whatsappHref(phone: string, message: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
