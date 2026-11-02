"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { normalizeColombianMobile } from "@/lib/co-mobile";
import { canReschedule, rescheduleWhen } from "@/lib/site-reschedule";
import { usePublicCancelStore } from "@/stores/public-cancel.store";
import { usePublicRescheduleStore } from "@/stores/public-reschedule.store";
import type { PublicSite, RescheduleResult, UpcomingAppointment } from "@/services/public-site.types";
import { RescheduleAppointment } from "./RescheduleAppointment";

interface Props {
  site: Pick<PublicSite, "slug" | "timeFormat">;
}

/**
 * "¿Ya tienes una cita?" del sitio público: el visitante busca sus próximas
 * citas con el celular con el que reservó y cancela la que no va a usar o la
 * cambia de fecha ("Cambiar fecha", `RescheduleAppointment`, en la misma fila).
 * Toda la I/O pasa por `usePublicCancelStore` y `usePublicRescheduleStore`.
 *
 * Se pinta con las `--site-on-surface*` de la plantilla, como el widget de
 * reservas, y no con los tokens del panel: con ellos el modal salía con los
 * colores de Ventex encima de un sitio oscuro o de marca. El `Modal` se queda
 * por el comportamiento (foco, Escape, scroll); su panel se repinta con
 * `className` y el título va en un `<span>` con el color del sitio. La
 * confirmación es un paso EN LA FILA y no el `ConfirmDialog` del panel, que
 * traería otra vez los colores de la plataforma.
 */
const SITE_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--site-radius)] px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]";
const PRIMARY = `${SITE_BUTTON} bg-[var(--site-accent)] text-[var(--site-on-accent)]`;
const SECONDARY = `${SITE_BUTTON} border border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] hover:border-[var(--site-accent)]`;

