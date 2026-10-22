"use client";

import { useId } from "react";

/**
 * Título principal de la portada. Vacío NO es "sin título": la portada usa el
 * nombre del negocio (pestaña Negocio). No se precarga ese nombre como valor,
 * porque guardarlo lo congelaría y cambiar el nombre después ya no llegaría a
 * la portada. En su lugar el campo muestra el nombre real y dice de dónde sale.
 */
export function HeroTitleField({
  value,
  siteName,
  onChange,
  inputClassName = "",
}: {
  value: string | null;
  siteName: string;
  onChange: (title: string | null) => void;
  inputClassName?: string;
}) {
  const hintId = useId();
  const custom = Boolean(value);

  return (
    <div>
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">Título principal</span>
        <input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          placeholder={siteName}
          aria-describedby={hintId}
          className={inputClassName}
        />
      </label>
      <p id={hintId} className="mt-1.5 text-xs text-on-surface-variant">
        {custom ? (
          <>
            Título propio para la portada.{" "}
            <button type="button" onClick={() => onChange(null)} className="font-semibold text-primary hover:underline">
              Usar el nombre del negocio
            </button>
          </>
        ) : (
          <>
            Se muestra el nombre de tu negocio, «{siteName}». Escribe aquí si quieres otro título; el nombre se cambia en la pestaña Negocio.
          </>
        )}
      </p>
    </div>
  );
}
