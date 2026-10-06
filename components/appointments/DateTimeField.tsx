"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Clock, X } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { AppointmentTimeInput } from "./AppointmentTimeInput";
import { formatDateOnly } from "@/lib/date";
import { isTaken, type BusyAppointment } from "@/lib/appointment-availability";
import { formatDuration } from "@/lib/duration";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import { isWithinOpenHours, openStartSlots, quarterHourSlots, weekdayOf, type OpeningHour } from "@/lib/appointment-hours";

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

/**
 * Inicios sugeridos: los del horario de atención de ese día (cada 30 min), o
 * de 6:00 a 22:00 si el negocio no cargó horarios. "Otra hora…" abre el día
 * entero cada 15 min para lo que cae fuera.
 */
const ALL_QUARTERS = quarterHourSlots();
const slotsFor = (hours: OpeningHour[] | null | undefined, date: string) =>
  openStartSlots(hours ?? null, date ? weekdayOf(date) : new Date().getDay());

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
/**
 * Con esto el selector sabe qué horas están ocupadas: de la persona elegida o,
 * si no hay ninguna, de todo el equipo. `loadBusy` trae las citas del día que se
 * está mirando (que puede no ser el de la cita).
 */
export interface Availability {
  staffId: string | null;
  staffName?: string;
  pool: string[];
  excludeId?: string | null;
  loadBusy: (date: string) => Promise<BusyAppointment[]>;
}

export interface DateTimeFieldProps {
  value: DateTimeValue;
  format: TimeFormat;
  onChange: (next: DateTimeValue) => void;
  availability?: Availability;
  /** Horario de atención (`business_hours`): qué horas se ofrecen. */
  hours?: OpeningHour[] | null;
}

export function DateTimeField({ value, format, onChange, availability, hours }: DateTimeFieldProps) {
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
      {open ? <DateTimeDialog initial={value} format={format} availability={availability} hours={hours} onClose={() => setOpen(false)} onApply={(next) => { onChange(next); setOpen(false); }} /> : null}
    </div>
  );
}

/**
 * El diálogo "¿Cuándo?" solo, sin el campo que lo abre: lo usa "Mover a…" de la
 * cita, que lo abre desde un menú y guarda al pulsar «Listo».
 */
