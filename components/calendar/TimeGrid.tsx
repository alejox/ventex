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
  swipeAllowed,
  swipeDirection,
  type DragMode,
} from "@/lib/appointment-drag";
import { groupByColumn, staffInitials, type StaffColumn } from "@/lib/staff-columns";

/** Alto de una hora, en px: de acá salen la posición y el alto de cada cita. */
const HOUR_PX = 64;
const GUTTER_PX = 64;
/** Cerca del borde del área con scroll, arrastrar empuja el scroll. */
const EDGE_PX = 40;
/** Ancho mínimo de una columna por persona: en el celular se recorren a lo ancho. */
const STAFF_COLUMN_MIN_PX = 140;

export interface GridDay {
  date: string;
  dayName: string;
  day: number;
}

export interface RescheduleTarget {
  date: string;
  start: string;
  end: string;
  /** Solo al soltarla en la columna de otra persona: a quién pasa (null = sin asignar). */
  staffId?: string | null;
}

/** Una columna de la grilla: un día (Semana/Día) o una persona en un día (Día por persona). */
interface GridColumn {
  key: string;
  date: string;
  day: GridDay;
  /** Solo en columnas por persona. */
  staff?: StaffColumn;
}

interface TimeGridProps {
  days: GridDay[];
  appointmentsByDate: Record<string, Appointment[]>;
  today: string;
  timeFormat: TimeFormat;
  statusClass: (status: string) => string;
  /** `staffId` llega al tocar el hueco de una columna por persona (no la de "Sin asignar"). */
  onCreate: (date: string, time: string, staffId?: string) => void;
  onEdit: (appointment: Appointment) => void;
  /** Horario de atención: fija el rango de la grilla y sombrea lo cerrado. */
  hours?: OpeningHour[] | null;
  /** Soltar una cita arrastrada (mover) o estirada (duración). Sin esto no se arrastra. */
  onReschedule?: (appointment: Appointment, next: RescheduleTarget) => void;
  /** Qué citas se pueden arrastrar (p. ej. no las canceladas ni las cobradas). */
  canReschedule?: (appointment: Appointment) => boolean;
  /** Deslizar el dedo a los lados: período anterior/siguiente. */
  onSwipe?: (direction: "prev" | "next") => void;
  /**
   * Vista Día por persona: una columna por cada una (con un solo día en `days`).
   * Arrastrar a otra columna reasigna la cita. Vacío o ausente: una columna por día.
   */
  staffColumns?: StaffColumn[];
}

interface DragSession {
  pointerId: number;
  pointerType: string;
  appointment: Appointment;
  mode: DragMode;
  originX: number;
  originY: number;
  originScroll: number;
  originColumn: number;
  start: number;
  end: number;
  active: boolean;
  timer: number | null;
  /** Último destino calculado: lo que se aplica al soltar. */
  last: DragPreview | null;
}

