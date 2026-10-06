"use client";

import { useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@/app/assets/icons/DashboardIcons";
import { parseDateOnly, toISODate } from "@/lib/date";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Calendario mensual siempre visible para elegir un día.
 * Trabaja con "YYYY-MM-DD" (día de calendario, sin zona horaria).
 */
export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const initial = value ? parseDateOnly(value) : new Date();
  const [view, setView] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );

  const today = toISODate();
  const year = view.getFullYear();
  const month = view.getMonth();
  // Semana que arranca en lunes.
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const title = view.toLocaleDateString("es", { month: "long", year: "numeric" });
  const shift = (delta: number) => setView(new Date(year, month + delta, 1));

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Mes anterior"
          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize text-on-surface">{title}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Mes siguiente"
          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[11px] font-semibold text-on-surface-variant">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const iso = toISODate(new Date(year, month, day));
          const selected = iso === value;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              aria-pressed={selected}
              className={`aspect-square rounded-lg text-sm transition-colors ${
                selected
                  ? "bg-primary font-bold text-on-primary"
                  : iso === today
                    ? "border border-primary font-semibold text-primary hover:bg-surface-container-high"
                    : "text-on-surface hover:bg-surface-container-high"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
