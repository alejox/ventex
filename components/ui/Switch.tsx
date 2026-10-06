"use client";

import { useId } from "react";
import type { ReactNode } from "react";

interface SwitchBaseProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Texto de ayuda bajo la etiqueta (`aria-describedby`). */
  description?: ReactNode;
  id?: string;
  className?: string;
}

/**
 * Nombre accesible obligatorio, por una de tres vías: `label` visible (lo más
 * común), `aria-labelledby` apuntando a un título que ya está en pantalla, o
 * `aria-label` cuando no hay texto visible al lado.
 */
export type SwitchProps = SwitchBaseProps &
  (
    | { label: ReactNode; "aria-labelledby"?: never; "aria-label"?: never }
    | { label?: never; "aria-labelledby": string; "aria-label"?: never }
    | { label?: never; "aria-labelledby"?: never; "aria-label": string }
  );

/**
 * Interruptor de la plataforma: `<button role="switch">` con `aria-checked`.
 *
 * El área clicable es de 40px de alto aunque la pista mida 24px (el `before:`
 * invisible la agranda), y con `label` toda la fila es clicable.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  description,
  id,
  className = "",
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const labelId = `${switchId}-label`;
  const descriptionId = `${switchId}-desc`;

  const control = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-labelledby={label ? labelId : ariaLabelledBy}
      aria-label={ariaLabel}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-surface-container-highest"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );

  if (!label && !description) {
    return <span className={`inline-flex ${className}`}>{control}</span>;
  }

  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {label && (
          <label
            id={labelId}
            htmlFor={switchId}
            className={`text-sm font-semibold text-on-surface ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            {label}
          </label>
        )}
        {description && (
          <p id={descriptionId} className="mt-0.5 text-xs text-on-surface-variant">
            {description}
          </p>
        )}
      </div>
      {control}
    </div>
  );
}
