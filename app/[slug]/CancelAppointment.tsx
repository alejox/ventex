"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatAppointmentTime } from "@/lib/time";
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
 */
export function CancelAppointment({ site }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const appointments = usePublicCancelStore((s) => s.appointments);
  const searching = usePublicCancelStore((s) => s.searching);
  const cancellingId = usePublicCancelStore((s) => s.cancellingId);
  const cancelled = usePublicCancelStore((s) => s.cancelled);
  const error = usePublicCancelStore((s) => s.error);
  const search = usePublicCancelStore((s) => s.search);
  const cancel = usePublicCancelStore((s) => s.cancel);
  const reset = usePublicCancelStore((s) => s.reset);
  const { confirm, dialog } = useConfirm();

  const when = (a: UpcomingAppointment) =>
    `${longDateFmt.format(dateOf(a.date))} a las ${formatAppointmentTime(a.time, site.timeFormat)}`;

  const close = () => {
    if (cancellingId) return;
    setOpen(false);
    setPhone("");
    reset();
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void search(site.slug, phone);
  };

  const handleCancel = async (a: UpcomingAppointment) => {
    const ok = await confirm({
      title: "¿Cancelar esta cita?",
      description: `${a.service ?? "Cita"} · ${when(a)}. El horario queda libre para otra persona y el negocio recibe el aviso.`,
      confirmLabel: "Sí, cancelar",
      cancelLabel: "No, mantenerla",
      tone: "danger",
    });
    if (!ok) return;
    await cancel(site.slug, a.id);
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
        title="Cancelar mi cita"
        description="Escribe el celular con el que reservaste y te mostramos tus próximas citas."
        size="md"
        placement="sheet"
        bodyClassName="px-6 pb-6"
      >
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="cancel-phone" className="block text-xs font-semibold text-on-surface">
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
              className="min-h-12 w-full rounded-xl border border-outline-variant bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
          <Button type="submit" loading={searching} loadingLabel="Buscando…">
            Buscar mis citas
          </Button>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-error">
            {error}
          </p>
        )}

        {cancelled && (
          <p role="status" className="mt-4 rounded-xl bg-surface-container p-3 text-sm text-on-surface">
            Listo, cancelamos tu cita de {cancelled.service ?? "servicio"} del {when(cancelled)}. El
            negocio ya recibió el aviso.
          </p>
        )}

        {appointments && appointments.length === 0 && !cancelled && (
          <p className="mt-4 text-sm text-on-surface-variant">
            No encontramos citas próximas con ese número.
          </p>
        )}

        {appointments && appointments.length > 0 && (
          <ul className="mt-4 space-y-2">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-on-surface first-letter:uppercase">{when(a)}</p>
                  <p className="text-on-surface-variant">
                    {a.service ?? "Cita"}
                    {a.staff ? ` · con ${a.staff}` : ""}
                    {a.status === "pending" ? " · pendiente de confirmación" : ""}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={cancellingId === a.id}
                  loadingLabel="Cancelando…"
                  disabled={cancellingId !== null && cancellingId !== a.id}
                  onClick={() => void handleCancel(a)}
                >
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {/* Dentro del árbol del Modal: como hermano quedaría inerte debajo del fondo. */}
        {dialog}
      </Modal>
    </>
  );
}
