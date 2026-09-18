"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  usePublicBookingStore,
  slotKeyOf,
  availabilityKeyOf,
} from "@/stores/public-booking.store";
import type {
  PublicService,
  PublicStaff,
  PublicSite,
  DaySlot,
} from "@/services/public-site.types";
import { formatCOP } from "./templates/theme";
import { BOOK_SERVICE_EVENT } from "./BookServiceLink";

/**
 * Booking flow for a public visitor: service -> professional -> day -> time ->
 * contact details.
 *
 * The day strip and the slot grid mirror what the owner sees in the dashboard
 * calendar, with one hard rule: a busy slot says "Reservado" and NOTHING else.
 * The RPC behind it returns no appointment id, no customer, no professional —
 * so there is no name to leak even by accident.
 *
 * "Cualquiera disponible" is the default professional and travels as
 * `staffId: null`. That is not a UI shortcut: `appointments.staff_id` is
 * nullable and the slot RPC widens capacity to the whole roster when it is
 * null, so the shop stays bookable until every professional is busy.
 *
 * Styling comes entirely from the `--site-*` variables the surrounding template
 * publishes, so this looks native inside all three designs.
 */

/*
 * Dos meses de anticipación.
 *
 * Eran 21 días, elegidos cuando el selector era una tira horizontal donde
 * scrollear más lejos no tenía sentido. Con un calendario de mes, 21 días dejan
 * el mes siguiente casi entero en gris y el visitante cree que el negocio está
 * cerrado. Medido contra la base: pedir 60 días tarda 36 ms.
 */
const DAYS_AHEAD = 60;

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

interface Props {
  site: PublicSite;
  /** Preselected from a "Reservar" button on a service card. */
  initialServiceId?: string | null;
  onClose?: () => void;
}

/** Local YYYY-MM-DD; toISOString() would shift the day for negative offsets. */
function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parsed field by field: `new Date("2026-08-05")` is UTC and shifts a day. */
function parseDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function hourOf(slot: DaySlot): number {
  return Number(slot.time.slice(0, 2));
}

const mesFmt = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

/**
 * Empieza en domingo, como el resto de la app.
 *
 * `WEEKDAY_LABELS` y el `dow` de Postgres arrancan en domingo, y la lista de
 * horarios del micrositio se dibuja en ese orden. Un calendario que empezara en
 * lunes obligaría a leer dos órdenes distintos en la misma página.
 */
const INICIALES_SEMANA = ["D", "L", "M", "M", "J", "V", "S"] as const;

/** Clave `YYYY-MM` del mes de una fecha, para comparar meses sin tocar husos. */
const claveMes = (fecha: string) => fecha.slice(0, 7);

/**
 * Las celdas del mes que se está mirando, con los huecos del principio.
 *
 * Se arma desde el primer día del mes y no desde la lista cargada: un mes tiene
 * que verse entero aunque la disponibilidad empiece a mitad de mes, o el
 * visitante no reconoce el calendario.
 */
