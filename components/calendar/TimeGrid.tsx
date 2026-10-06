"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Appointment } from "@/services/appointments.service";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import { layoutDay, minutesToTime, snapToHalfHour, toMinutes, visibleHourRange } from "@/lib/calendar-layout";
import { closedIntervals, gridHourRange, weekdayOf, type OpeningHour } from "@/lib/appointment-hours";
import {
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  columnAt,
  dragSpan,
  pixelsToMinutes,
  swipeDirection,
  type DragMode,
} from "@/lib/appointment-drag";

/** Alto de una hora, en px: de acá salen la posición y el alto de cada cita. */
const HOUR_PX = 64;
const GUTTER_PX = 64;
/** Cerca del borde del área con scroll, arrastrar empuja el scroll. */
const EDGE_PX = 40;

export interface GridDay {
  date: string;
  dayName: string;
  day: number;
}

export interface RescheduleTarget {
  date: string;
  start: string;
  end: string;
}

interface TimeGridProps {
  days: GridDay[];
  appointmentsByDate: Record<string, Appointment[]>;
  today: string;
  timeFormat: TimeFormat;
  statusClass: (status: string) => string;
  onCreate: (date: string, time: string) => void;
  onEdit: (appointment: Appointment) => void;
  /** Horario de atención: fija el rango de la grilla y sombrea lo cerrado. */
  hours?: OpeningHour[] | null;
  /** Soltar una cita arrastrada (mover) o estirada (duración). Sin esto no se arrastra. */
  onReschedule?: (appointment: Appointment, next: RescheduleTarget) => void;
  /** Qué citas se pueden arrastrar (p. ej. no las canceladas ni las cobradas). */
  canReschedule?: (appointment: Appointment) => boolean;
  /** Deslizar el dedo a los lados: período anterior/siguiente. */
  onSwipe?: (direction: "prev" | "next") => void;
}

interface DragSession {
  pointerId: number;
  pointerType: string;
  appointment: Appointment;
  mode: DragMode;
  originX: number;
  originY: number;
  originScroll: number;
  originDay: number;
  start: number;
  end: number;
  active: boolean;
  timer: number | null;
  /** Último destino calculado: lo que se aplica al soltar. */
  last: DragPreview | null;
}

interface DragPreview {
  id: string;
  date: string;
  start: number;
  end: number;
}

/**
 * Cuadrícula horaria de la vista de semana y de día, al estilo Google Calendar:
 * cada cita ocupa el tramo de su horario (empieza donde empieza y mide lo que
 * dura), las que se pisan se reparten el ancho, y una línea roja marca la hora
 * actual.
 *
 * Las citas se ARRASTRAN para moverlas (también a otro día en la semana) y se
 * estiran desde el borde inferior para cambiar la duración. Con mouse arranca
 * al mover unos píxeles; con el dedo, tras mantener presionado (si no, no se
 * podría hacer scroll). Quien suelta decide (`onReschedule`): validar choques,
 * pedir confirmación o deshacer es de la pantalla, no de la grilla.
 */
