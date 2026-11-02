"use client";

import { useEffect, useRef, useState } from "react";
import { loadStatusOf } from "@/lib/booking-load-state";
import { claveMes, longDateFmt, parseDateInput, toDateInput } from "@/lib/booking-month";
import { markCurrentSlot, rescheduleWhen } from "@/lib/site-reschedule";
import type { TimeFormat } from "@/lib/time";
import { rescheduleSlotKeyOf, usePublicRescheduleStore } from "@/stores/public-reschedule.store";
import type { RescheduleResult, UpcomingAppointment } from "@/services/public-site.types";
import { LoadFailed, MonthCalendar, SlotGroups } from "./BookingPickers";

/** Same window as the booking widget (the availability RPC caps it at 60). */
const DAYS_AHEAD = 60;

const SITE_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--site-radius)] px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]";
const PRIMARY = `${SITE_BUTTON} bg-[var(--site-accent)] text-[var(--site-on-accent)]`;
const SECONDARY = `${SITE_BUTTON} border border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] hover:border-[var(--site-accent)]`;

interface Props {
  slug: string;
  timeFormat?: TimeFormat;
  /** Must pass `canReschedule` (it carries `serviceId`). */
  appointment: UpcomingAppointment;
  /** Phone the lookup list belongs to (`searchedPhone`), never the live input. */
  phone: string;
  onDone: (result: RescheduleResult) => void;
  onBack: () => void;
}

/**
 * "Cambiar fecha" inside a row of the lookup modal: day and time pickers for
 * the SAME service and professional, then "¿Pasar tu cita al …?".
 *
 * Rendered in the row, inside the `Modal`'s tree — not as another overlay: a
 * sibling overlay would sit inert under the `<dialog>` top layer. The slot
 * RPCs exclude this appointment, so its own time comes back free and is marked
 * "Tu cita" instead of offered as new (`markCurrentSlot`). The server checks
 * everything again under the booking lock.
 */