export function DateTimeDialog({ initial, format, availability, hours, title = "¿Cuándo?", onClose, onApply }: { initial: DateTimeValue; format: TimeFormat; availability?: Availability; hours?: OpeningHour[] | null; title?: string; onClose: () => void; onApply: (next: DateTimeValue) => void }) {
  const [draft, setDraft] = useState(initial);
  const [timeOpen, setTimeOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const duration = toMinutes(draft.end) - toMinutes(draft.start);
  const [busy, setBusy] = useState<BusyAppointment[]>([]);

  useEffect(() => { closeRef.current?.focus(); }, []);

  // Las citas del día que se está mirando: cambian al elegir otro día.
  const loadBusy = availability?.loadBusy;
  useEffect(() => {
    if (!loadBusy || !draft.date) return;
    let stale = false;
    void loadBusy(draft.date).then((rows) => { if (!stale) setBusy(rows); });
    return () => { stale = true; };
  }, [loadBusy, draft.date]);

  const length = duration > 0 ? duration : 30;
  const taken = (start: string, end: string) =>
    availability ? isTaken(busy, { staffId: availability.staffId, pool: availability.pool }, start, end, availability.excludeId) : false;
  const slotTaken = (slot: string) => taken(slot, toTime(toMinutes(slot) + length));
  const conflict = availability && draft.date && duration > 0 && taken(draft.start, draft.end)
    ? availability.staffId
      ? `${availability.staffName ?? "Esa persona"} ya tiene una cita en ese horario.`
      : "No hay nadie disponible a esa hora."
    : null;
  const invalid = !draft.date || duration <= 0 || conflict !== null;
  const startSlots = slotsFor(hours, draft.date);
  // Fuera del horario no se bloquea (a veces se atiende a deshoras), se avisa.
  const outsideHours = Boolean(draft.date) && duration > 0 && !isWithinOpenHours(hours ?? null, weekdayOf(draft.date), toMinutes(draft.start), toMinutes(draft.end));

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
            <h3 className="text-lg font-bold text-on-surface">{title}</h3>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {draft.date ? upperFirst(formatDateOnly(draft.date, { weekday: "long", day: "numeric", month: "long" })) : "Elige un día"} · {formatAppointmentTime(draft.start, format)} – {formatAppointmentTime(draft.end, format)}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-high"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {/* Elegir un día abre «¿A qué hora?», igual que la reserva del sitio web. */}
          <DatePicker value={draft.date} onChange={(date) => { setDraft((current) => ({ ...current, date })); setTimeOpen(true); }} />

          <button type="button" onClick={() => setTimeOpen(true)} className="group flex w-full items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-left transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Clock size={17} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-on-surface-variant">Hora de inicio</span>
              <span className="block text-sm font-bold text-on-surface">{formatAppointmentTime(draft.start, format)}</span>
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-primary">Cambiar<ChevronRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></span>
          </button>

          <div>
            <span className="text-xs font-semibold text-on-surface-variant">Duración</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_DURATIONS.map((minutes) => (
                <button key={minutes} type="button" aria-pressed={duration === minutes} onClick={() => setDraft((current) => ({ ...current, end: toTime(toMinutes(current.start) + minutes) }))} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${duration === minutes ? "border-primary bg-primary/10 text-primary" : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"}`}>{formatDuration(minutes)}</button>
              ))}
            </div>
            {conflict ? <p role="alert" className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{conflict} Elige otra hora{availability?.staffId ? " u otra persona" : ""}.</p> : null}
            {!conflict && outsideHours ? <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-sm text-on-surface">Ese horario queda fuera del horario de atención del negocio.</p> : null}
            {duration > 0 ? (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm text-on-surface">
                <Clock size={15} aria-hidden="true" className="text-primary" />
                Termina a las <strong>{formatAppointmentTime(draft.end, format)}</strong>
                <span className="text-xs text-on-surface-variant">({formatDuration(duration)})</span>
              </p>
            ) : (
              <p role="alert" className="mt-2 text-xs text-error">La hora de fin debe ser después de la de inicio.</p>
            )}
          </div>

          {/* Para horas que no caen en la cuadrícula (9:10) o un fin a medida. */}
          <details className="rounded-xl border border-outline-variant/20 p-3" open={!ALL_QUARTERS.includes(draft.start) || duration <= 0}>
            <summary className="cursor-pointer text-xs font-semibold text-on-surface-variant">Ajustar horas exactas</summary>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AppointmentTimeInput label="Hora de inicio" value={draft.start} format={format} onChange={setStart} />
              <AppointmentTimeInput label="Hora de fin" value={draft.end} format={format} onChange={(end) => setDraft((current) => ({ ...current, end }))} />
            </div>
          </details>
        </div>

        {timeOpen ? <TimeDialog date={draft.date} start={draft.start} slots={startSlots} format={format} isTaken={availability ? slotTaken : undefined} onClose={() => setTimeOpen(false)} onPick={(slot) => { setStart(slot); setTimeOpen(false); }} /> : null}

        <div className="flex justify-end gap-3 border-t border-outline-variant/10 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-outline-variant/30 px-5 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-low">Cancelar</button>
          <button type="button" disabled={invalid} onClick={() => onApply(draft)} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dim disabled:opacity-50">Listo</button>
        </div>
      </div>
    </div>
  );
}

const PERIODS = [
  { id: "manana", label: "Mañana", from: 0, to: 12 * 60 },
  { id: "tarde", label: "Tarde", from: 12 * 60, to: 18 * 60 },
  { id: "noche", label: "Noche", from: 18 * 60, to: 24 * 60 },
] as const;

/**
 * «¿A qué hora?»: las horas en píldoras agrupadas por mañana, tarde y noche. Es
 * el mismo gesto del selector de la reserva en el sitio web: se elige el día en
 * el calendario y las horas aparecen aparte, sin una lista con scroll adentro.
 */
function TimeDialog({ date, start, slots, format, isTaken: taken, onClose, onPick }: { date: string; start: string; slots: string[]; format: TimeFormat; isTaken?: (slot: string) => boolean; onClose: () => void; onPick: (slot: string) => void }) {
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => { selected.current?.focus(); }, []);
  const offGrid = !slots.includes(start);
  // "Otra hora…" arranca abierto si la cita ya está fuera de las sugeridas
  // (sobre una hora a medida o fuera del horario) o si el día está cerrado.
  const [showAll, setShowAll] = useState(() => slots.length === 0 || (offGrid && ALL_QUARTERS.includes(start)));

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      // Escape cierra solo este paso; el diálogo de abajo (y el formulario) siguen abiertos.
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="¿A qué hora?" className="max-h-[85svh] w-full overflow-y-auto rounded-t-3xl bg-surface-container-lowest p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-on-surface">¿A qué hora?</h3>
            <p className="mt-0.5 text-xs text-on-surface-variant">{date ? formatDateOnly(date, { weekday: "long", day: "numeric", month: "long" }) : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar horarios" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-outline-variant/30 text-on-surface hover:bg-surface-container-high"><X size={16} aria-hidden="true" /></button>
        </div>

        {slots.length === 0 ? (
          <p className="mb-4 rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface-variant">Ese día el negocio está cerrado. Si igual vas a atender, elige en «Otra hora…».</p>
        ) : (
          <SlotGroups slots={slots} start={start} format={format} taken={taken} selectedRef={showAll ? undefined : selected} onPick={onPick} />
        )}

        <div className="mt-5 border-t border-outline-variant/15 pt-4">
          <button
            type="button"
            aria-expanded={showAll}
            aria-controls="time-dialog-all"
            onClick={() => setShowAll((value) => !value)}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {showAll ? "Ocultar otras horas" : "Otra hora…"}
          </button>
          {showAll ? (
            <div id="time-dialog-all" className="mt-4">
              <p className="mb-3 text-xs text-on-surface-variant">Todo el día, cada 15 minutos (incluye horas fuera del horario de atención).</p>
              <SlotGroups slots={ALL_QUARTERS} start={start} format={format} taken={taken} selectedRef={selected} onPick={onPick} />
            </div>
          ) : null}
        </div>
        {offGrid && !ALL_QUARTERS.includes(start) ? <p className="mt-4 text-xs text-on-surface-variant">La cita empieza a las {formatAppointmentTime(start, format)}. Elige otra hora, o usa «Ajustar horas exactas» para una hora a medida.</p> : null}
      </div>
    </div>
  );
}

