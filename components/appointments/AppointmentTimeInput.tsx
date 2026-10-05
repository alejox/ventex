"use client";

import type { TimeFormat } from "@/lib/time";

/** Explicit AM/PM controls; native time inputs follow the browser's locale. */
export function AppointmentTimeInput({ label, value, onChange, format }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  format: TimeFormat;
}) {
  const [hour, minute] = value.split(":").map(Number);
  const update = (h: number, m: number) => onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  const style = "min-w-0 w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-1 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary";
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-[13px] font-semibold text-on-surface">{label} *</legend>
      <div className={`grid gap-1 ${format === "12" ? "grid-cols-3" : "grid-cols-2"}`}>
        <select aria-label={`${label}: hora`} className={style} value={format === "12" ? hour % 12 || 12 : hour} onChange={(e) => {
          const selected = Number(e.target.value);
          update(format === "12" ? selected % 12 + (hour >= 12 ? 12 : 0) : selected, minute);
        }}>
          {Array.from({ length: format === "12" ? 12 : 24 }, (_, i) => format === "12" ? i + 1 : i).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
        </select>
        <select aria-label={`${label}: minutos`} className={style} value={minute} onChange={(e) => update(hour, Number(e.target.value))}>
          {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}</option>)}
        </select>
        {format === "12" && <select aria-label={`${label}: AM o PM`} className={style} value={hour >= 12 ? "PM" : "AM"} onChange={(e) => update(hour % 12 + (e.target.value === "PM" ? 12 : 0), minute)}>
          <option value="AM">AM</option><option value="PM">PM</option>
        </select>}
      </div>
    </fieldset>
  );
}
