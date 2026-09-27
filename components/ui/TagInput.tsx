"use client";

import { useState } from "react";
import { addTags } from "@/lib/tags";

interface TagInputProps {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  /** Texto cuando la lista está vacía (debajo del campo). */
  emptyHint?: string;
  /** Marca el campo con error (p. ej. una lista obligatoria que quedó vacía). */
  invalid?: boolean;
}

/**
 * Lista de etiquetas editable (chips). Se agrega con Enter, coma o el botón
 * "Agregar"; pegar "A, B, C" crea tres. Backspace en vacío quita la última.
 *
 * Lo escrito y no agregado se agrega al salir del campo: quien escribe un
 * valor y va directo a "Guardar" no lo pierde. Las reglas (repetidos, vacíos,
 * separadores) están en `lib/tags.ts`.
 */
export function TagInput({
  id,
  values,
  onChange,
  placeholder = "Escribí y presioná Enter",
  addLabel = "Agregar",
  emptyHint,
  invalid = false,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const commit = (raw: string) => {
    if (!raw.trim()) return;
    const { values: next, duplicates } = addTags(values, raw);
    if (next.length !== values.length) onChange(next);
    setNotice(duplicates.length > 0 ? `“${duplicates[0]}” ya está en la lista.` : null);
    setDraft("");
  };

  const remove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
    setNotice(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      // Enter adentro de un <form> lo enviaría: acá solo agrega.
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      remove(values.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-xl border bg-surface-container-lowest p-2 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary ${
          invalid ? "border-error" : "border-outline-variant/30"
        }`}
      >
        {values.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-sm font-semibold text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Quitar ${tag}`}
              className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="h-3 w-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,;\n]/.test(text)) {
              e.preventDefault();
              commit(draft + text);
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={values.length === 0 ? placeholder : "Agregar otro…"}
          className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
        />
        <button
          type="button"
          // mousedown + preventDefault: el input no pierde el foco, así se
          // puede seguir cargando valores uno detrás de otro.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commit(draft)}
          disabled={!draft.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-dim disabled:opacity-40"
        >
          {addLabel}
        </button>
      </div>
      {notice ? (
        <p className="text-xs font-semibold text-error">{notice}</p>
      ) : values.length === 0 && emptyHint ? (
        <p className="text-xs text-on-surface-variant">{emptyHint}</p>
      ) : null}
    </div>
  );
}