export function TimeGrid({
  days,
  appointmentsByDate,
  today,
  timeFormat,
  statusClass,
  onCreate,
  onEdit,
  hours = null,
  onReschedule,
  canReschedule,
  onSwipe,
}: TimeGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Mientras se arrastra con el dedo, el navegador no tiene que hacer scroll.
  // React registra `touchmove` como pasivo, así que va con un listener propio.
  useEffect(() => {
    const block = (event: TouchEvent) => {
      if (session.current?.active) event.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      document.removeEventListener("touchmove", block);
      if (session.current?.timer) window.clearTimeout(session.current.timer);
    };
  }, []);

  const visible = useMemo(() => days.flatMap((day) => appointmentsByDate[day.date] ?? []), [days, appointmentsByDate]);
  const workRange = useMemo(() => gridHourRange(hours, days.map((day) => weekdayOf(day.date))), [hours, days]);
  const { from, to } = useMemo(
    () => visibleHourRange(visible.map((a) => toMinutes(a.start_time)), visible.map((a) => toMinutes(a.end_time)), workRange),
    [visible, workRange],
  );
  const hoursList = Array.from({ length: to - from }, (_, i) => from + i);
  const totalHeight = (to - from) * HOUR_PX;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const firstDate = days[0]?.date;
  const showsToday = days.some((day) => day.date === today);
  const draggable = (appointment: Appointment) => Boolean(onReschedule) && (canReschedule?.(appointment) ?? true);

  // Al abrir (o cambiar de periodo) el scroll cae en lo que importa: la hora
  // actual si hoy está a la vista, si no la primera cita, si no la apertura.
  useEffect(() => {
    const focus = showsToday
      ? nowMinutes
      : visible.length > 0
        ? Math.min(...visible.map((a) => toMinutes(a.start_time)))
        : Math.max(from * 60, 8 * 60);
    if (scroller.current) scroller.current.scrollTop = Math.max(((focus - from * 60) / 60) * HOUR_PX - HOUR_PX, 0);
    // Solo al cambiar de periodo: no mover el scroll cada minuto ni con cada filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDate, days.length]);

  const columns = `${GUTTER_PX}px repeat(${days.length}, minmax(0, 1fr))`;
  const minWidth = days.length > 1 ? GUTTER_PX + days.length * 104 : undefined;

  // ---- Arrastre ----

  const endSession = () => {
    if (session.current?.timer) window.clearTimeout(session.current.timer);
    session.current = null;
    setPreview(null);
  };

  const updatePreview = (current: DragSession, clientX: number, clientY: number) => {
    const scrollDelta = (scroller.current?.scrollTop ?? 0) - current.originScroll;
    const delta = pixelsToMinutes(clientY - current.originY + scrollDelta, HOUR_PX);
    const span = dragSpan({ start: current.start, end: current.end }, delta, current.mode, { start: from * 60, end: to * 60 });
    let dayIndex = current.originDay;
    if (current.mode === "move" && grid.current) {
      const rect = grid.current.getBoundingClientRect();
      dayIndex = columnAt(clientX, rect.left + GUTTER_PX, rect.width - GUTTER_PX, days.length);
    }
    const next = { id: current.appointment.id, date: days[dayIndex]?.date ?? current.appointment.appointment_date, ...span };
    current.last = next;
    setPreview(next);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, appointment: Appointment, mode: DragMode) => {
    if (!draggable(appointment) || event.button !== 0) return;
    if (mode === "resize") event.stopPropagation();
    const dayIndex = Math.max(days.findIndex((day) => day.date === appointment.appointment_date), 0);
    const next: DragSession = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      appointment,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      originScroll: scroller.current?.scrollTop ?? 0,
      originDay: dayIndex,
      start: toMinutes(appointment.start_time),
      end: toMinutes(appointment.end_time),
      active: false,
      timer: null,
      last: null,
    };
    // Con el dedo, mover arranca tras mantener presionado; el borde para estirar
    // es un blanco explícito (`touch-none`) y arranca de una.
    if (event.pointerType !== "mouse" && mode === "move") {
      next.timer = window.setTimeout(() => {
        if (session.current !== next) return;
        next.active = true;
        navigator.vibrate?.(10);
        setPreview({ id: appointment.id, date: appointment.appointment_date, start: next.start, end: next.end });
      }, LONG_PRESS_MS);
    }
    session.current = next;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* sin captura igual funciona dentro del elemento */ }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - current.originX, event.clientY - current.originY);
    if (!current.active) {
      const waitsForLongPress = current.pointerType !== "mouse" && current.mode === "move";
      if (waitsForLongPress) {
        // Se movió antes de tiempo: es un scroll, no un arrastre.
        if (moved > 8) endSession();
        return;
      }
      if (moved < DRAG_THRESHOLD_PX) return;
      current.active = true;
    }
    event.preventDefault();
    const box = scroller.current?.getBoundingClientRect();
    if (box && scroller.current) {
      if (event.clientY < box.top + EDGE_PX) scroller.current.scrollTop -= 12;
      else if (event.clientY > box.bottom - EDGE_PX) scroller.current.scrollTop += 12;
    }
    updatePreview(current, event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const result = current.last;
    if (current.active) {
      // El clic que sigue al soltar no tiene que abrir la cita.
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      const changed = result && (result.date !== current.appointment.appointment_date || result.start !== current.start || result.end !== current.end);
      if (result && changed && onReschedule) {
        onReschedule(current.appointment, { date: result.date, start: minutesToTime(result.start), end: minutesToTime(result.end) });
      }
    }
    endSession();
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container-lowest shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div className="grid border-b border-outline-variant/10 bg-surface-container/50" style={{ gridTemplateColumns: columns }}>
            <div />
            {days.map((day) => {
              const isToday = day.date === today;
              const closedAllDay = hours !== null && hours.length > 0 && !hours.some((h) => h.weekday === weekdayOf(day.date) && h.is_open);
              return (
                <div key={day.date} className="py-2.5 text-center">
                  <div className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? "text-[#6063ee]" : "text-on-surface-variant"}`}>{day.dayName}</div>
                  <div className={`mx-auto mt-0.5 grid h-9 w-9 place-items-center rounded-full text-lg font-bold ${isToday ? "bg-[#6063ee] text-white" : "text-on-surface"}`}>{day.day}</div>
                  {closedAllDay ? <div className="mt-0.5 text-[10px] font-semibold text-on-surface-variant">Cerrado</div> : null}
                </div>
              );
            })}
          </div>

          <div
            ref={scroller}
            className="relative overflow-y-auto"
            style={{ height: "min(720px, calc(100dvh - 18rem))", minHeight: 420 }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              touchStart.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
            }}
            onTouchEnd={(event) => {
              const origin = touchStart.current;
              touchStart.current = null;
              const touch = event.changedTouches[0];
              if (!origin || !touch || !onSwipe || suppressClick.current || session.current?.active) return;
              const direction = swipeDirection(touch.clientX - origin.x, touch.clientY - origin.y);
              if (direction) onSwipe(direction);
            }}
          >
            <div ref={grid} className="grid" style={{ gridTemplateColumns: columns, height: totalHeight }}>
              {/* Horas: la etiqueta va centrada sobre su línea, como en Google. */}
              <div className="relative">
                {hoursList.map((hour, index) => index === 0 ? null : (
                  <span key={hour} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-on-surface-variant" style={{ top: index * HOUR_PX }}>
                    {formatAppointmentTime(minutesToTime(hour * 60), timeFormat)}
                  </span>
                ))}
              </div>

              {days.map((day) => {
                const dayAppointments = appointmentsByDate[day.date] ?? [];
                const placed = layoutDay(dayAppointments.map((a) => ({ id: a.id, start: toMinutes(a.start_time), end: toMinutes(a.end_time) })));
                const byId = new Map(dayAppointments.map((a) => [a.id, a]));
                const isToday = day.date === today;
                const closed = closedIntervals(hours, weekdayOf(day.date), from * 60, to * 60);
                const ghost = preview && preview.date === day.date ? preview : null;
                const ghostAppointment = ghost ? visible.find((a) => a.id === ghost.id) ?? null : null;
                return (
                  <div
                    key={day.date}
                    className={`relative cursor-pointer border-l border-outline-variant/15 ${isToday ? "bg-[#6063ee]/[0.03]" : ""}`}
                    onClick={(event) => {
                      if (suppressClick.current) return;
                      const top = event.currentTarget.getBoundingClientRect().top;
                      const minutes = from * 60 + ((event.clientY - top) / HOUR_PX) * 60;
                      onCreate(day.date, minutesToTime(snapToHalfHour(minutes)));
                    }}
                  >
                    {/* Fuera del horario de atención: sombreado, no bloqueado. */}
                    {closed.map((interval) => (
                      <div
                        key={interval.start}
                        aria-hidden="true"
                        data-closed="true"
                        className="pointer-events-none absolute inset-x-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-outline-variant)_6px_7px)] bg-surface-container/70 opacity-60"
                        style={{ top: ((interval.start - from * 60) / 60) * HOUR_PX, height: ((interval.end - interval.start) / 60) * HOUR_PX }}
                      />
                    ))}

                    {hoursList.map((hour, index) => (
                      <div key={hour} aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: index * HOUR_PX, height: HOUR_PX }}>
                        <div className={`absolute inset-x-0 top-0 border-t border-outline-variant/20 ${index === 0 ? "border-transparent" : ""}`} />
                        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-outline-variant/10" />
                      </div>
                    ))}

                    {placed.map((slot) => {
                      const appointment = byId.get(slot.id);
                      if (!appointment) return null;
                      const top = ((slot.start - from * 60) / 60) * HOUR_PX;
                      const height = ((slot.visualEnd - slot.start) / 60) * HOUR_PX;
                      const detail = [appointment.services?.name ?? appointment.service_type, appointment.staff?.full_name].filter(Boolean).join(" · ");
                      const canDrag = draggable(appointment);
                      const dragging = preview?.id === appointment.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          aria-label={`${appointment.title}, ${formatAppointmentTime(appointment.start_time, timeFormat)} a ${formatAppointmentTime(appointment.end_time, timeFormat)}`}
                          aria-describedby={canDrag ? "timegrid-drag-hint" : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressClick.current) return;
                            onEdit(appointment);
                          }}
                          onPointerDown={(event) => handlePointerDown(event, appointment, "move")}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={endSession}
                          onContextMenu={(event) => { if (session.current) event.preventDefault(); }}
                          className={`absolute z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-surface-container-lowest transition-shadow select-none [-webkit-touch-callout:none] hover:shadow-md ${canDrag ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "opacity-40" : ""} ${statusClass(appointment.status)}`}
                          style={{ top: top + 1, height: height - 2, left: `calc(${(slot.column / slot.columns) * 100}% + 2px)`, width: `calc(${100 / slot.columns}% - 4px)` }}
                        >
                          <span className="block truncate font-bold">{appointment.title}</span>
                          <span className="block truncate opacity-80">{formatAppointmentTime(appointment.start_time, timeFormat)} – {formatAppointmentTime(appointment.end_time, timeFormat)}</span>
                          {height >= 72 && appointment.customers?.full_name ? <span className="mt-0.5 block truncate opacity-80">{appointment.customers.full_name}</span> : null}
                          {height >= 96 && detail ? <span className="block truncate opacity-70">{detail}</span> : null}
                          {canDrag && height >= 24 ? (
                            <span
                              aria-hidden="true"
                              title="Arrastra para cambiar la duración"
                              onPointerDown={(event) => handlePointerDown(event, appointment, "resize")}
                              className="group/resize absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize touch-none items-end justify-center pb-0.5"
                            >
                              <span className="h-1 w-6 rounded-full bg-current opacity-30 group-hover/resize:opacity-70" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}

                    {ghost ? (
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-x-0.5 z-30 rounded-md border-2 border-dashed border-primary bg-primary/15 px-1.5 py-1 text-[11px] font-bold leading-tight text-primary shadow-lg`}
                        style={{ top: ((ghost.start - from * 60) / 60) * HOUR_PX + 1, height: Math.max(((ghost.end - ghost.start) / 60) * HOUR_PX - 2, 14) }}
                      >
                        <span className="block truncate">{ghostAppointment?.title}</span>
                        <span className="block truncate">{formatAppointmentTime(minutesToTime(ghost.start), timeFormat)} – {formatAppointmentTime(minutesToTime(ghost.end), timeFormat)}</span>
                      </div>
                    ) : null}

                    {isToday && nowMinutes >= from * 60 && nowMinutes <= to * 60 ? (
                      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-20" style={{ top: ((nowMinutes - from * 60) / 60) * HOUR_PX }}>
                        <div className="h-0.5 bg-[#ea4335]" />
                        <span className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-[#ea4335]" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {onReschedule ? (
        <p id="timegrid-drag-hint" className="border-t border-outline-variant/10 px-4 py-2 text-[11px] text-on-surface-variant">
          Arrastra una cita para moverla o estira su borde inferior para cambiar la duración (en el celular, mantenla presionada). También puedes abrirla y usar «Mover a…».
        </p>
      ) : null}
    </div>
  );
}
