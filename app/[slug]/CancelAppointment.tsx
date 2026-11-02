"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { formatAppointmentTime } from "@/lib/time";
import { normalizeColombianMobile } from "@/lib/co-mobile";
import { usePublicCancelStore } from "@/stores/public-cancel.store";
import type { PublicSite, UpcomingAppointment } from "@/services/public-site.types";

const longDateFmt = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "YYYY-MM-DD" a medianoche LOCAL: `new Date("YYYY-MM-DD")` sería UTC y correría el día. */
function dateOf(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

interface Props {
  site: Pick<PublicSite, "slug" | "timeFormat">;
}

/**
 * "¿Ya tienes una cita?" del sitio público: el visitante busca sus próximas
 * citas con el celular con el que reservó y cancela la que no va a usar.
 * Toda la I/O pasa por `usePublicCancelStore`.
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
  const appointments = usePublicCancelStore((s) => s.appointments);
  const searching = usePublicCancelStore((s) => s.searching);
  const cancellingId = usePublicCancelStore((s) => s.cancellingId);
  const cancelled = usePublicCancelStore((s) => s.cancelled);
  const error = usePublicCancelStore((s) => s.error);
  const search = usePublicCancelStore((s) => s.search);
  const cancel = usePublicCancelStore((s) => s.cancel);
  const reset = usePublicCancelStore((s) => s.reset);

  // Mismo validador y mismo texto que el formulario de reserva: con un número
  // que no es celular no hay cita que encontrar.
  const mobile = normalizeColombianMobile(phone);
  const phoneError = phoneTouched && !mobile;

  const when = (a: UpcomingAppointment) =>
    `${longDateFmt.format(dateOf(a.date))} a las ${formatAppointmentTime(a.time, site.timeFormat)}`;

  const close = () => {
    if (cancellingId) return;
    setOpen(false);
    setPhone("");
    setPhoneTouched(false);
    setConfirmingId(null);
    reset();
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPhoneTouched(true);
    setConfirmingId(null);
    if (!mobile) return;
    void search(site.slug, mobile);
  };

  const handleCancel = async (a: UpcomingAppointment) => {
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
        title={<span className="text-[var(--site-on-surface)]">Cancelar mi cita</span>}
        description={
          <span className="text-[var(--site-on-surface-muted)]">
            Escribe el celular con el que reservaste y te mostramos tus próximas citas.
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

        {appointments && appointments.length === 0 && !cancelled && (
          <p className="mt-4 text-sm text-[var(--site-on-surface-muted)]">
            No encontramos citas próximas con ese número.
          </p>
        )}

        {appointments && appointments.length > 0 && (
          <ul className="mt-4 space-y-2">
            {appointments.map((a) => {
              const busy = cancellingId === a.id;
              const asking = confirmingId === a.id;
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
                    {!asking && (
                      <button
                        type="button"
                        disabled={cancellingId !== null}
                        onClick={() => setConfirmingId(a.id)}
                        className={SECONDARY}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
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
                          disabled={busy}
                          onClick={() => setConfirmingId(null)}
                          className={`${SECONDARY} sm:flex-1`}
                        >
                          No, mantenerla
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-busy={busy || undefined}
                          onClick={() => void handleCancel(a)}
                          className={`${PRIMARY} sm:flex-1`}
                        >
                          {busy ? "Cancelando…" : "Sí, cancelar"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" onClick={close} disabled={cancellingId !== null} className={`${SECONDARY} mt-5 w-full`}>
          Cerrar
        </button>
      </Modal>
    </>
  );
}