function celdasDelMes(mes: string): (string | null)[] {
  const [anio, num] = mes.split("-").map(Number);
  const primero = new Date(anio, num - 1, 1);
  const diasEnMes = new Date(anio, num, 0).getDate();
  const huecos = primero.getDay();
  const celdas: (string | null)[] = Array.from({ length: huecos }, () => null);
  for (let d = 1; d <= diasEnMes; d++) {
    celdas.push(`${anio}-${String(num).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return celdas;
}
const longDateFmt = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const shortDateFmt = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric" });

export function BookingWidget({ site, initialServiceId = null, onClose }: Props) {
  const [serviceId, setServiceId] = useState<string>(
    initialServiceId ?? site.services[0]?.id ?? "",
  );
  const [staffId, setStaffId] = useState<string | null>(null);
  const [today] = useState(() => toDateInput(new Date()));
  // null = "todavía no eligió". El día efectivo se DERIVA más abajo del primer
  // día con cupo, así que quien entra un domingo con el local cerrado no se
  // encuentra una grilla vacía y se va.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  /** Mes que se está mirando. Arranca en el de hoy. */
  const [mesVisible, setMesVisible] = useState(() => claveMes(toDateInput(new Date())));
  const [pickedTime, setPickedTime] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState<{ date: string; time: string; service: string } | null>(
    null,
  );

  const storedSlotKey = usePublicBookingStore((s) => s.slotKey);
  const storedSlots = usePublicBookingStore((s) => s.slots);
  const storedAvailKey = usePublicBookingStore((s) => s.availabilityKey);
  const storedAvailability = usePublicBookingStore((s) => s.availability);
  const submitting = usePublicBookingStore((s) => s.booking);
  const loadDay = usePublicBookingStore((s) => s.loadDay);
  const loadAvailability = usePublicBookingStore((s) => s.loadAvailability);
  const book = usePublicBookingStore((s) => s.book);

  const service: PublicService | undefined = site.services.find((s) => s.id === serviceId);
  const staffMember = site.staff.find((m) => m.id === staffId) ?? null;
  const canQuery = Boolean(serviceId);

  const availKey = availabilityKeyOf(serviceId, today, staffId);
  const days = canQuery && storedAvailKey === availKey ? storedAvailability : [];

  // El día mostrado: el que eligió el visitante, o el primero con cupo.
  const firstBookable = days.find((d) => d.isOpen && d.freeSlots > 0)?.date;

  /** Disponibilidad indexada por fecha: el calendario busca por celda. */
  const porFecha = new Map(days.map((d) => [d.date, d]));

  /*
   * Los meses navegables salen de la VENTANA CARGADA, no del calendario.
   * Dejar avanzar más allá llevaría a un mes entero en gris, que se lee como
   * "este negocio cerró" y no como "todavía no abrió la agenda".
   */
  const mesesConDatos = [...new Set(days.map((d) => claveMes(d.date)))].sort();
  const indiceMes = mesesConDatos.indexOf(mesVisible);
  const mesAnterior = indiceMes > 0 ? mesesConDatos[indiceMes - 1] : null;
  const mesSiguiente =
    indiceMes >= 0 && indiceMes < mesesConDatos.length - 1 ? mesesConDatos[indiceMes + 1] : null;
  const date = pickedDate ?? firstBookable ?? today;

  const slotKey = slotKeyOf(serviceId, date, staffId);

  useEffect(() => {
    if (!canQuery) return;
    void loadAvailability(site.slug, serviceId, today, DAYS_AHEAD, staffId);
  }, [canQuery, loadAvailability, site.slug, serviceId, today, staffId]);

  useEffect(() => {
    if (!canQuery || !date) return;
    void loadDay(site.slug, serviceId, date, staffId);
  }, [canQuery, loadDay, site.slug, serviceId, date, staffId]);

  useEffect(() => {
    const selectService = (event: Event) => {
      const nextServiceId = (event as CustomEvent<{ serviceId?: string }>).detail?.serviceId;
      if (!nextServiceId || !site.services.some((item) => item.id === nextServiceId)) return;
      setServiceId(nextServiceId);
      setPickedDate(null);
      setPickedTime("");
    };

    window.addEventListener(BOOK_SERVICE_EVENT, selectService);
    return () => window.removeEventListener(BOOK_SERVICE_EVENT, selectService);
  }, [site.services]);

  // "Loading" is a key mismatch, not a flag: the answer to an older
  // service/day/professional combination can never repaint a newer one.
  const loadingSlots = canQuery && storedSlotKey !== slotKey;
  const daySlots = canQuery && storedSlotKey === slotKey ? storedSlots : [];

  const freeTimes = daySlots.filter((s) => s.state === "free").map((s) => s.time);
  // A picked hour this combination no longer offers is simply not selected —
  // derived, so nothing has to clean it up.
  const time = freeTimes.includes(pickedTime) ? pickedTime : "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!service || !time) return;

    const result = await book({
      slug: site.slug,
      serviceId: service.id,
      date,
      time,
      customerName: name,
      customerPhone: phone,
      staffId,
      notes: notes || null,
    });

    if (result) {
      setConfirmed({ date: result.date, time: result.time, service: result.service });
      return;
    }

    // The RPC raises its business errors in Spanish, ready to show as-is.
    toast.error(usePublicBookingStore.getState().error ?? "No se pudo reservar.");
    // The slot may have just been taken by somebody else; refresh the grid.
    void loadDay(site.slug, serviceId, date, staffId);
    void loadAvailability(site.slug, serviceId, today, DAYS_AHEAD, staffId);
  }

  if (confirmed) {
    return (
      <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          ✓
        </p>
        <h3
          className="mt-2 text-xl font-semibold text-[var(--site-text)]"
          style={{ fontFamily: "var(--site-heading-font)" }}
        >
          ¡Listo, {name.split(" ")[0]}!
        </h3>
        <p className="mt-3 text-sm text-[var(--site-muted)]">
          Pedimos <strong className="text-[var(--site-text)]">{confirmed.service}</strong> para el{" "}
          <strong className="text-[var(--site-text)]">
            {longDateFmt.format(parseDateInput(confirmed.date))}
          </strong>{" "}
          a las <strong className="text-[var(--site-text)]">{confirmed.time}</strong>.
        </p>
        <p className="mt-3 text-sm text-[var(--site-muted)]">
          Queda <strong className="text-[var(--site-text)]">pendiente de confirmación</strong>. El
          negocio te escribe al {phone} para confirmarte.
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 py-2.5 text-sm font-medium text-[var(--site-text)]"
          >
            Cerrar
          </button>
        ) : null}
      </div>
    );
  }

  if (!site.services.length) {
    return (
      <p className="text-sm text-[var(--site-muted)]">
        Este negocio todavía no cargó sus servicios.
      </p>
    );
  }

  const fieldClass =
    "min-h-12 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3 py-2.5 text-sm text-[var(--site-text)] outline-none transition-colors focus:border-[var(--site-accent)] focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]/30";

  return (
    // min-w-0: el widget se monta dentro de columnas de grid en las plantillas.
    // Sin esto, la tira de días con overflow ensancha al padre en lugar de
    // scrollear, y el formulario entero se sale de la pantalla.
    <form onSubmit={handleSubmit} className="min-w-0 space-y-7">
      <Step n={1} title="¿Qué te hacés?">
        <select
          aria-label="Servicio"
          className={fieldClass}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          {site.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatCOP(s.price)} · {s.durationMinutes} min
            </option>
          ))}
        </select>

        {site.staff.length > 0 ? (
          <select
            aria-label="Profesional"
            className={`${fieldClass} mt-2`}
            value={staffId ?? ""}
            onChange={(e) => setStaffId(e.target.value || null)}
          >
            <option value="">Con cualquiera disponible</option>
            {site.staff.map((member: PublicStaff) => (
              <option key={member.id} value={member.id}>
                Con {member.fullName}
                {member.role ? ` · ${member.role}` : ""}
              </option>
            ))}
          </select>
        ) : null}
      </Step>

      {/* ---- Calendario del mes ---- */}
      <Step
        n={2}
        title="¿Qué día?"
        aside={
          <span className="flex items-center gap-1">
            {/*
              * Flechas de verdad, no scroll horizontal.
              *
              * Antes esto era una tira que se desplazaba de costado: con
              * trackpad se movía y con mouse no, así que el visitante no podía
              * pasar de la primera semana y creía que no había más turnos. Un
              * control que solo funciona con cierto hardware no es un control.
              */}
            <button
              type="button"
              onClick={() => setMesVisible(mesAnterior!)}
              disabled={!mesAnterior}
              aria-label="Mes anterior"
              className="grid h-8 w-8 place-items-center rounded-[var(--site-radius)] border border-[var(--site-border)] text-[var(--site-text)] transition-colors enabled:hover:border-[var(--site-accent)] disabled:opacity-30"
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            {/* `first-letter` y no `capitalize`: en español el mes va en
                minúscula y la preposición también. Con `capitalize` salía
                "Septiembre De 2026". Necesita ser inline-block para que
                ::first-letter aplique. */}
            <span className="inline-block min-w-[8.5rem] text-center text-xs font-semibold text-[var(--site-text)] first-letter:uppercase">
              {mesFmt.format(parseDateInput(`${mesVisible}-01`))}
            </span>
            <button
              type="button"
              onClick={() => setMesVisible(mesSiguiente!)}
              disabled={!mesSiguiente}
              aria-label="Mes siguiente"
              className="grid h-8 w-8 place-items-center rounded-[var(--site-radius)] border border-[var(--site-border)] text-[var(--site-text)] transition-colors enabled:hover:border-[var(--site-accent)] disabled:opacity-30"
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </span>
        }
      >
        {days.length === 0 ? (
          <p className="py-3 text-sm text-[var(--site-muted)]">Cargando disponibilidad…</p>
        ) : (
          <div>
            <div className="grid grid-cols-7 gap-1 pb-1">
              {INICIALES_SEMANA.map((inicial, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="py-1 text-center text-[0.6rem] font-semibold tracking-wide text-[var(--site-muted)] uppercase"
                >
                  {inicial}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {celdasDelMes(mesVisible).map((fecha, i) => {
                if (!fecha) return <span key={`hueco-${i}`} aria-hidden="true" />;

                const info = porFecha.get(fecha);
                const seleccionado = fecha === date;
                const esHoy = fecha === today;
                // Sin info es un día fuera de la ventana cargada: ni abierto ni
                // cerrado, sencillamente todavía no se puede reservar. Se
                // muestra apagado y sin borde para que no parezca un "lleno".
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
                            : `${info.freeSlots} turnos libres`
                    }`}
                    onClick={() => setPickedDate(fecha)}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-[var(--site-radius)] border text-sm transition-all ${
                      seleccionado
                        ? "border-[var(--site-accent)] bg-[var(--site-accent)] font-bold text-[var(--site-on-accent)]"
                        : reservable
                          ? "border-[var(--site-border)] text-[var(--site-text)] hover:border-[var(--site-accent)]"
                          : info
                            ? "cursor-not-allowed border-transparent bg-[var(--site-surface-alt)] text-[var(--site-muted)] opacity-70"
                            : "cursor-not-allowed border-transparent text-[var(--site-muted)] opacity-40"
                    } ${esHoy && !seleccionado ? "font-bold" : ""}`}
                  >
                    {parseDateInput(fecha).getDate()}
                    {/*
                      * Un punto y no el número de cupos: en una celda de
                      * calendario "20 libres" no entra, y lo que el visitante
                      * necesita saber para elegir el día es si hay o no hay.
                      * El número exacto viaja en el aria-label y la lista de
                      * horarios lo muestra entero al entrar.
                      */}
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
        )}
      </Step>

      {/* ---- Slot grid ---- */}
      <Step
        n={3}
        title="¿A qué hora?"
        aside={
          <span className="text-xs text-[var(--site-muted)]">
            {longDateFmt.format(parseDateInput(date))}
          </span>
        }
      >
        <div aria-live="polite">
          {loadingSlots ? (
            <p className="py-3 text-sm text-[var(--site-muted)]">Buscando horarios…</p>
          ) : daySlots.length === 0 ? (
            <p className="rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] px-4 py-6 text-center text-sm text-[var(--site-muted)]">
              El negocio no atiende ese día.
              <br />
              Elegí otra fecha arriba.
            </p>
          ) : (
            <div className="space-y-4">
              {SLOT_GROUPS.map((group) => {
                const slots = daySlots.filter(
                  (s) => hourOf(s) >= group.from && hourOf(s) < group.to,
                );
                if (slots.length === 0) return null;

                const freeInGroup = slots.filter((s) => s.state === "free").length;

                return (
                  <div key={group.id}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <h4 className="text-xs font-semibold tracking-wide text-[var(--site-text)] uppercase">
                        {group.label}
                      </h4>
                      <span className="text-[0.65rem] text-[var(--site-muted)]">
                        {freeInGroup === 0 ? "Sin cupos" : `${freeInGroup} disponibles`}
                      </span>
                    </div>

                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((slot) => {
                        if (slot.state === "free") {
                          const isPicked = time === slot.time;
                          return (
                            <li key={slot.time}>
                              <button
                                type="button"
                                onClick={() => setPickedTime(slot.time)}
                                aria-pressed={isPicked}
                                // Misma altura que el turno ocupado: la grilla no
                                // se descuadra según qué haya reservado.
                                className={`flex h-11 w-full items-center justify-center rounded-[var(--site-radius)] border text-sm transition-all ${
                                  isPicked
                                    ? "border-[var(--site-accent)] bg-[var(--site-accent)] font-semibold text-[var(--site-on-accent)] shadow-sm"
                                    : "border-[var(--site-border)] text-[var(--site-text)] hover:border-[var(--site-accent)]"
                                }`}
                              >
                                {slot.time}
                              </button>
                            </li>
                          );
                        }

                        // Ocupado o ya pasado. Va como texto y no como botón
                        // deshabilitado: no hay nada que activar, y un lector de
                        // pantalla debe leer el estado, no ofrecer un control muerto.
                        return (
                          <li
                            key={slot.time}
                            className="flex h-11 flex-col items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] text-[var(--site-muted)]"
                          >
                            <span className="text-sm leading-none opacity-70">{slot.time}</span>
                            <span className="mt-0.5 text-[0.55rem] uppercase opacity-70">
                              {slot.state === "taken" ? "Reservado" : "Pasó"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Step>

      <Step n={4} title="¿Cómo te contactamos?">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            aria-label="Tu nombre"
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            autoComplete="name"
            placeholder="Tu nombre"
          />
          <input
            aria-label="Tu celular"
            className={fieldClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="Tu celular"
          />
        </div>
        <input
          aria-label="Comentario opcional"
          className={`${fieldClass} mt-2`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="¿Algo que debamos saber? (opcional)"
        />
      </Step>

      {/* ---- Resumen + CTA ---- */}
      <div className="space-y-3 border-t border-[var(--site-border)] pt-5">
        {time && service ? (
          <dl className="space-y-1.5 rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] p-4 text-sm">
            <SummaryRow label="Servicio" value={service.name} />
            <SummaryRow label="Con" value={staffMember?.fullName ?? "Cualquiera disponible"} />
            <SummaryRow
              label="Cuándo"
              value={`${shortDateFmt.format(parseDateInput(date))} · ${time} h`}
            />
            <SummaryRow label="Precio" value={formatCOP(service.price)} strong />
          </dl>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !time || !name || !phone}
          className="min-h-12 w-full rounded-[var(--site-radius)] bg-[var(--site-accent)] px-4 py-3.5 text-sm font-semibold text-[var(--site-on-accent)] transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)] disabled:opacity-40"
        >
          {submitting ? "Enviando…" : time ? `Reservar a las ${time}` : "Reservar turno"}
        </button>

        {/* Dice qué falta, en vez de dejar un botón apagado sin explicación. */}
        <p className="text-center text-xs text-[var(--site-muted)]">
          {!time
            ? "Elegí un horario para continuar."
            : !name || !phone
              ? "Completá tu nombre y celular."
              : "Tu reserva queda pendiente hasta que el negocio la confirme."}
        </p>
      </div>
    </form>
  );
}

/** Paso numerado: convierte un formulario largo en una secuencia corta. */
function Step({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="flex items-baseline gap-2 text-sm font-semibold text-[var(--site-text)]">
          <span
            aria-hidden="true"
            className="text-xs font-bold text-[var(--site-muted)] tabular-nums"
          >
            {n}.
          </span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--site-muted)]">{label}</dt>
      <dd
        className={`text-right break-words text-[var(--site-text)] ${strong ? "font-bold" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}