export function CancelAppointment({ site }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  /** El aviso del celular aparece al salir del campo o al buscar, no al tipear. */
  const [phoneTouched, setPhoneTouched] = useState(false);
  /** Cita cuya fila está preguntando "¿seguro?". */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** Cita cuya fila muestra el paso "Cambiar fecha". */
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  /** Último cambio de fecha, para el mensaje de éxito. */
  const [rescheduled, setRescheduled] = useState<RescheduleResult | null>(null);
  const appointments = usePublicCancelStore((s) => s.appointments);
  const searching = usePublicCancelStore((s) => s.searching);
  const cancellingId = usePublicCancelStore((s) => s.cancellingId);
  const cancelled = usePublicCancelStore((s) => s.cancelled);
  const error = usePublicCancelStore((s) => s.error);
  const search = usePublicCancelStore((s) => s.search);
  const cancel = usePublicCancelStore((s) => s.cancel);
  const reset = usePublicCancelStore((s) => s.reset);
  const searchedPhone = usePublicCancelStore((s) => s.searchedPhone);
  const applyReschedule = usePublicCancelStore((s) => s.applyReschedule);
  const savingReschedule = usePublicRescheduleStore((s) => s.saving);
  const resetReschedule = usePublicRescheduleStore((s) => s.reset);
  const busy = cancellingId !== null || savingReschedule;

  // Mismo validador y mismo texto que el formulario de reserva: con un número
  // que no es celular no hay cita que encontrar.
  const mobile = normalizeColombianMobile(phone);
  const phoneError = phoneTouched && !mobile;

  const when = (a: Pick<UpcomingAppointment, "date" | "time">) =>
    rescheduleWhen(a.date, a.time, site.timeFormat);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPhone("");
    setPhoneTouched(false);
    setConfirmingId(null);
    setReschedulingId(null);
    setRescheduled(null);
    reset();
    resetReschedule();
  };

  const startReschedule = (id: string) => {
    resetReschedule();
    setConfirmingId(null);
    setRescheduled(null);
    setReschedulingId(id);
  };

  const handleRescheduled = (result: RescheduleResult) => {
    applyReschedule(result);
    setReschedulingId(null);
    setRescheduled(result);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPhoneTouched(true);
    setConfirmingId(null);
    setReschedulingId(null);
    setRescheduled(null);
    if (!mobile) return;
    void search(site.slug, mobile);
  };

  const handleCancel = async (a: UpcomingAppointment) => {
    setRescheduled(null);
    const ok = await cancel(site.slug, a.id);
    if (ok) setConfirmingId(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] px-4 py-2.5 text-sm font-medium text-[var(--site-on-surface)] transition-colors hover:border-[var(--site-accent)]"
      >
        Cancelar cita
      </button>

      <Modal
        open={open}
        onClose={close}
        title={<span className="text-[var(--site-on-surface)]">Cancelar o cambiar mi cita</span>}
        description={
          <span className="text-[var(--site-on-surface-muted)]">
            Escribe el celular con el que reservaste y te mostramos tus próximas citas para cancelarlas o
            cambiarlas de fecha.
          </span>
        }
        size="md"
        placement="sheet"
        showCloseButton={false}
        className="rounded-[var(--site-radius)]! border-[var(--site-on-surface-border)]! bg-[var(--site-surface)]! text-[var(--site-on-surface)]!"
        bodyClassName="px-6 pb-6"
      >
        <form onSubmit={handleSearch} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="cancel-phone" className="block text-xs font-semibold text-[var(--site-on-surface)]">
              Celular
            </label>
            <input
              id="cancel-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(phone.trim() !== "")}
              aria-invalid={phoneError || undefined}
              aria-describedby={phoneError ? "cancel-phone-hint" : undefined}
              className={`min-h-12 w-full rounded-[var(--site-radius)] border bg-[var(--site-surface)] px-3 py-2.5 text-sm text-[var(--site-on-surface)] outline-none transition-colors focus:border-[var(--site-accent)] focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]/30 ${
                phoneError ? "border-2 border-[var(--site-on-surface)]" : "border-[var(--site-on-surface-border)]"
              }`}
            />
            {phoneError && (
              <p id="cancel-phone-hint" className="text-xs font-semibold text-[var(--site-on-surface)]">
                ⚠ Escribe un celular de 10 dígitos que empiece por 3.
              </p>
            )}
          </div>
          <button type="submit" disabled={searching} aria-busy={searching || undefined} className={`${PRIMARY} sm:mt-5`}>
            {searching ? "Buscando…" : "Buscar mis citas"}
          </button>
        </form>

        {/* Sin color de error propio en la paleta del sitio: el aviso se marca
            con peso y el ícono, igual que el error del celular en la reserva. */}
        {error && (
          <p role="alert" className="mt-4 text-sm font-semibold text-[var(--site-on-surface)]">
            ⚠ {error}
          </p>
        )}

        {cancelled && (
          <p
            role="status"
            className="mt-4 rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] p-3 text-sm text-[var(--site-on-surface)]"
          >
            Listo, cancelamos tu cita de {cancelled.service ?? "servicio"} del {when(cancelled)}. El
            negocio ya recibió el aviso.
          </p>
        )}

        {/* Vive fuera de la fila: al cambiar de fecha la lista se reordena. */}
        <div aria-live="polite">
          {rescheduled && (
            <p className="mt-4 rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] p-3 text-sm text-[var(--site-on-surface)]">
              Tu cita quedó para el {when(rescheduled)}. El negocio la confirmará.
            </p>
          )}
        </div>

        {appointments && appointments.length === 0 && !cancelled && (
          <p className="mt-4 text-sm text-[var(--site-on-surface-muted)]">
            No encontramos citas próximas con ese número.
          </p>
        )}

        {appointments && appointments.length > 0 && (
          <ul className="mt-4 space-y-2">
            {appointments.map((a) => {
              const cancellingThis = cancellingId === a.id;
              const asking = confirmingId === a.id;
              const moving = reschedulingId === a.id && searchedPhone !== null;
              return (
                <li
                  key={a.id}
                  className="rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] p-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-[var(--site-on-surface)] first-letter:uppercase">{when(a)}</p>
                      <p className="text-[var(--site-on-surface-muted)]">
                        {a.service ?? "Cita"}
                        {a.staff ? ` · con ${a.staff}` : ""}
                        {a.status === "pending" ? " · pendiente de confirmación" : ""}
                      </p>
                    </div>
                    {!asking && !moving && (
                      <div className="flex gap-2">
                        {canReschedule(a) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startReschedule(a.id)}
                            aria-label={`Cambiar fecha de la cita del ${when(a)}`}
                            className={`${SECONDARY} flex-1 sm:flex-none`}
                          >
                            Cambiar fecha
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setReschedulingId(null);
                            setConfirmingId(a.id);
                          }}
                          className={`${SECONDARY} flex-1 sm:flex-none`}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                  {moving && searchedPhone && (
                    <RescheduleAppointment
                      slug={site.slug}
                      timeFormat={site.timeFormat}
                      appointment={a}
                      phone={searchedPhone}
                      onDone={handleRescheduled}
                      onBack={() => setReschedulingId(null)}
                    />
                  )}
                  {asking && (
                    <div
                      role="group"
                      aria-label="¿Cancelar esta cita?"
                      className="mt-3 border-t border-[var(--site-on-surface-border)] pt-3"
                    >
                      <p className="text-sm font-semibold text-[var(--site-on-surface)]">¿Cancelar esta cita?</p>
                      <p className="mt-0.5 text-xs text-[var(--site-on-surface-muted)]">
                        El horario queda libre para otra persona y el negocio recibe el aviso.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          disabled={cancellingThis}
                          onClick={() => setConfirmingId(null)}
                          className={`${SECONDARY} sm:flex-1`}
                        >
                          No, mantenerla
                        </button>
                        <button
                          type="button"
                          disabled={cancellingThis}
                          aria-busy={cancellingThis || undefined}
                          onClick={() => void handleCancel(a)}
                          className={`${PRIMARY} sm:flex-1`}
                        >
                          {cancellingThis ? "Cancelando…" : "Sí, cancelar"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" onClick={close} disabled={busy} className={`${SECONDARY} mt-5 w-full`}>
          Cerrar
        </button>
      </Modal>
    </>
  );
}