export function RescheduleAppointment({ slug, timeFormat, appointment, phone, onDone, onBack }: Props) {
  const serviceId = appointment.serviceId ?? "";
  const staffId = appointment.staffId ?? null;
  const [today] = useState(() => toDateInput(new Date()));
  const [month, setMonth] = useState(() => claveMes(today));
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [pickedTime, setPickedTime] = useState("");
  const [confirming, setConfirming] = useState(false);
  const pickHeadingRef = useRef<HTMLHeadingElement>(null);
  const confirmHeadingRef = useRef<HTMLParagraphElement>(null);

  const storedAvailKey = usePublicRescheduleStore((s) => s.availabilityKey);
  const storedAvailability = usePublicRescheduleStore((s) => s.availability);
  const availErrorKey = usePublicRescheduleStore((s) => s.availabilityErrorKey);
  const storedSlotKey = usePublicRescheduleStore((s) => s.slotKey);
  const storedSlots = usePublicRescheduleStore((s) => s.slots);
  const slotErrorKey = usePublicRescheduleStore((s) => s.slotErrorKey);
  const saving = usePublicRescheduleStore((s) => s.saving);
  const error = usePublicRescheduleStore((s) => s.error);
  const loadAvailability = usePublicRescheduleStore((s) => s.loadAvailability);
  const loadDay = usePublicRescheduleStore((s) => s.loadDay);
  const reschedule = usePublicRescheduleStore((s) => s.reschedule);
  const clearError = usePublicRescheduleStore((s) => s.clearError);

  const days = storedAvailKey === appointment.id ? storedAvailability : [];
  const availStatus = loadStatusOf({
    enabled: true,
    wantedKey: appointment.id,
    loadedKey: storedAvailKey,
    failedKey: availErrorKey,
    count: days.length,
  });

  const slotKey = pickedDate ? rescheduleSlotKeyOf(appointment.id, pickedDate) : null;
  const daySlots =
    pickedDate && storedSlotKey === slotKey ? markCurrentSlot(storedSlots, pickedDate, appointment) : [];
  const slotStatus = loadStatusOf({
    enabled: slotKey !== null,
    wantedKey: slotKey ?? "",
    loadedKey: storedSlotKey,
    failedKey: slotErrorKey,
    count: daySlots.length,
  });
  const freeTimes = daySlots.filter((s) => s.state === "free").map((s) => s.time);
  // A time this day no longer offers is simply not selected (derived).
  const time = freeTimes.includes(pickedTime) ? pickedTime : "";

  const refreshAvailability = () =>
    void loadAvailability({ slug, appointmentId: appointment.id, serviceId, staffId, from: today, days: DAYS_AHEAD });
  const refreshDay = () => {
    if (pickedDate) void loadDay({ slug, appointmentId: appointment.id, serviceId, staffId, date: pickedDate });
  };

  useEffect(() => {
    void loadAvailability({ slug, appointmentId: appointment.id, serviceId, staffId, from: today, days: DAYS_AHEAD });
  }, [loadAvailability, slug, appointment.id, serviceId, staffId, today]);

  useEffect(() => {
    if (!pickedDate) return;
    void loadDay({ slug, appointmentId: appointment.id, serviceId, staffId, date: pickedDate });
  }, [loadDay, slug, appointment.id, serviceId, staffId, pickedDate]);

  // Focus follows the step: the new heading is what a screen reader announces.
  useEffect(() => {
    (confirming ? confirmHeadingRef.current : pickHeadingRef.current)?.focus();
  }, [confirming]);

  const pickDate = (date: string) => {
    clearError();
    setPickedDate(date);
    setPickedTime("");
  };

  const handleConfirm = async () => {
    if (!pickedDate || !time) return;
    const result = await reschedule({ slug, phone, appointmentId: appointment.id, date: pickedDate, time });
    if (result) {
      onDone(result);
      return;
    }
    // The slot may have just been taken: back to the pickers, refreshed.
    setConfirming(false);
    refreshDay();
    refreshAvailability();
  };

  if (confirming && pickedDate && time) {
    return (
      <div role="group" aria-labelledby={`reschedule-confirm-${appointment.id}`} className="mt-3 border-t border-[var(--site-on-surface-border)] pt-3">
        <p
          id={`reschedule-confirm-${appointment.id}`}
          ref={confirmHeadingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-[var(--site-on-surface)] outline-none"
        >
          ¿Pasar tu cita al {rescheduleWhen(pickedDate, time, timeFormat)}?
        </p>
        <p className="mt-0.5 text-xs text-[var(--site-on-surface-muted)]">
          Tu horario actual queda libre y la cita vuelve a quedar pendiente hasta que el negocio la confirme.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={saving} onClick={() => setConfirming(false)} className={`${SECONDARY} sm:flex-1`}>
            Elegir otro horario
          </button>
          <button
            type="button"
            disabled={saving}
            aria-busy={saving || undefined}
            onClick={() => void handleConfirm()}
            className={`${PRIMARY} sm:flex-1`}
          >
            {saving ? "Cambiando…" : "Sí, cambiarla"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-[var(--site-on-surface-border)] pt-3">
      <h3
        ref={pickHeadingRef}
        tabIndex={-1}
        className="text-sm font-semibold text-[var(--site-on-surface)] outline-none"
      >
        Elige la nueva fecha
      </h3>
      <p className="mt-0.5 text-xs text-[var(--site-on-surface-muted)]">
        Mismo servicio{appointment.staff ? ` y con ${appointment.staff}` : ""}. Solo ves los horarios libres.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-[var(--site-on-surface)]">
          ⚠ {error}
        </p>
      )}

      <div className="mt-3 space-y-4">
        {availStatus === "failed" ? (
          <LoadFailed onRetry={refreshAvailability} />
        ) : availStatus === "loading" ? (
          <p className="py-3 text-sm text-[var(--site-on-surface-muted)]">Cargando disponibilidad…</p>
        ) : availStatus === "empty" ? (
          <p className="py-3 text-sm text-[var(--site-on-surface-muted)]">
            Por ahora no hay días disponibles. Escríbele al negocio para cambiar tu cita.
          </p>
        ) : (
          <MonthCalendar
            days={days}
            today={today}
            month={month}
            onMonthChange={setMonth}
            selected={pickedDate}
            onSelect={pickDate}
          />
        )}

        {pickedDate && (
          <section
            aria-label={`Horarios del ${longDateFmt.format(parseDateInput(pickedDate))}`}
            className="@container min-w-0"
          >
            <div aria-live="polite">
              {slotStatus === "loading" ? (
                <p className="py-3 text-sm text-[var(--site-on-surface-muted)]">Buscando horarios…</p>
              ) : slotStatus === "failed" ? (
                <LoadFailed onRetry={refreshDay} />
              ) : daySlots.length === 0 ? (
                <p className="rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] px-4 py-6 text-center text-sm text-[var(--site-on-surface-muted)]">
                  El negocio no atiende ese día. Elige otra fecha.
                </p>
              ) : (
                <SlotGroups slots={daySlots} picked={time} onPick={setPickedTime} timeFormat={timeFormat} />
              )}
            </div>
          </section>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onBack} className={`${SECONDARY} sm:flex-1`}>
          Mantener mi horario
        </button>
        <button
          type="button"
          disabled={!time}
          onClick={() => {
            clearError();
            setConfirming(true);
          }}
          className={`${PRIMARY} sm:flex-1`}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
