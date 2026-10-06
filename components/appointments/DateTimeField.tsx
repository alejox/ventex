"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, X } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { AppointmentTimeInput } from "./AppointmentTimeInput";
import { formatDateOnly } from "@/lib/date";
import { formatDuration } from "@/lib/duration";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";

export interface DateTimeValue {
  date: string;
  start: string;
  end: string;
}

const toMinutes = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (total: number) => {
  const clamped = Math.min(Math.max(total, 0), 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};

/** Solo la primera letra: `capitalize` de CSS también sube "de" ("7 De Octubre"). */
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const QUICK_DURATIONS = [30, 45, 60, 90, 120];

/**
 * Fecha y hora de la cita en UN solo campo.
 *
 * El formulario mostraba el calendario del mes entero y seis desplegables de
 * hora, y eso ocupaba más que todo el resto de la cita junta. Ahora es una
 * línea con el resumen ("miércoles 7 de octubre · 3:00 PM – 3:30 PM") que abre
 * un diálogo —el mismo gesto de la reserva pública— donde se elige el día en el
 * calendario y las horas. Los cambios se aplican al pulsar «Listo», así que
 * cerrar sin confirmar no altera la cita.
 */
export function DateTimeField({ value, format, onChange }: { value: DateTimeValue; format: TimeFormat; onChange: (next: DateTimeValue) => void }) {
  const [open, setOpen] = useState(false);
  const duration = Math.max(toMinutes(value.end) - toMinutes(value.start), 0);

  return (
    <div className="space-y-1.5">
      <span className="block text-[13px] font-semibold text-on-surface">Fecha y hora *</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays size={18} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-on-surface">
            {value.date ? upperFirst(formatDateOnly(value.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) : "Elegir fecha"}
          </span>
          <span className="block text-xs text-on-surface-variant">
            {formatAppointmentTime(value.start, format)} – {formatAppointmentTime(value.end, format)}
            {duration > 0 ? ` · ${formatDuration(duration)}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-primary">Cambiar<ChevronRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></span>
      </button>
      {open ? <DateTimeDialog initial={value} format={format} onClose={() => setOpen(false)} onApply={(next) => { onChange(next); setOpen(false); }} /> : null}
    </div>
  );
}

function DateTimeDialog({ initial, format, onClose, onApply }: { initial: DateTimeValue; format: TimeFormat; onClose: () => void; onApply: (next: DateTimeValue) => void }) {
  const [draft, setDraft] = useState(initial);
  const closeRef = useRef<HTMLButtonElement>(null);
  const duration = toMinutes(draft.end) - toMinutes(draft.start);
  const invalid = !draft.date || duration <= 0;

  useEffect(() => { closeRef.current?.focus(); }, []);

  // Cambiar la hora de inicio conserva la duración: mover una cita de las 3 a
  // las 4 no debería dejar la hora de fin atrás y romper el rango.
  const setStart = (start: string) =>
    setDraft((current) => {
      const keep = Math.max(toMinutes(current.end) - toMinutes(current.start), 30);
      return { ...current, start, end: toTime(toMinutes(start) + keep) };
    });

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      // El formulario de afuera cierra con Escape y atrapa Tab: lo de adentro no sube.
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Elegir fecha y hora" className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-container shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/10 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-on-surface">¿Cuándo?</h3>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {draft.date ? upperFirst(formatDateOnly(draft.date, { weekday: "long", day: "numeric", month: "long" })) : "Elige un día"} · {formatAppointmentTime(draft.start, format)} – {formatAppointmentTime(draft.end, format)}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-high"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <DatePicker value={draft.date} onChange={(date) => setDraft((current) => ({ ...current, date }))} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppointmentTimeInput label="Hora de inicio" value={draft.start} format={format} onChange={setStart} />
            <AppointmentTimeInput label="Hora de fin" value={draft.end} format={format} onChange={(end) => setDraft((current) => ({ ...current, end }))} />
          </div>

          <div>
            <span className="text-xs font-semibold text-on-surface-variant">Duración</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_DURATIONS.map((minutes) => (
                <button key={minutes} type="button" aria-pressed={duration === minutes} onClick={() => setDraft((current) => ({ ...current, end: toTime(toMinutes(current.start) + minutes) }))} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${duration === minutes ? "border-primary bg-primary/10 text-primary" : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"}`}>{formatDuration(minutes)}</button>
              ))}
            </div>
            {duration <= 0 ? <p role="alert" className="mt-2 text-xs text-error">La hora de fin debe ser después de la de inicio.</p> : null}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-outline-variant/10 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-outline-variant/30 px-5 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-low">Cancelar</button>
          <button type="button" disabled={invalid} onClick={() => onApply(draft)} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dim disabled:opacity-50">Listo</button>
        </div>
      </div>
    </div>
  );
}
