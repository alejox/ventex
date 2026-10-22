"use client";

import { useId } from "react";
import { Select } from "@/components/ui/Select";
import {
  HERO_TITLE_FONTS,
  HERO_TITLE_TEMPLATE_FONT_LABEL,
  heroTitleFontGroups,
  heroTitleFontOrNull,
  heroTitleFontStyleFrom,
  type HeroTitleFont,
} from "@/lib/hero-title-fonts";

type Families = Partial<Record<HeroTitleFont, string>>;

/**
 * Hijos del `Select`: "De la plantilla" primero y un `<optgroup>` por grupo,
 * cada opción escrita en su propia fuente. Exportado para testear las opciones
 * sin abrir el desplegable (que se monta en un portal solo al abrirse).
 */
export function heroTitleFontSelectOptions(families: Families) {
  return [
    <option key="template" value="">{HERO_TITLE_TEMPLATE_FONT_LABEL}</option>,
    ...heroTitleFontGroups().map(({ group, fonts }) => (
      <optgroup key={group} label={group}>
        {fonts.map((font) => (
          <option key={font.id} value={font.id} style={families[font.id] ? { fontFamily: families[font.id] } : undefined}>
            {`${font.label} · ${font.name}`}
          </option>
        ))}
      </optgroup>
    )),
  ];
}

/**
 * Selector de la fuente del título de la portada: el `Select` de la plataforma
 * (con buscador y grupos) y una vista previa con la fuente elegida. Las
 * familias llegan por prop (las carga `app/[slug]/templates/hero-fonts.ts` con
 * `next/font`) para que el componente siga siendo renderizable en los tests.
 */
export function HeroTitleFontField({
  value,
  sample,
  families,
  onChange,
}: {
  value: HeroTitleFont | null;
  sample: string;
  families: Families;
  onChange: (font: HeroTitleFont | null) => void;
}) {
  const hintId = useId();
  const text = sample.trim() || "Aa";
  const current = HERO_TITLE_FONTS.find((font) => font.id === value);
  const caption = current ? `${current.label} · ${current.name}` : HERO_TITLE_TEMPLATE_FONT_LABEL;

  return (
    <div className="space-y-2">
      <Select
        label="Fuente del título principal"
        value={value ?? ""}
        onChange={(event) => onChange(heroTitleFontOrNull(event.target.value))}
        searchable
        searchPlaceholder="Buscar fuente…"
        aria-describedby={hintId}
      >
        {heroTitleFontSelectOptions(families)}
      </Select>
      <div className="flex min-h-[5.75rem] flex-col justify-center rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3">
        <span
          data-hero-font-preview=""
          className="line-clamp-2 break-words text-[1.875rem] leading-tight text-on-surface"
          style={current ? heroTitleFontStyleFrom(current.id, families) : undefined}
        >
          {text}
        </span>
        <p className="mt-1 text-xs text-on-surface-variant">{caption}</p>
      </div>
      <p id={hintId} className="text-xs text-on-surface-variant">
        Cambia la letra del título de la portada. El resto del sitio mantiene la de la plantilla.
      </p>
    </div>
  );
}
