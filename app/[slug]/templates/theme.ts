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
  "--site-body-font": string;
  "--site-shadow": string;
}

export const SITE_PALETTES: Record<SiteTemplate, SitePalette> = {
  clasico: {
    "--site-bg": "#f3eadb",
    "--site-surface": "#fffaf1",
    "--site-surface-alt": "#e7d9c4",
    "--site-text": "#2d2019",
    "--site-muted": "#746256",
    "--site-accent": "#8f2f2a",
    "--site-on-accent": "#fffaf1",
    "--site-border": "#ccbba5",
    "--site-radius": "12px",
    "--site-heading-font": "Iowan Old Style, Baskerville, Georgia, 'Times New Roman', serif",
    "--site-body-font": "Avenir Next, Avenir, var(--font-plus-jakarta-sans), sans-serif",
    "--site-shadow": "0 24px 70px rgba(70, 42, 29, 0.14)",
  },
  moderno: {
    "--site-bg": "#10162f",
    "--site-surface": "#192143",
    "--site-surface-alt": "#222c55",
    "--site-text": "#f7f3ed",
    "--site-muted": "#b8bfd7",
    "--site-accent": "#ff6b4a",
    "--site-on-accent": "#15152a",
    "--site-border": "#35416e",
    "--site-radius": "22px",
    "--site-heading-font": "var(--font-plus-jakarta-sans), system-ui, sans-serif",
    "--site-body-font": "var(--font-plus-jakarta-sans), system-ui, sans-serif",
    "--site-shadow": "0 28px 80px rgba(3, 7, 25, 0.36)",
  },
  barberia: {
    "--site-bg": "#171715",
    "--site-surface": "#22221f",
    "--site-surface-alt": "#2c2b27",
    "--site-text": "#f4f0e7",
    "--site-muted": "#b9b5aa",
    "--site-accent": "#c5a572",
    "--site-on-accent": "#1e1b16",
    "--site-border": "#434139",
    "--site-radius": "2px",
    "--site-heading-font": "Iowan Old Style, Baskerville, Georgia, serif",
    "--site-body-font": "var(--font-plus-jakarta-sans), Arial, sans-serif",
    "--site-shadow": "none",
  },
  minimal: {
    "--site-bg": "#f7f4ef",
    "--site-surface": "#fffdf9",
    "--site-surface-alt": "#ebe5de",
    "--site-text": "#292527",
    "--site-muted": "#746d70",
    "--site-accent": "#765d78",
    "--site-on-accent": "#ffffff",
    "--site-border": "#ddd5cf",
    "--site-radius": "24px",
    "--site-heading-font": "Avenir Next, Avenir, var(--font-plus-jakarta-sans), sans-serif",
    "--site-body-font": "Avenir Next, Avenir, var(--font-plus-jakarta-sans), sans-serif",
    "--site-shadow": "0 20px 60px rgba(58, 45, 53, 0.09)",
  },
};

/**
 * Colores para la MINIATURA del selector de diseño en Ajustes.
 *
 * Salen de las paletas reales de arriba y no de una copia a mano: cuando el
 * selector tenía sus propios hex, mostraba lima sobre casi negro para "Moderno"
 * mientras la plantilla pintaba coral sobre azul, y "Minimal" salía blanco y
 * negro cuando en realidad es crema con malva. El dueño elegía mirando una
 * miniatura que no se parecía a nada de lo que iba a publicar.
 *
 * `serif` no es un color pero viaja acá porque es LA diferencia que se ve
 * primero entre plantillas, y una miniatura de barras no puede mostrarla sola.
 */
export interface TemplatePreview {
  bg: string;
  accent: string;
  text: string;
  serif: boolean;
}

/**
 * Se DEDUCE de la familia real, no se marca a mano: la miniatura tiene que
 * seguir a la paleta aunque alguien cambie la tipografía de una plantilla sin
 * acordarse de este archivo. La última familia de la lista es la genérica, y
 * `sans-serif` termina en "serif" — de ahí que no alcance con un `endsWith`.
 */
const esSerif = (familia: string) => /(?:^|[\s,])serif\s*$/.test(familia);

export function templatePreview(template: SiteTemplate): TemplatePreview {
  const p = SITE_PALETTES[template];
  return {
    bg: String(p["--site-bg"]),
    accent: String(p["--site-accent"]),
    text: String(p["--site-text"]),
    serif: esSerif(String(p["--site-heading-font"])),
  };
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
