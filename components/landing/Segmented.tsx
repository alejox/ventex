"use client";

import { useId } from "react";

/** Segmented single-choice control (radiogroup), same look as the rest of the editor. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="space-y-1.5">
      <span id={labelId} className="block text-xs font-bold text-on-surface-variant">
        {label}
      </span>
      <div className={`grid gap-1 rounded-lg bg-surface-container p-1 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={`rounded-md px-2 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink ${
              value === option.id ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
