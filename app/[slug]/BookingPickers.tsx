"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import { celdasDelMes, claveMes, longDateFmt, parseDateInput } from "@/lib/booking-month";
import type { RescheduleSlot } from "@/lib/site-reschedule";
import type { DayAvailability, DaySlot } from "@/services/public-site.types";

/**
 * Day and time pickers of the public site, shared by the booking widget and
 * the "Cambiar fecha" step of the lookup modal. Presentational only: what to
 * show comes in by props, painted with the template's `--site-on-surface*`
 * variables (see `BookingWidget` for why not `--site-text`).
 */

const mesFmt = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

/**
 * Empieza en domingo, como el resto de la app.
 *
 * `WEEKDAY_LABELS` y el `dow` de Postgres arrancan en domingo, y la lista de
 * horarios del micrositio se dibuja en ese orden. Un calendario que empezara en
 * lunes obligaría a leer dos órdenes distintos en la misma página.
 */
const INICIALES_SEMANA = ["D", "L", "M", "M", "J", "V", "S"] as const;

/**
 * Un día abierto son veinte y pico de turnos. Puestos en una sola grilla son
 * una pared de cajas iguales que nadie lee: se escanea por franja ("a la
 * mañana", "después de almorzar"), no hora por hora.
 */
const SLOT_GROUPS = [
  { id: "manana", label: "Mañana", from: 0, to: 12 },
  { id: "tarde", label: "Tarde", from: 12, to: 18 },
  { id: "noche", label: "Noche", from: 18, to: 24 },
] as const;

function hourOf(slot: { time: string }): number {
  return Number(slot.time.slice(0, 2));
}

const NAV_BUTTON =
  "grid h-8 w-8 place-items-center rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] transition-colors enabled:hover:border-[var(--site-accent)] disabled:opacity-30";

interface MonthCalendarProps {
  /** Loaded availability window; months outside it cannot be navigated to. */
  days: DayAvailability[];
  today: string;
  /** `YYYY-MM` being shown. */
  month: string;
  onMonthChange: (month: string) => void;
  selected: string | null;
  onSelect: (date: string) => void;
}