interface DragPreview {
  id: string;
  /** Clave de la columna donde caería. */
  column: string;
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
  staffColumns,
}: TimeGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  const touchStart = useRef<{ x: number; y: number; scrollLeft: number; maxScroll: number } | null>(null);
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

  const byStaff = Boolean(staffColumns && staffColumns.length > 0 && days.length === 1);
  const gridColumns = useMemo<GridColumn[]>(() => {
    if (byStaff && staffColumns) return staffColumns.map((staff) => ({ key: staff.key, date: days[0].date, day: days[0], staff }));
    return days.map((day) => ({ key: day.date, date: day.date, day }));
  }, [byStaff, staffColumns, days]);
  const appointmentsByColumn = useMemo<Record<string, Appointment[]>>(() => {
    if (byStaff && staffColumns) return groupByColumn(appointmentsByDate[days[0].date] ?? [], staffColumns);
    return Object.fromEntries(days.map((day) => [day.date, appointmentsByDate[day.date] ?? []]));
  }, [byStaff, staffColumns, days, appointmentsByDate]);
  const visible = useMemo(() => gridColumns.flatMap((column) => appointmentsByColumn[column.key] ?? []), [gridColumns, appointmentsByColumn]);
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

  const columns = `${GUTTER_PX}px repeat(${gridColumns.length}, minmax(0, 1fr))`;
  const minWidth = gridColumns.length > 1 ? GUTTER_PX + gridColumns.length * (byStaff ? STAFF_COLUMN_MIN_PX : 104) : undefined;

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
    let index = current.originColumn;
    if (current.mode === "move" && grid.current) {
      const rect = grid.current.getBoundingClientRect();
      index = columnAt(clientX, rect.left + GUTTER_PX, rect.width - GUTTER_PX, gridColumns.length);
    }
    const next = { id: current.appointment.id, column: gridColumns[index]?.key ?? gridColumns[current.originColumn]?.key ?? "", ...span };
    current.last = next;
    setPreview(next);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, appointment: Appointment, mode: DragMode) => {
    if (!draggable(appointment) || event.button !== 0) return;
    if (mode === "resize") event.stopPropagation();
    const columnIndex = Math.max(gridColumns.findIndex((column) => (appointmentsByColumn[column.key] ?? []).some((a) => a.id === appointment.id)), 0);
    const next: DragSession = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      appointment,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      originScroll: scroller.current?.scrollTop ?? 0,
      originColumn: columnIndex,
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
        setPreview({ id: appointment.id, column: gridColumns[columnIndex]?.key ?? "", start: next.start, end: next.end });
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
      const origin = gridColumns[current.originColumn];
      const target = gridColumns.find((column) => column.key === result?.column) ?? origin;
      const staffChanged = Boolean(target?.staff && origin?.staff && target.key !== origin.key);
      const changed = result && target && (target.date !== current.appointment.appointment_date || staffChanged || result.start !== current.start || result.end !== current.end);
      if (result && target && changed && onReschedule) {
        onReschedule(current.appointment, {
          date: target.date,
          start: minutesToTime(result.start),
          end: minutesToTime(result.end),
          ...(staffChanged ? { staffId: target.staff?.staffId ?? null } : {}),
        });
      }
    }
    endSession();
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container-lowest shadow-sm">
      {/*
        Un solo contenedor con scroll en los dos ejes: el encabezado queda fijo
        arriba y las horas fijas a la izquierda mientras se recorren las
        columnas (en el celular, las de cada persona no entran a lo ancho).
      */}
      <div
        ref={scroller}
        className="relative overflow-auto"
        style={{ height: "min(780px, calc(100dvh - 14rem))", minHeight: 480 }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          const box = event.currentTarget;
          touchStart.current = event.touches.length === 1 && touch
            ? { x: touch.clientX, y: touch.clientY, scrollLeft: box.scrollLeft, maxScroll: box.scrollWidth - box.clientWidth }
            : null;
        }}
        onTouchEnd={(event) => {
          const origin = touchStart.current;
          touchStart.current = null;
          const touch = event.changedTouches[0];
          if (!origin || !touch || !onSwipe || suppressClick.current || session.current?.active) return;
          const direction = swipeDirection(touch.clientX - origin.x, touch.clientY - origin.y);
          if (direction && swipeAllowed(direction, origin.scrollLeft, origin.maxScroll)) onSwipe(direction);
        }}
      >
        <div style={{ minWidth }}>
          <div className="sticky top-0 z-40 bg-surface-container-lowest">
            <div className="grid border-b border-outline-variant/10 bg-surface-container/50" style={{ gridTemplateColumns: columns }}>
              <div className="sticky left-0 z-10 bg-surface-container-lowest" />
              {gridColumns.map((column) => {
                const isToday = column.date === today;
                const closedAllDay = hours !== null && hours.length > 0 && !hours.some((h) => h.weekday === weekdayOf(column.date) && h.is_open);
                if (column.staff) {
                  const member = column.staff;
                  return (
                    <div key={column.key} className="flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-center">
                      {member.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- foto remota del equipo, ya optimizada al subirla
                        <img src={member.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span aria-hidden="true" className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${member.staffId ? "bg-primary/15 text-primary-ink" : "border border-dashed border-outline-variant text-on-surface-variant"}`}>
                          {member.staffId ? staffInitials(member.name) : "?"}
                        </span>
                      )}
                      <div className="w-full truncate text-xs font-bold text-on-surface" title={member.name}>{member.name}</div>
                      {closedAllDay ? <div className="text-[11px] font-semibold text-on-surface-variant">Cerrado</div> : null}
                    </div>
                  );
                }
                return (
                  <div key={column.key} className="py-2.5 text-center">
                    <div className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? "text-primary-ink" : "text-on-surface-variant"}`}>{column.day.dayName}</div>
                    <div className={`mx-auto mt-0.5 grid h-9 w-9 place-items-center rounded-full text-lg font-bold ${isToday ? "bg-primary text-on-primary" : "text-on-surface"}`}>{column.day.day}</div>
                    {closedAllDay ? <div className="mt-0.5 text-[11px] font-semibold text-on-surface-variant">Cerrado</div> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div ref={grid} className="grid" style={{ gridTemplateColumns: columns, height: totalHeight }}>
            {/* Horas: la etiqueta va centrada sobre su línea, como en Google. */}
            <div className="sticky left-0 z-30 bg-surface-container-lowest">
              {hoursList.map((hour, index) => index === 0 ? null : (
                <span key={hour} className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-on-surface-variant" style={{ top: index * HOUR_PX }}>
                  {formatAppointmentTime(minutesToTime(hour * 60), timeFormat)}
                </span>
              ))}
            </div>

            {gridColumns.map((column) => {
              const columnAppointments = appointmentsByColumn[column.key] ?? [];
              const placed = layoutDay(columnAppointments.map((a) => ({ id: a.id, start: toMinutes(a.start_time), end: toMinutes(a.end_time) })));
              const byId = new Map(columnAppointments.map((a) => [a.id, a]));
              const isToday = column.date === today;
              const closed = closedIntervals(hours, weekdayOf(column.date), from * 60, to * 60);
              const ghost = preview && preview.column === column.key ? preview : null;
              const ghostAppointment = ghost ? visible.find((a) => a.id === ghost.id) ?? null : null;
              return (
                <div
                  key={column.key}
                  aria-label={column.staff ? `Agenda de ${column.staff.name}` : undefined}
                  className={`relative cursor-pointer border-l border-outline-variant/15 ${isToday ? "bg-primary/[0.03]" : ""}`}
                  onClick={(event) => {
                    if (suppressClick.current) return;
                    const top = event.currentTarget.getBoundingClientRect().top;
                    const minutes = from * 60 + ((event.clientY - top) / HOUR_PX) * 60;
                    onCreate(column.date, minutesToTime(snapToHalfHour(minutes)), column.staff?.staffId ?? undefined);
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
                    // En la columna de una persona su nombre ya está arriba.
                    const detail = [appointment.services?.name ?? appointment.service_type, column.staff ? null : appointment.staff?.full_name].filter(Boolean).join(" · ");
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
                      <div className="h-0.5 bg-error" />
                      <span className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-error" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {onReschedule ? (
        <p id="timegrid-drag-hint" className="border-t border-outline-variant/10 px-4 py-2 text-[11px] text-on-surface-variant">
          {byStaff
            ? "Arrastra una cita para moverla (a otra columna para pasársela a otra persona) o estira su borde inferior para cambiar la duración (en el celular, mantenla presionada)."
            : "Arrastra una cita para moverla o estira su borde inferior para cambiar la duración (en el celular, mantenla presionada). También puedes abrirla y usar «Mover a…»."}
        </p>
      ) : null}
    </div>
  );
}
