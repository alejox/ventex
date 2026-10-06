"use client";

import { BUSINESS_ICONS, MODULE_ICONS } from "@/app/assets/icons/BusinessIcons";
import {
  MODULES_BY_TYPE,
  REGISTER_BUSINESS_OPTIONS,
  type BusinessType,
  type Modules,
} from "@/config/business";
import { BUSINESS_COPY } from "@/components/LandingBusinessCopy";

/**
 * Tarjetas de rubro del registro y del onboarding: mismas palabras que la
 * landing (`BUSINESS_COPY`), una línea de qué resuelve cada una y `aria-pressed`
 * para que un lector de pantalla diga cuál está elegida (B20). Qué rubros se
 * ofrecen sigue saliendo de `REGISTER_BUSINESS_OPTIONS`.
 */
export function BusinessTypeCards({
  value,
  onChange,
  surface = "low",
}: {
  value: string;
  onChange: (type: BusinessType) => void;
  /** Fondo de las tarjetas sin elegir: el modal ya va sobre `low`. */
  surface?: "low" | "lowest";
}) {
  const idle =
    surface === "low"
      ? "bg-surface-container-low border-outline-variant/15 hover:bg-surface-container hover:border-outline-variant/30"
      : "bg-surface-container-lowest border-outline-variant/15 hover:bg-surface-container hover:border-outline-variant/30";

  return (
    <div role="group" aria-label="Tipo de negocio" className="space-y-3">
      {REGISTER_BUSINESS_OPTIONS.map((option) => {
        const selected = value === option.id;
        const copy = BUSINESS_COPY[option.id];
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`w-full rounded-[20px] border px-5 py-4 flex items-center gap-4 text-left transition-all duration-300 ${
              selected
                ? "bg-primary/5 border-primary ring-1 ring-primary/50"
                : idle
            }`}
          >
            <span
              className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center border transition-all duration-300 ${
                selected
                  ? "bg-primary border-primary text-on-primary shadow-md"
                  : "bg-surface-container-highest border-outline-variant/20 text-on-surface-variant"
              }`}
              aria-hidden
            >
              {BUSINESS_ICONS[option.id]}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[15px] font-semibold transition-colors ${
                  selected ? "text-primary" : "text-on-surface"
                }`}
              >
                {copy.label}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-on-surface-variant">
                {copy.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Herramientas opcionales del rubro, ya con los valores recomendados. Se muestran
 * como un resumen ("Incluye: Citas · Servicios · …") con un "Personalizar" que
 * despliega los interruptores: los valores por defecto sirven a casi todos, así
 * que elegirlos no es un paso obligatorio (B8).
 */
export function ModulePicker({
  businessType,
  modules,
  onChange,
  idPrefix,
}: {
  businessType: BusinessType | "";
  modules: Modules;
  onChange: (modules: Modules) => void;
  idPrefix: string;
}) {
  const options = businessType ? (MODULES_BY_TYPE[businessType] ?? []) : [];
  if (options.length === 0) return null;

  const active = options.filter((m) => !m.comingSoon && modules[m.id]);
  const summary = active.length > 0 ? active.map((m) => m.label).join(" · ") : "Solo lo esencial";

  return (
    <details className="group rounded-[20px] border border-outline-variant/15 bg-surface-container-lowest">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[20px] px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[11px] font-bold tracking-wide text-primary uppercase">
            Herramientas incluidas
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-on-surface">{summary}</span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-primary">
          <span className="group-open:hidden">Personalizar</span>
          <span className="hidden group-open:inline">Listo</span>
        </span>
      </summary>
      <ul className="space-y-2 px-4 pb-4">
        {options.map((mod) => {
          const isOn = !mod.comingSoon && !!modules[mod.id];
          const descId = `${idPrefix}-mod-${mod.id}`;
          return (
            <li
              key={mod.id}
              className={`flex items-start gap-3 rounded-2xl border p-3 transition-colors ${
                isOn ? "border-primary/40 bg-primary/5" : "border-outline-variant/10"
              } ${mod.comingSoon ? "opacity-70" : ""}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                  isOn
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant/20 bg-surface-container-highest text-on-surface-variant"
                }`}
                aria-hidden
              >
                {MODULE_ICONS[mod.id]}
              </span>
              <span className="min-w-0 flex-1">
                <h3 className="text-[14px] font-bold text-on-surface">{mod.label}</h3>
                <p id={descId} className="text-[12px] leading-relaxed text-on-surface-variant">
                  {mod.description}
                </p>
              </span>
              {mod.comingSoon ? (
                <span className="shrink-0 rounded-full border border-outline-variant/20 bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold tracking-wide text-on-surface-variant uppercase">
                  Próximamente
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Activar ${mod.label}`}
                  aria-describedby={descId}
                  aria-pressed={isOn}
                  onClick={() => onChange({ ...modules, [mod.id]: !modules[mod.id] })}
                  className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    isOn ? "bg-primary" : "border border-outline-variant/20 bg-surface-container-highest"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
                      isOn ? "left-[22px]" : "left-[2px]"
                    }`}
                  />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
