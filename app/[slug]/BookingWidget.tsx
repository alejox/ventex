"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { formatCOP, whatsappHref } from "./templates/theme";
import { formatDuration } from "@/lib/duration";
import { formatAppointmentTime } from "@/lib/time";
import { BOOK_SERVICE_EVENT } from "./BookServiceLink";
import { normalizeColombianMobile } from "@/lib/co-mobile";
import { loadStatusOf } from "@/lib/booking-load-state";
import { buildIcs, googleCalendarUrl, type BookingEvent } from "@/lib/booking-calendar";
import { formatColombianMobile } from "@/lib/phone-format";
import { esImagenAjena } from "@/lib/remoteImage";

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
 *
 * Concretamente los `--site-on-surface*`, no los `--site-text` / `--site-muted`
 * del fondo de la página: este widget siempre se monta dentro de
 * `.site-booking-panel`, que se pinta con `--site-surface`. En Qutter —fondo
 * blanco, superficies negras— usar los del fondo daba `#111` sobre `#1a1a1a` y
 * el formulario entero era invisible. Así el widget se ve igual esté donde
 * esté, y el contraste lo garantiza la paleta en un solo lugar.
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
/**
 * Lleva el paso de contacto a la vista después de elegir la hora, solo si no
 * se ve ya. En una columna (celular) el formulario queda debajo de calendario y
 * horarios; en dos columnas ya está a la vista y no se mueve nada.
 */