export function MonthCalendar({ days, today, month, onMonthChange, selected, onSelect }: MonthCalendarProps) {
  /** Disponibilidad indexada por fecha: el calendario busca por celda. */
  const porFecha = new Map(days.map((d) => [d.date, d]));

  /*
   * Los meses navegables salen de la VENTANA CARGADA, no del calendario.
   * Dejar avanzar más allá llevaría a un mes entero en gris, que se lee como
   * "este negocio cerró" y no como "todavía no abrió la agenda".
   */
  const mesesConDatos = [...new Set(days.map((d) => claveMes(d.date)))].sort();
  const indiceMes = mesesConDatos.indexOf(month);
  const mesAnterior = indiceMes > 0 ? mesesConDatos[indiceMes - 1] : null;
  const mesSiguiente =
    indiceMes >= 0 && indiceMes < mesesConDatos.length - 1 ? mesesConDatos[indiceMes + 1] : null;

  return (
    // Tope de ancho al calendario: las celdas son cuadradas, así que sin tope
    // crecen con la columna y un mes pasa de 300 a 450px de ALTO.
    <div className="max-w-[26rem]">
      {/* La navegación va ARRIBA del calendario y dentro de su mismo ancho.
          Flechas de verdad, no scroll horizontal: con mouse la tira no se
          movía y el visitante creía que no había más turnos. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => mesAnterior && onMonthChange(mesAnterior)}
          disabled={!mesAnterior}
          aria-label="Mes anterior"
          className={NAV_BUTTON}
        >
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
        {/* `first-letter` y no `capitalize`: con `capitalize` salía
            "Septiembre De 2026". Necesita ser inline-block. */}
        <span className="inline-block min-w-[7.5rem] text-center text-xs font-semibold text-[var(--site-on-surface)] first-letter:uppercase">
          {mesFmt.format(parseDateInput(`${month}-01`))}
        </span>
        <button
          type="button"
          onClick={() => mesSiguiente && onMonthChange(mesSiguiente)}
          disabled={!mesSiguiente}
          aria-label="Mes siguiente"
          className={NAV_BUTTON}
        >
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 pb-1">
        {INICIALES_SEMANA.map((inicial, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="py-1 text-center text-[0.6rem] font-semibold tracking-wide text-[var(--site-on-surface-muted)] uppercase"
          >
            {inicial}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celdasDelMes(month).map((fecha, i) => {
          if (!fecha) return <span key={`hueco-${i}`} aria-hidden="true" />;

          const info = porFecha.get(fecha);
          const seleccionado = fecha === selected;
          const esHoy = fecha === today;
          // Sin info es un día fuera de la ventana cargada: ni abierto ni
          // cerrado, sencillamente todavía no se puede reservar. Se muestra
          // apagado y sin borde para que no parezca un "lleno".
          const reservable = Boolean(info && info.isOpen && info.freeSlots > 0);

          return (
            <button
              key={fecha}
              type="button"
              disabled={!reservable}
              aria-pressed={seleccionado}
              aria-label={`${longDateFmt.format(parseDateInput(fecha))}, ${
                !info
                  ? "todavía no se puede reservar"
                  : !info.isOpen
                    ? "cerrado"
                    : info.freeSlots === 0
                      ? esHoy
                        ? "cerrado por hoy"
                        : "sin cupos"
                      : `${info.freeSlots} horarios libres`
              }`}
              onClick={() => onSelect(fecha)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-[var(--site-radius)] border text-sm transition-all ${
                seleccionado
                  ? "border-[var(--site-accent)] bg-[var(--site-accent)] font-bold text-[var(--site-on-accent)]"
                  : reservable
                    ? "border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] hover:border-[var(--site-accent)]"
                    : info
                      ? "cursor-not-allowed border-transparent bg-[var(--site-surface-alt)] text-[var(--site-on-surface-muted)] opacity-85"
                      : "cursor-not-allowed border-transparent text-[var(--site-on-surface-muted)] opacity-65"
              } ${esHoy && !seleccionado ? "font-bold" : ""}`}
            >
              {parseDateInput(fecha).getDate()}
              {/* Un punto y no el número de cupos: en una celda no entra, y el
                  número exacto viaja en el aria-label. */}
              {reservable && !seleccionado && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--site-accent)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SlotGroupsProps {
  slots: (DaySlot | RescheduleSlot)[];
  /** "HH:MM" picked, or "" for none. */
  picked: string;
  onPick: (time: string) => void;
  timeFormat?: TimeFormat;
}

/** The day's slots grouped by part of the day; only `free` ones are buttons. */
export function SlotGroups({ slots: daySlots, picked, onPick, timeFormat }: SlotGroupsProps) {
  return (
    <div className="space-y-4">
      {SLOT_GROUPS.map((group) => {
        const slots = daySlots.filter((s) => hourOf(s) >= group.from && hourOf(s) < group.to);
        if (slots.length === 0) return null;

        const freeInGroup = slots.filter((s) => s.state === "free").length;

        return (
          <div key={group.id}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <h5 className="text-xs font-semibold tracking-wide text-[var(--site-on-surface)] uppercase">
                {group.label}
              </h5>
              <span className="text-[0.65rem] text-[var(--site-on-surface-muted)]">
                {freeInGroup === 0 ? "Sin cupos" : `${freeInGroup} disponibles`}
              </span>
            </div>

            <ul className="grid grid-cols-3 gap-2 @xs:grid-cols-4">
              {slots.map((slot) => {
                if (slot.state === "free") {
                  const isPicked = picked === slot.time;
                  return (
                    <li key={slot.time}>
                      <button
                        type="button"
                        onClick={() => onPick(slot.time)}
                        aria-pressed={isPicked}
                        // Misma altura que el turno ocupado: la grilla no se
                        // descuadra según qué haya reservado.
                        className={`flex h-11 w-full items-center justify-center rounded-[var(--site-radius)] border text-sm transition-all ${
                          isPicked
                            ? "border-[var(--site-accent)] bg-[var(--site-accent)] font-semibold text-[var(--site-on-accent)] shadow-sm"
                            : "border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] hover:border-[var(--site-accent)]"
                        }`}
                      >
                        {formatAppointmentTime(slot.time, timeFormat)}
                      </button>
                    </li>
                  );
                }

                // Ocupado, ya pasado o la hora actual de la cita que se mueve.
                // Va como texto y no como botón deshabilitado: no hay nada que
                // activar, y un lector de pantalla debe leer el estado.
                return (
                  <li
                    key={slot.time}
                    className={`flex h-11 flex-col items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] text-[var(--site-on-surface-muted)] ${
                      slot.state === "current" ? "border border-dashed border-[var(--site-accent)]" : ""
                    }`}
                  >
                    <span className="text-sm leading-none opacity-70">
                      {formatAppointmentTime(slot.time, timeFormat)}
                    </span>
                    <span className="mt-0.5 text-[0.55rem] uppercase opacity-70">
                      {slot.state === "taken" ? "Reservado" : slot.state === "current" ? "Tu cita" : "Pasó"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Carga fallida (red caída, RPC con error). Antes se leía como "Cargando…"
 * eterno o como "El negocio no atiende ese día", y el visitante se iba
 * creyendo que no había agenda.
 */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] px-4 py-5 text-center text-sm text-[var(--site-on-surface-muted)]"
    >
      <p>No pudimos cargar los horarios. Revisa tu conexión e inténtalo de nuevo.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[var(--site-radius)] border border-[var(--site-accent)] px-4 py-2 text-sm font-semibold text-[var(--site-on-surface)]"
      >
        Reintentar
      </button>
    </div>
  );
}