/** Píldoras de horas agrupadas por mañana, tarde y noche. */
function SlotGroups({ slots, start, format, taken, selectedRef, onPick }: { slots: string[]; start: string; format: TimeFormat; taken?: (slot: string) => boolean; selectedRef?: React.RefObject<HTMLButtonElement | null>; onPick: (slot: string) => void }) {
  return (
    <div className="space-y-5">
      {PERIODS.map((period) => {
        const inPeriod = slots.filter((slot) => toMinutes(slot) >= period.from && toMinutes(slot) < period.to);
        if (inPeriod.length === 0) return null;
        return (
          <section key={period.id} aria-label={period.label}>
            <div className="mb-2 flex items-baseline justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-on-surface">{period.label}</h4>
              <span className="text-[11px] text-on-surface-variant">{taken ? `${inPeriod.filter((slot) => !taken(slot)).length} disponibles` : `${inPeriod.length} horarios`}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {inPeriod.map((slot) => {
                const active = slot === start;
                const reserved = !active && taken?.(slot) === true;
                return (
                  <button key={slot} ref={active ? selectedRef : undefined} type="button" aria-pressed={active} disabled={reserved} onClick={() => onPick(slot)} className={`rounded-full border px-2 py-2 text-sm font-semibold tabular-nums transition-colors ${active ? "border-primary bg-primary text-on-primary" : reserved ? "cursor-not-allowed border-outline-variant/20 text-on-surface-variant/50" : "border-outline-variant/40 text-on-surface hover:border-primary hover:text-primary"}`}>
                    <span className={reserved ? "line-through" : ""}>{formatAppointmentTime(slot, format)}</span>
                    {reserved ? <span className="block text-[10px] font-medium leading-tight no-underline">Reservado</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