function revealIfBelow(el: HTMLElement | null) {
  if (!el) return;
  const { top } = el.getBoundingClientRect();
  if (top < window.innerHeight * 0.75) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
  // null = "todavía no eligió": los horarios aparecen al tocar un día, junto al
  // calendario, y mientras tanto se pide elegir uno.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  /** Mes que se está mirando. Arranca en el de hoy. */
  const [mesVisible, setMesVisible] = useState(() => claveMes(toDateInput(new Date())));
  /** Paso 3: después de elegir la hora en el celular se lleva a la vista. */
  const contactRef = useRef<HTMLDivElement>(null);
  const [pickedTime, setPickedTime] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  /** El error del celular se muestra recién al salir del campo, no al tipear. */
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState<{
    id: string;
    date: string;
    time: string;
    service: string;
    staff: string | null;
    whatsapp: string | null;
  } | null>(null);

  const storedSlotKey = usePublicBookingStore((s) => s.slotKey);
  const storedSlots = usePublicBookingStore((s) => s.slots);
  const storedAvailKey = usePublicBookingStore((s) => s.availabilityKey);
  const storedAvailability = usePublicBookingStore((s) => s.availability);
  const slotErrorKey = usePublicBookingStore((s) => s.slotErrorKey);
  const availErrorKey = usePublicBookingStore((s) => s.availabilityErrorKey);
  const submitting = usePublicBookingStore((s) => s.booking);
  const loadDay = usePublicBookingStore((s) => s.loadDay);
  const loadAvailability = usePublicBookingStore((s) => s.loadAvailability);
  const book = usePublicBookingStore((s) => s.book);

  const service: PublicService | undefined = site.services.find((s) => s.id === serviceId);
  const staffMember = site.staff.find((m) => m.id === staffId) ?? null;
  const canQuery = Boolean(serviceId);

  const availKey = availabilityKeyOf(serviceId, today, staffId);
  const days = canQuery && storedAvailKey === availKey ? storedAvailability : [];
  const availStatus = loadStatusOf({
    enabled: canQuery,
    wantedKey: availKey,
    loadedKey: storedAvailKey,
    failedKey: availErrorKey,
    count: days.length,
  });

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
  const date = pickedDate;

  const slotKey = date ? slotKeyOf(serviceId, date, staffId) : null;

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
  const daySlots = canQuery && slotKey && storedSlotKey === slotKey ? storedSlots : [];
  const slotStatus = loadStatusOf({
    enabled: canQuery && slotKey !== null,
    wantedKey: slotKey ?? "",
    loadedKey: storedSlotKey,
    failedKey: slotErrorKey,
    count: daySlots.length,
  });
  const retryAvailability = () =>
    void loadAvailability(site.slug, serviceId, today, DAYS_AHEAD, staffId);
  const retryDay = () => {
    if (date) void loadDay(site.slug, serviceId, date, staffId);
  };

  const freeTimes = daySlots.filter((s) => s.state === "free").map((s) => s.time);
  // A picked hour this combination no longer offers is simply not selected —
  // derived, so nothing has to clean it up.
  const time = freeTimes.includes(pickedTime) ? pickedTime : "";

  // B24: celular colombiano de 10 dígitos (con o sin +57). Con un número mal
  // escrito el negocio no tiene cómo confirmarle la cita por WhatsApp.
  const mobile = normalizeColombianMobile(phone);
  const phoneError = phoneTouched && phone.trim() !== "" && !mobile;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!service || !time || !date) return;
    if (!mobile) {
      setPhoneTouched(true);
      return;
    }

    const result = await book({
      slug: site.slug,
      serviceId: service.id,
      date,
      time,
      customerName: name,
      customerPhone: mobile,
      staffId,
      notes: notes || null,
    });

    if (result) {
      setConfirmed({
        id: result.id,
        date: result.date,
        time: result.time,
        service: result.service,
        staff: result.staff ?? null,
        whatsapp: result.whatsapp ?? site.whatsapp ?? null,
      });
      return;
    }

    // The RPC raises its business errors in Spanish, ready to show as-is.
    toast.error(usePublicBookingStore.getState().error ?? "No se pudo reservar.");
    // The slot may have just been taken by somebody else; refresh the grid.
    retryDay();
    void loadAvailability(site.slug, serviceId, today, DAYS_AHEAD, staffId);
  }

  if (confirmed) {
    const cuando = `${longDateFmt.format(parseDateInput(confirmed.date))} a las ${formatAppointmentTime(confirmed.time, site.timeFormat)}`;
    /*
     * La reserva entra PENDIENTE y la confirma una persona del negocio. Antes
     * la pantalla terminaba en "te escribimos" y el visitante no tenía nada que
     * hacer más que esperar; con el WhatsApp del negocio a un toque, quien
     * quiere certeza la pide en el momento, y el mensaje ya dice qué reservó.
     */
    const mensaje = `Hola ${site.businessName}, acabo de reservar ${confirmed.service} para el ${cuando} a nombre de ${name.trim()}. ¿Me la confirman?`;
    /*
     * La cita para el calendario del visitante, a la hora del NEGOCIO
     * (`site.timezone`; sin zona válida, hora flotante — ver
     * `lib/booking-calendar.ts`). La duración es la del servicio elegido; si ya
     * no está en la lista, una hora, que es más útil que no poder agendarla.
     */
    const evento: BookingEvent = {
      uid: confirmed.id,
      title: `${confirmed.service} en ${site.businessName}`,
      date: confirmed.date,
      time: confirmed.time,
      durationMinutes: service?.durationMinutes ?? 60,
      timeZone: site.timezone,
      location: site.address,
      description: [
        `Reserva en ${site.businessName}, pendiente de confirmación.`,
        notes.trim() ? `Comentario: ${notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
    const descargarIcs = () => {
      const blob = new Blob([buildIcs(evento, new Date())], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cita-${site.slug}-${confirmed.date}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Diferido: Safari cancela la descarga si la URL se revoca en el mismo tick.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
      <div className="rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] bg-[var(--site-surface)] p-6 text-center">
        <div
          aria-hidden="true"
          className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--site-accent)] text-xl font-bold text-[var(--site-on-accent)]"
        >
          ✓
        </div>
        <h3
          className="mt-3 text-xl font-semibold text-[var(--site-on-surface)]"
          style={{ fontFamily: "var(--site-heading-font)" }}
        >
          ¡Listo, {name.split(" ")[0]}! Recibimos tu reserva
        </h3>

        <dl className="mt-4 space-y-1.5 rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] p-4 text-left text-sm">
          <SummaryRow label="Servicio" value={confirmed.service} />
          <SummaryRow label="Con" value={staffMember?.fullName ?? confirmed.staff ?? "Cualquiera disponible"} />
          <SummaryRow label="Cuándo" value={cuando} />
          {service ? (
            <SummaryRow label="Duración" value={formatDuration(service.durationMinutes)} />
          ) : null}
        </dl>

        <p className="mt-4 text-sm text-[var(--site-on-surface-muted)]">
          Queda <strong className="text-[var(--site-on-surface)]">pendiente de confirmación</strong>. El
          negocio te escribe al <strong className="text-[var(--site-on-surface)]">{formatColombianMobile(phone)}</strong> para
          confirmarte.
        </p>

        {confirmed.whatsapp ? (
          <a
            href={whatsappHref(confirmed.whatsapp, mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-accent)] px-4 py-3 text-sm font-semibold text-[var(--site-on-accent)]"
          >
            Escribir al negocio por WhatsApp
          </a>
        ) : null}

        {/* Agregar a mi calendario: Google por enlace, el resto (Apple, Outlook)
            con el .ics, que se arma en el navegador. */}
        <div
          role="group"
          aria-labelledby="booking-add-calendar"
          className="mt-5 rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] p-4 text-left"
        >
          <p id="booking-add-calendar" className="text-sm font-semibold text-[var(--site-on-surface)]">
            Agregar a mi calendario
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href={googleCalendarUrl(evento)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] px-4 py-2.5 text-sm font-medium text-[var(--site-on-surface)] transition-colors hover:border-[var(--site-accent)]"
            >
              Google Calendar
            </a>
            <button
              type="button"
              onClick={descargarIcs}
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] px-4 py-2.5 text-sm font-medium text-[var(--site-on-surface)] transition-colors hover:border-[var(--site-accent)]"
            >
              Descargar .ics
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--site-on-surface-muted)]">
            El archivo .ics sirve para Apple Calendar, Outlook y otros.
          </p>
        </div>

        <p className="mt-4 text-sm text-[var(--site-on-surface-muted)]">
          ¿No puedes ir? Usa <strong className="text-[var(--site-on-surface)]">«Cancelar cita»</strong>{" "}
          más abajo con tu celular.
        </p>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] px-4 py-2.5 text-sm font-medium text-[var(--site-on-surface)]"
          >
            Cerrar
          </button>
        ) : null}
      </div>
    );
  }

  if (!site.services.length) {
    return (
      <p className="text-sm text-[var(--site-on-surface-muted)]">
        Este negocio todavía no cargó sus servicios.
      </p>
    );
  }

  const fieldClass =
    "min-h-12 w-full rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] bg-[var(--site-surface)] px-3 py-2.5 text-sm text-[var(--site-on-surface)] outline-none transition-colors focus:border-[var(--site-accent)] focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]/30";

  return (
    // min-w-0: el widget se monta dentro de columnas de grid en las plantillas.
    // Sin esto, la tira de días con overflow ensancha al padre en lugar de
    // scrollear, y el formulario entero se sale de la pantalla.
    <form onSubmit={handleSubmit} className="@container min-w-0">
      {/*
        * Dos columnas cuando hay lugar: elegir a la izquierda, tus datos a la
        * derecha. En una sola columna el contacto quedaba debajo de todo y en un
        * monitor ancho sobraba media pantalla mientras el visitante scrolleaba.
        *
        * La condición es `@3xl` —una CONSULTA DE CONTENEDOR— y no `lg`. Este
        * widget lo monta cada plantilla en un lugar distinto: una lo pone a todo
        * lo ancho y otra dentro de una columna de un grid. Con `lg`, que mira la
        * VENTANA, un monitor grande partía en dos columnas un widget de 400px de
        * ancho y quedaban dos columnas de 200. La pregunta correcta no es "qué
        * tan grande es la pantalla" sino "cuánto lugar tengo".
        *
        * Las columnas van en FRACCIONES y no con un ancho fijo a la derecha: con
        * 20rem clavados, el formulario de contacto quedaba angosto por más que
        * el contenedor creciera, y todo el espacio extra se lo llevaba el
        * calendario, que ya tenía de sobra. El `minmax(18rem, …)` es el piso:
        * abajo de eso "Tu nombre" y "Tu celular" dejan de entrar uno al lado del
        * otro.
        */}
      <div className="grid gap-7 @3xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)] @3xl:items-start @3xl:gap-10">
        <div className="min-w-0 space-y-7">
      <Step n={1} title="¿Qué te haces?">
        <select
          aria-label="Servicio"
          className={fieldClass}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          {site.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatCOP(s.price)} · {formatDuration(s.durationMinutes)}
            </option>
          ))}
        </select>

        {site.staff.length > 0 ? (
          /*
           * Tarjetas con foto en vez de un <select>: a quien te atiende se lo
           * elige por la cara, y un desplegable escondía al equipo detrás de un
           * clic. Son radios NATIVOS (ocultos a la vista, no al lector de
           * pantalla) dentro de un <fieldset>: flechas, Tab y anuncio de
           * "1 de 4" vienen del navegador sin escribir un roving tabindex.
           */
          <fieldset className="mt-3 min-w-0">
            <legend className="mb-1.5 text-xs font-semibold text-[var(--site-on-surface)]">
              ¿Con quién?
            </legend>
            <div role="radiogroup" aria-label="Profesional" className="grid gap-2 @md:grid-cols-2">
              <StaffCard
                name="booking-staff"
                value=""
                checked={staffId === null}
                onSelect={() => setStaffId(null)}
                title="Cualquiera disponible"
                subtitle="Te atiende quien esté libre"
              />
              {site.staff.map((member: PublicStaff) => (
                <StaffCard
                  key={member.id}
                  name="booking-staff"
                  value={member.id}
                  checked={staffId === member.id}
                  onSelect={() => setStaffId(member.id)}
                  title={member.fullName}
                  subtitle={member.role}
                  photoUrl={member.photoUrl}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
      </Step>

      {/* ---- Calendario del mes ---- */}
      <Step n={2} title="¿Qué día?">
        {availStatus === "failed" ? (
          <LoadFailed onRetry={retryAvailability} />
        ) : availStatus === "empty" ? (
          <p className="py-3 text-sm text-[var(--site-on-surface-muted)]">
            Por ahora no hay días disponibles para reservar.
          </p>
        ) : days.length === 0 ? (
          <p className="py-3 text-sm text-[var(--site-on-surface-muted)]">Cargando disponibilidad…</p>
        ) : (
          /*
           * Horarios EN LÍNEA, no en un modal: el modal se abría al tocar el día
           * y tapaba el calendario, así que comparar dos días era abrir, cerrar
           * y volver a abrir. Ahora tocar un día solo lo elige; sus horarios
           * aparecen al lado del calendario si el contenedor da (consulta de
           * contenedor, por lo mismo que el layout de dos columnas) y debajo si
           * no, y el calendario sigue navegable.
           */
          <div className="@container">
          <div className="grid gap-5 @xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @xl:items-start @xl:gap-6">
          {/* Tope de ancho al calendario: las celdas son cuadradas, así que sin
              tope crecen con la columna y un mes pasa de 300 a 450px de ALTO. */}
          <div className="max-w-[26rem]">
            {/* La navegación va ARRIBA del calendario y dentro de su mismo
                ancho. En el encabezado del paso quedaba alineada al borde de la
                columna, o sea flotando lejos de la grilla que controla. */}
            <div className="mb-2 flex items-center justify-between gap-2">
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
              className="grid h-8 w-8 place-items-center rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] transition-colors enabled:hover:border-[var(--site-accent)] disabled:opacity-30"
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            {/* `first-letter` y no `capitalize`: en español el mes va en
                minúscula y la preposición también. Con `capitalize` salía
                "Septiembre De 2026". Necesita ser inline-block para que
                ::first-letter aplique. */}
            <span className="inline-block min-w-[7.5rem] text-center text-xs font-semibold text-[var(--site-on-surface)] first-letter:uppercase">
              {mesFmt.format(parseDateInput(`${mesVisible}-01`))}
            </span>
            <button
              type="button"
              onClick={() => setMesVisible(mesSiguiente!)}
              disabled={!mesSiguiente}
              aria-label="Mes siguiente"
              className="grid h-8 w-8 place-items-center rounded-[var(--site-radius)] border border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] transition-colors enabled:hover:border-[var(--site-accent)] disabled:opacity-30"
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
                          ? "border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] hover:border-[var(--site-accent)]"
                          : info
                            ? "cursor-not-allowed border-transparent bg-[var(--site-surface-alt)] text-[var(--site-on-surface-muted)] opacity-85"
                            : "cursor-not-allowed border-transparent text-[var(--site-on-surface-muted)] opacity-65"
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

          {!date ? (
            <p className="rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] px-4 py-6 text-center text-sm text-[var(--site-on-surface-muted)]">
              Elige un día para ver los horarios.
            </p>
          ) : (
          <section
            role="region"
            aria-label={`Horarios del ${longDateFmt.format(parseDateInput(date))}`}
            className="@container min-w-0"
          >
            <div className="mb-3">
              <h4
                className="text-base font-semibold text-[var(--site-on-surface)]"
                style={{ fontFamily: "var(--site-heading-font)" }}
              >
                ¿A qué hora?
              </h4>
              <p className="mt-0.5 text-xs text-[var(--site-on-surface-muted)] first-letter:uppercase">
                {longDateFmt.format(parseDateInput(date))}
              </p>
            </div>
            <div aria-live="polite">
          {slotStatus === "loading" ? (
            <p className="py-3 text-sm text-[var(--site-on-surface-muted)]">Buscando horarios…</p>
          ) : slotStatus === "failed" ? (
            <LoadFailed onRetry={retryDay} />
          ) : daySlots.length === 0 ? (
            <p className="rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] px-4 py-6 text-center text-sm text-[var(--site-on-surface-muted)]">
              El negocio no atiende ese día.
              <br />
              Elige otra fecha en el calendario.
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
                          const isPicked = time === slot.time;
                          return (
                            <li key={slot.time}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPickedTime(slot.time);
                                  revealIfBelow(contactRef.current);
                                }}
                                aria-pressed={isPicked}
                                // Misma altura que el turno ocupado: la grilla no
                                // se descuadra según qué haya reservado.
                                className={`flex h-11 w-full items-center justify-center rounded-[var(--site-radius)] border text-sm transition-all ${
                                  isPicked
                                    ? "border-[var(--site-accent)] bg-[var(--site-accent)] font-semibold text-[var(--site-on-accent)] shadow-sm"
                                    : "border-[var(--site-on-surface-border)] text-[var(--site-on-surface)] hover:border-[var(--site-accent)]"
                                }`}
                              >
                                {formatAppointmentTime(slot.time, site.timeFormat)}
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
                            className="flex h-11 flex-col items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] text-[var(--site-on-surface-muted)]"
                          >
                            <span className="text-sm leading-none opacity-70">{formatAppointmentTime(slot.time, site.timeFormat)}</span>
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
          </section>
          )}
          </div>
          </div>
        )}
      </Step>

        </div>

        <div ref={contactRef} className="min-w-0 scroll-mt-4 space-y-7">
      <Step n={3} title="¿Cómo te contactamos?">
        {/* B24: labels visibles. El placeholder desaparece al escribir y
            dejaba el campo sin nombre a la vista. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="booking-name" className="block text-xs font-semibold text-[var(--site-on-surface)]">
              Tu nombre
            </label>
            <input
              id="booking-name"
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
              autoComplete="name"
              placeholder="Ej: Laura Gómez"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="booking-phone" className="block text-xs font-semibold text-[var(--site-on-surface)]">
              Tu celular
            </label>
            <input
              id="booking-phone"
              type="tel"
              className={`${fieldClass} ${phoneError ? "border-2 border-[var(--site-on-surface)]" : ""}`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              aria-invalid={phoneError || undefined}
              aria-describedby="booking-phone-hint"
            />
            <p
              id="booking-phone-hint"
              className={`text-xs ${phoneError ? "font-semibold text-[var(--site-on-surface)]" : "text-[var(--site-on-surface-muted)]"}`}
            >
              {phoneError
                ? "⚠ Escribe un celular de 10 dígitos que empiece por 3."
                : "10 dígitos. Por aquí te confirman la cita."}
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <label htmlFor="booking-notes" className="block text-xs font-semibold text-[var(--site-on-surface)]">
            Comentario <span className="font-normal text-[var(--site-on-surface-muted)]">(opcional)</span>
          </label>
          <textarea
            id="booking-notes"
            rows={3}
            className={`${fieldClass} resize-y`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="¿Algo que debamos saber?"
          />
        </div>
      </Step>

      {/* ---- Resumen + CTA ---- */}
      <div className="space-y-3 border-t border-[var(--site-on-surface-border)] pt-5">
        {time && service && date ? (
          <dl className="space-y-1.5 rounded-[var(--site-radius)] bg-[var(--site-surface-alt)] p-4 text-sm">
            <SummaryRow label="Servicio" value={service.name} />
            <SummaryRow label="Con" value={staffMember?.fullName ?? "Cualquiera disponible"} />
            <SummaryRow
              label="Cuándo"
              value={`${shortDateFmt.format(parseDateInput(date))} · ${formatAppointmentTime(time, site.timeFormat)}`}
            />
            <SummaryRow label="Duración" value={formatDuration(service.durationMinutes)} />
            <SummaryRow label="Precio" value={formatCOP(service.price)} strong />
          </dl>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !time || !name || !mobile}
          className="min-h-12 w-full rounded-[var(--site-radius)] bg-[var(--site-accent)] px-4 py-3.5 text-sm font-semibold text-[var(--site-on-accent)] transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)] disabled:opacity-60"
        >
          {submitting ? "Enviando…" : time ? `Reservar a las ${formatAppointmentTime(time, site.timeFormat)}` : "Reservar turno"}
        </button>

        {/* Dice qué falta, en vez de dejar un botón apagado sin explicación. */}
        <p className="text-center text-xs text-[var(--site-on-surface-muted)]">
          {!time
            ? "Elige un horario para continuar."
            : !name || !phone
              ? "Completa tu nombre y celular."
              : !mobile
                ? "Revisa tu celular: deben ser 10 dígitos."
              : "Tu reserva queda pendiente hasta que el negocio la confirme."}
        </p>
      </div>
        </div>
      </div>
    </form>
  );
}

/** "Laura Gómez" → "LG"; una sola palabra → su inicial. */
function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => w[0]!.toUpperCase()).join("") || "?";
}

/** Una opción del selector de profesional: radio nativo con aspecto de tarjeta. */
function StaffCard({
  name,
  value,
  checked,
  onSelect,
  title,
  subtitle,
  photoUrl,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string | null;
  photoUrl?: string | null;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--site-radius)] border p-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--site-accent)]/40 ${
        checked
          ? "border-[var(--site-accent)] bg-[var(--site-surface-alt)] shadow-[inset_0_0_0_1px_var(--site-accent)]"
          : "border-[var(--site-on-surface-border)] hover:border-[var(--site-accent)]"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--site-surface-alt)] text-xs font-bold text-[var(--site-on-surface)]"
      >
        {photoUrl ? (
          <Image
            src={photoUrl}
            unoptimized={esImagenAjena(photoUrl)}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        ) : value ? (
          initialsOf(title)
        ) : (
          "✦"
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--site-on-surface)]">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-[var(--site-on-surface-muted)]">{subtitle}</span>
        ) : null}
      </span>
      {checked ? (
        <span
          aria-hidden="true"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--site-accent)] text-[0.65rem] font-bold text-[var(--site-on-accent)]"
        >
          ✓
        </span>
      ) : null}
    </label>
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
      {/* `flex-wrap` y título sin partir: en la columna angosta del layout de
          dos columnas, la navegación del mes le comía el ancho al encabezado y
          "¿Qué día?" se cortaba en dos líneas. Ahora baja el control, no el
          título. */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <h3 className="flex items-baseline gap-2 text-sm font-semibold whitespace-nowrap text-[var(--site-on-surface)]">
          <span
            aria-hidden="true"
            className="text-xs font-bold text-[var(--site-on-surface-muted)] tabular-nums"
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
      <dt className="text-[var(--site-on-surface-muted)]">{label}</dt>
      <dd
        className={`text-right break-words text-[var(--site-on-surface)] ${strong ? "font-bold" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Carga fallida (red caída, RPC con error). Antes se leía como "Cargando…"
 * eterno o como "El negocio no atiende ese día", y el visitante se iba
 * creyendo que no había agenda.
 */
function LoadFailed({ onRetry }: { onRetry: () => void }) {
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
