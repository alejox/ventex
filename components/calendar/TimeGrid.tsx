"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Appointment } from "@/services/appointments.service";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import { layoutDay, minutesToTime, snapToHalfHour, toMinutes, visibleHourRange } from "@/lib/calendar-layout";

/** Alto de una hora, en px: de acá salen la posición y el alto de cada cita. */
const HOUR_PX = 64;
const GUTTER_PX = 64;

export interface GridDay {
  date: string;
  dayName: string;
  day: number;
}

interface TimeGridProps {
  days: GridDay[];
  appointmentsByDate: Record<string, Appointment[]>;
  today: string;
  timeFormat: TimeFormat;
  statusClass: (status: string) => string;
  onCreate: (date: string, time: string) => void;
  onEdit: (appointment: Appointment) => void;
}

/**
 * Cuadrícula horaria de la vista de semana y de día, al estilo Google Calendar:
 * cada cita ocupa el tramo de su horario (empieza donde empieza y mide lo que
 * dura), las que se pisan se reparten el ancho, y una línea roja marca la hora
 * actual. Antes cada cita era una etiqueta de una hora, así que una cita de dos
 * horas se veía igual que una de media.
 */
export function TimeGrid({ days, appointmentsByDate, today, timeFormat, statusClass, onCreate, onEdit }: TimeGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => days.flatMap((day) => appointmentsByDate[day.date] ?? []), [days, appointmentsByDate]);
  const { from, to } = useMemo(
    () => visibleHourRange(visible.map((a) => toMinutes(a.start_time)), visible.map((a) => toMinutes(a.end_time))),
    [visible],
  );
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const totalHeight = (to - from) * HOUR_PX;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const firstDate = days[0]?.date;
  const showsToday = days.some((day) => day.date === today);

  // Al abrir (o cambiar de periodo) el scroll cae en lo que importa: la hora
  // actual si hoy está a la vista, si no la primera cita, si no la mañana.
  useEffect(() => {
    const focus = showsToday
      ? nowMinutes
      : visible.length > 0
        ? Math.min(...visible.map((a) => toMinutes(a.start_time)))
        : 8 * 60;
    if (scroller.current) scroller.current.scrollTop = Math.max(((focus - from * 60) / 60) * HOUR_PX - HOUR_PX, 0);
    // Solo al cambiar de periodo: no mover el scroll cada minuto ni con cada filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDate, days.length]);

  const columns = `${GUTTER_PX}px repeat(${days.length}, minmax(0, 1fr))`;
  const minWidth = days.length > 1 ? GUTTER_PX + days.length * 104 : undefined;

  return (
    <div className="overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container-lowest shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div className="grid border-b border-outline-variant/10 bg-surface-container/50" style={{ gridTemplateColumns: columns }}>
            <div />
            {days.map((day) => {
              const isToday = day.date === today;
              return (
                <div key={day.date} className="py-2.5 text-center">
                  <div className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? "text-[#6063ee]" : "text-on-surface-variant"}`}>{day.dayName}</div>
                  <div className={`mx-auto mt-0.5 grid h-9 w-9 place-items-center rounded-full text-lg font-bold ${isToday ? "bg-[#6063ee] text-white" : "text-on-surface"}`}>{day.day}</div>
                </div>
              );
            })}
          </div>

          <div ref={scroller} className="relative overflow-y-auto" style={{ height: "min(720px, calc(100dvh - 18rem))", minHeight: 420 }}>
            <div className="grid" style={{ gridTemplateColumns: columns, height: totalHeight }}>
              {/* Horas: la etiqueta va centrada sobre su línea, como en Google. */}
              <div className="relative">
                {hours.map((hour, index) => index === 0 ? null : (
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
                return (
                  <div
                    key={day.date}
                    className={`relative cursor-pointer border-l border-outline-variant/15 ${isToday ? "bg-[#6063ee]/[0.03]" : ""}`}
                    onClick={(event) => {
                      const top = event.currentTarget.getBoundingClientRect().top;
                      const minutes = from * 60 + ((event.clientY - top) / HOUR_PX) * 60;
                      onCreate(day.date, minutesToTime(snapToHalfHour(minutes)));
                    }}
                  >
                    {hours.map((hour, index) => (
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
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          aria-label={`${appointment.title}, ${formatAppointmentTime(appointment.start_time, timeFormat)} a ${formatAppointmentTime(appointment.end_time, timeFormat)}`}
                          onClick={(event) => { event.stopPropagation(); onEdit(appointment); }}
                          className={`absolute z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-surface-container-lowest transition-shadow hover:shadow-md ${statusClass(appointment.status)}`}
                          style={{ top: top + 1, height: height - 2, left: `calc(${(slot.column / slot.columns) * 100}% + 2px)`, width: `calc(${100 / slot.columns}% - 4px)` }}
                        >
                          <span className="block truncate font-bold">{appointment.title}</span>
                          <span className="block truncate opacity-80">{formatAppointmentTime(appointment.start_time, timeFormat)} – {formatAppointmentTime(appointment.end_time, timeFormat)}</span>
                          {height >= 72 && appointment.customers?.full_name ? <span className="mt-0.5 block truncate opacity-80">{appointment.customers.full_name}</span> : null}
                          {height >= 96 && detail ? <span className="block truncate opacity-70">{detail}</span> : null}
                        </button>
                      );
                    })}

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
    </div>
  );
}
