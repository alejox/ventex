"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { QuickCustomerModal } from "./QuickCustomerModal";
import { toast } from "sonner";
import { useAppointmentsStore } from "@/stores/appointments.store";
import { useCustomersStore } from "@/stores/customers.store";
import { useServicesStore } from "@/stores/services.store";
import { useStaffStore } from "@/stores/staff.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useProfile } from "@/components/ProfileProvider";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { whatsappUrl, toWhatsappNumber } from "@/config/contact";
import type {
  Appointment,
  NewAppointmentInput,
} from "@/services/appointments.service";
import { toISODate, formatDateOnly } from "@/lib/date";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import { DateTimeDialog, DateTimeField } from "./DateTimeField";
import { conflictsFor, pickStaff, type BusyAppointment } from "@/lib/appointment-availability";
import { useFormatMoney } from "@/lib/useMoney";
import { currentAppointment } from "@/lib/appointment-state";

/**
 * Mensaje de confirmación ya redactado para el cliente.
 *
 * La fecha va por `formatDateOnly`: `new Date("2026-08-05")` la interpreta como
 * medianoche UTC y, en Colombia (UTC-5), se muestra como el día anterior.
 * Confirmarle a alguien el día equivocado es peor que no confirmarle nada.
 */
function buildConfirmationMessage({
  customerName,
  serviceName,
  date,
  startTime,
  timeFormat,
}: {
  customerName: string;
  serviceName: string;
  date: string;
  startTime: string;
  timeFormat: TimeFormat;
}): string {
  const readableDate = date
    ? formatDateOnly(date, { weekday: "long", day: "numeric", month: "long" })
    : date;

  const firstName = customerName.trim().split(" ")[0];
  const greeting = firstName ? `Hola ${firstName}` : "Hola";
  const what = serviceName ? ` de ${serviceName}` : "";

  return `${greeting}, te confirmamos tu cita${what} para el ${readableDate} a las ${formatAppointmentTime(startTime, timeFormat)}. ¡Te esperamos!`;
}

interface AppointmentModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate?: Date;
  appointment?: Appointment | null;
  defaultStartTime?: string;
}

const EMPTY_FORM: NewAppointmentInput = {
  customer_id: null,
  service_id: null,
  staff_id: null,
  title: "",
  description: "",
  service_type: "",
  vehicle_plate: "",
  vehicle_model: "",
  appointment_date: "",
  start_time: "09:00",
  end_time: "10:00",
  notes: "",
};

/** Suma minutos a "HH:MM" (tope 23:59) para calcular la hora de fin. */
const addMinutes = (time: string, mins: number) => {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Estado inicial del formulario: la cita que se edita, o una nueva sembrada. */
function buildInitialForm(
  appointment: Appointment | null | undefined,
  selectedDate: Date | undefined,
  defaultStartTime: string | undefined,
): NewAppointmentInput {
  if (appointment) {
    return {
      customer_id: appointment.customer_id,
      service_id: appointment.service_id,
      staff_id: appointment.staff_id,
      title: appointment.title,
      description: appointment.description || "",
      service_type: appointment.service_type || "",
      vehicle_plate: appointment.vehicle_plate || "",
      vehicle_model: appointment.vehicle_model || "",
      appointment_date: appointment.appointment_date,
      start_time: appointment.start_time.slice(0, 5),
      end_time: appointment.end_time.slice(0, 5),
      notes: appointment.notes || "",
    };
  }

  return {
    ...EMPTY_FORM,
    appointment_date: toISODate(selectedDate ?? new Date()),
    start_time: defaultStartTime || "09:00",
    end_time: defaultStartTime ? addMinutes(defaultStartTime, 60) : "10:00",
  };
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { value: "confirmed", label: "Confirmada", color: "bg-primary/10 text-primary border-primary/20" },
  { value: "completed", label: "Completada", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { value: "cancelled", label: "Cancelada", color: "bg-error-container/20 text-error-dim border-error-container/30" },
];

export default function AppointmentModal(props: AppointmentModalProps) {
  if (!props.open) return null;
  // Cerrar desmonta el cuerpo, así que cada apertura arranca con estado limpio:
  // el formulario se siembra en `useState` desde las props y no hace falta un
  // efecto que lo copie (que además disparaba renders en cascada).
  return <AppointmentModalBody {...props} />;
}

function AppointmentModalBody({
  onClose,
  selectedDate,
  appointment,
  defaultStartTime,
}: AppointmentModalProps) {
  const fmtMoney = useFormatMoney();
  const submitting = useAppointmentsStore((s) => s.submitting);
  const addAppointment = useAppointmentsStore((s) => s.addAppointment);
  const updateAppointment = useAppointmentsStore((s) => s.updateAppointment);
  const updateStatus = useAppointmentsStore((s) => s.updateStatus);
  const deleteAppointment = useAppointmentsStore((s) => s.deleteAppointment);
  const customers = useCustomersStore((s) => s.customers);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const fetchCustomer = useCustomersStore((s) => s.fetchCustomer);
  const services = useServicesStore((s) => s.services);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const staff = useStaffStore((s) => s.staff);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const profile = useProfile();
  const timeFormat = useSettingsStore((s) => s.settings?.time_format ?? "12");
  const isCarWash = profile?.businessType === "lavaautos";
  const isWorker = profile?.isWorker ?? false;

  const [form, setForm] = useState<NewAppointmentInput>(() =>
    buildInitialForm(appointment, selectedDate, defaultStartTime),
  );
  const [customTitle, setCustomTitle] = useState(Boolean(appointment));
  const [savedForm, setSavedForm] = useState(form);
  const [saving, setSaving] = useState(false);
  const busy = submitting || saving;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const businessHours = useAppointmentsStore((s) => s.businessHours);
  const fetchBusinessHours = useAppointmentsStore((s) => s.fetchBusinessHours);
  useEffect(() => { void fetchBusinessHours(); }, [fetchBusinessHours]);
  /** "Mover a…": abre el selector de fecha y hora y guarda al elegir. */
  const [moveOpen, setMoveOpen] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  const [error, setError] = useState("");
  const isEditing = !!appointment;

  const activeServices = services.filter((s) => s.status === "active");
  const activeStaff = staff.filter((m) => m.status === "active");

  /**
   * Estado VIVO de la cita, leído del store.
   *
   * El prop `appointment` es la foto del momento en que se abrió el modal: al
   * cambiar el estado, el store y la base se actualizan pero ese objeto sigue
   * igual, así que leer de él dejaba la píldora clavada en el estado viejo y
   * parecía que el clic no hacía nada.
   */
  const liveAppointment = useAppointmentsStore((s) => currentAppointment(appointment, s.appointments, s.linkedAppointment));
  const liveStatus = liveAppointment?.status ?? null;
  const liveSaleId = liveAppointment?.sale_id ?? null;

  // Se resuelve contra el store y no contra el dato embebido en la cita para
  // que el teléfono siga al cliente que está elegido AHORA en el desplegable,
  // aunque el dueño lo acabe de cambiar sin guardar todavía.
  const selectedCustomer = customers.find((c) => c.id === form.customer_id) ?? null;
  const customerWhatsapp = toWhatsappNumber(selectedCustomer?.phone);

  const confirmationMessage = buildConfirmationMessage({
    customerName: selectedCustomer?.full_name ?? "",
    serviceName:
      services.find((s) => s.id === form.service_id)?.name || form.service_type || form.title,
    date: form.appointment_date,
    startTime: form.start_time,
    timeFormat,
  });

  useEffect(() => {
    if (customers.length === 0) fetchCustomers();
    if (services.length === 0) fetchServices();
    if (staff.length === 0) fetchStaff();
  }, [customers.length, fetchCustomers, services.length, fetchServices, staff.length, fetchStaff]);

  // Una lista no vacía puede ser anterior a una reserva pública. Refrescar el
  // cliente elegido evita mostrar «sin teléfono» cuando todavía no está en caché.
  useEffect(() => {
    if (form.customer_id) void fetchCustomer(form.customer_id);
  }, [form.customer_id, fetchCustomer]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const canUsePos = !isWorker || Boolean(profile?.workerPermissions?.pos);

  const generatedTitle = [
    services.find((service) => service.id === form.service_id)?.name || form.service_type,
    selectedCustomer?.full_name,
  ].filter(Boolean).join(" · ");
  // ---- Disponibilidad: una persona no puede tener dos citas a la misma hora ----
  const fetchDayBusy = useAppointmentsStore((s) => s.fetchDayBusy);
  const [dayBusy, setDayBusy] = useState<BusyAppointment[]>([]);
  const refreshBusy = useCallback(async () => { if (form.appointment_date) setDayBusy(await fetchDayBusy(form.appointment_date)); }, [fetchDayBusy, form.appointment_date]);
  useEffect(() => {
    if (!form.appointment_date) return;
    let stale = false;
    void fetchDayBusy(form.appointment_date).then((rows) => { if (!stale) setDayBusy(rows); });
    return () => { stale = true; };
  }, [fetchDayBusy, form.appointment_date]);

  const teamIds = useMemo(() => staff.filter((member) => member.status === "active").map((member) => member.id), [staff]);
  const staffNameOf = (id: string | null) => staff.find((member) => member.id === id)?.full_name ?? "Esa persona";
  const staffConflicts = form.staff_id ? conflictsFor(dayBusy, form.staff_id, form.start_time, form.end_time, appointment?.id) : [];
  // Sin persona elegida se asigna sola a quien esté libre; si hay equipo y nadie lo está, no hay cupo.
  const autoStaff = !form.staff_id && teamIds.length > 0 ? pickStaff(dayBusy, teamIds, form.start_time, form.end_time, appointment?.id) : null;
  const nobodyFree = !form.staff_id && teamIds.length > 0 && autoStaff === null;

  const saveForm = async (source: NewAppointmentInput = form): Promise<boolean> => {
    const input = { ...source, title: customTitle ? source.title : generatedTitle || source.title };
    setError("");
    // Con otro horario (p. ej. "Mover a…") los choques se recalculan sobre ese.
    const sameSlot = source.appointment_date === form.appointment_date && source.start_time === form.start_time && source.end_time === form.end_time;
    const busyNow = sameSlot ? dayBusy : await fetchDayBusy(source.appointment_date);
    const conflictsNow = source.staff_id ? conflictsFor(busyNow, source.staff_id, source.start_time, source.end_time, appointment?.id) : [];
    const autoNow = !source.staff_id && teamIds.length > 0 ? pickStaff(busyNow, teamIds, source.start_time, source.end_time, appointment?.id) : null;
    if (conflictsNow.length > 0) {
      setError(`${staffNameOf(source.staff_id)} ya tiene una cita en ese horario. Elige otra hora u otra persona.`);
      return false;
    }
    if (!source.staff_id && teamIds.length > 0 && autoNow === null) {
      setError("No hay nadie disponible a esa hora. Elige otra hora.");
      return false;
    }
    if (autoNow) input.staff_id = autoNow;
    if (!input.title.trim()) {
      setError("Elige un servicio o personaliza el título de la cita.");
      return false;
    }
    if (!input.appointment_date || !input.start_time || !input.end_time || input.start_time >= input.end_time) {
      setError("Revisa la fecha y el horario: el fin debe ser posterior al inicio.");
      return false;
    }
    const ok = appointment
      ? await updateAppointment(appointment.id, input)
      : await addAppointment(input);
    if (!ok) setError(useAppointmentsStore.getState().error ?? "No se pudo guardar la cita.");
    if (ok) { setForm(input); setSavedForm(input); void refreshBusy(); }
    return ok;
  };

  /**
   * Cerrar (Escape, X, fondo, "Volver") con cambios sin guardar pregunta antes:
   * se perdía todo lo escrito por un toque fuera del panel.
   */
  const requestClose = async () => {
    if (busy) return;
    if (dirty) {
      const discard = await confirm({
        title: "¿Descartar los cambios?",
        description: "Tienes cambios sin guardar en esta cita. Si cierras ahora, se pierden.",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir editando",
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  };

  /**
   * "Mover a…" guarda al instante con el horario nuevo. Parte del formulario
   * actual: si había otros cambios sin guardar, se guardan junto con el
   * movimiento en vez de perderse.
   */
  const moveTo = async ({ date, start, end }: { date: string; start: string; end: string }) => {
    if (busy) return;
    const next = { ...form, appointment_date: date, start_time: start, end_time: end };
    setSaving(true);
    try {
      if (await saveForm(next)) {
        toast.success(`Cita movida al ${formatDateOnly(date, { weekday: "long", day: "numeric", month: "long" })}, ${formatAppointmentTime(start, timeFormat)}.`);
      }
    } finally { setSaving(false); }
  };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    try { if (await saveForm()) onClose(); }
    finally { setSaving(false); }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const handleStatusChange = async (status: string) => {
    if (!appointment || status === liveStatus) return;
    // Completar una cita con servicio y sin venta la cierra sin plata ni
    // comisión: se pregunta antes, porque casi siempre lo que se quería era cobrar.
    if (status === "completed" && liveAppointment?.service_id && !liveSaleId && !showCompleteConfirm) {
      setShowCompleteConfirm(true);
      return;
    }
    setShowCompleteConfirm(false);
    const ok = await updateStatus(appointment.id, status);
    if (ok) {
      const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
      toast.success(`Cita marcada como ${label.toLowerCase()}.`);
    } else {
      toast.error(useAppointmentsStore.getState().error ?? "No se pudo cambiar el estado.");
    }
  };

  const canCharge = !!liveAppointment?.service_id && !liveSaleId && liveStatus !== "cancelled" && canUsePos;
  const chargedService = services.find((s) => s.id === liveAppointment?.service_id) ?? null;
  const confirmPending = async () => {
    if (!appointment || busy) return;
    setSaving(true);
    try {
      if (!await saveForm()) return;
      if (await updateStatus(appointment.id, "confirmed")) toast.success("Reserva confirmada.");
      else setError(useAppointmentsStore.getState().error ?? "No se pudo confirmar la reserva.");
    } finally { setSaving(false); }
  };

  const confirmDeleteAction = async () => {
    if (!appointment) return;
    const ok = await deleteAppointment(appointment.id);
    if (ok) {
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  const handleServiceChange = (id: string) => {
    const svc = activeServices.find((s) => s.id === id);
    setForm((f) => ({
      ...f,
      service_id: id || null,
      // Sincroniza el texto y autocompleta título/duración a partir del servicio.
      service_type: svc ? svc.name : "",
      title: customTitle ? f.title : svc?.name ?? "",
      end_time: svc ? addMinutes(f.start_time, svc.duration_minutes) : f.end_time,
    }));
  };

  return (
    <>
    <Modal
      open
      onClose={() => {
        if (!busy) void requestClose();
      }}
      title={isEditing ? "Editar cita" : "Nueva cita"}
      description={
        <>
          {liveStatus && (
            <span className="mb-1 inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary-ink">
              {STATUS_OPTIONS.find((option) => option.value === liveStatus)?.label}
            </span>
          )}
          <span className="block truncate">{generatedTitle || form.title || "Organiza la próxima visita"}</span>
          <span className="mt-1 block text-xs">{form.appointment_date && formatDateOnly(form.appointment_date)} · {formatAppointmentTime(form.start_time, timeFormat)}–{formatAppointmentTime(form.end_time, timeFormat)}</span>
        </>
      }
      placement="sheet"
      bodyClassName="border-t border-outline-variant/10"
      footerClassName="border-t border-outline-variant/20 bg-surface-container-lowest p-4 sm:px-6"
      footer={
        <div className="space-y-3">
          {isEditing && liveStatus === "confirmed" && !dirty && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-primary" role="status">Reserva confirmada</span>
              {customerWhatsapp ? <a href={whatsappUrl(confirmationMessage, customerWhatsapp)} target="_blank" rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-4">Avisar por WhatsApp</a>
                : <span className="text-xs text-on-surface-variant">Sin teléfono para avisar.</span>}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {isEditing ? <details className="relative">
              <summary className="cursor-pointer text-sm text-on-surface-variant">Más acciones</summary>
              <div className="absolute bottom-full left-0 mb-3 w-52 rounded-xl border border-outline-variant/30 bg-surface-container-high p-2 shadow-xl flex flex-col">
                {liveStatus !== "cancelled" && liveStatus !== "completed" && !liveSaleId ? (
                  <button type="button" disabled={busy} onClick={() => setMoveOpen(true)} className="text-left rounded-lg p-2 text-sm text-on-surface hover:bg-surface-container-highest">
                    Mover a…
                  </button>
                ) : null}
                {STATUS_OPTIONS.filter(option => option.value !== liveStatus && option.value !== "confirmed").map(option =>
                  <button key={option.value} type="button" disabled={busy} onClick={() => void handleStatusChange(option.value)} className="text-left rounded-lg p-2 text-sm text-on-surface hover:bg-surface-container-highest">
                    {option.value === "cancelled" ? "Cancelar cita" : option.value === "completed" ? "Marcar completada" : "Volver a pendiente"}
                  </button>)}
                <button type="button" disabled={busy} onClick={() => setShowDeleteConfirm(true)} className="text-left rounded-lg p-2 text-sm text-error-dim">Eliminar cita</button>
              </div>
            </details> : <button type="button" onClick={() => void requestClose()} className="text-sm text-on-surface-variant">Volver</button>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="submit" form="appointment-edit-form" disabled={busy}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${isEditing ? "border border-outline-variant/30 text-on-surface" : "bg-primary text-on-primary"}`}>
                {busy ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear cita"}
              </button>
              {liveStatus === "pending" ? <button type="button" disabled={busy} onClick={() => void confirmPending()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">Confirmar reserva</button>
                : canCharge && <Link href={`/dashboard/pos?appointment=${liveAppointment?.id}`} aria-disabled={busy || dirty} onClick={(event) => { if (busy || dirty) event.preventDefault(); else onClose(); }} title={dirty ? "Guarda los cambios antes de cobrar" : undefined} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">
                  {chargedService ? `Cobrar ${fmtMoney(chargedService.price)}` : "Cobrar"}
                </Link>}
            </div>
          </div>
        </div>
      }
    >
        {isEditing && liveSaleId && (
          <div className="px-4 sm:px-6 py-3 border-b border-emerald-500/20 bg-emerald-500/10 shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Cita cobrada: la venta ya está registrada.
          </div>
        )}

        {/* Form */}
        <form ref={dialogRef} id="appointment-edit-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <fieldset disabled={busy} className="space-y-4 sm:space-y-5">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          {/* Customer */}
          <Select
            label="Cliente"
            searchable
            searchPlaceholder="Buscar cliente…"
            value={form.customer_id || ""}
            onChange={(e) =>
              setForm({
                ...form,
                customer_id: e.target.value || null,
              })
            }
          >
              <option value="">Sin cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </Select>

          <button type="button" onClick={() => setShowNewCustomer(true)} className="min-h-10 text-sm font-semibold text-primary">+ Crear cliente</button>

          {/*
            Contacto del cliente. Las citas que entran por el sitio web público
            llegan como "Pendiente" y hay que confirmarlas a mano, así que el
            teléfono tiene que estar acá: sin él, el dueño ve la reserva pero no
            tiene cómo responderle a quien la hizo.
          */}
          {selectedCustomer ? (
            <div className="-mt-1 flex flex-col gap-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              {selectedCustomer.phone ? (
                <a
                  href={`tel:${selectedCustomer.phone}`}
                  className="text-sm font-medium text-on-surface hover:text-primary transition-colors"
                >
                  {selectedCustomer.phone}
                </a>
              ) : (
                <span className="text-sm text-on-surface-variant">
                  Este cliente no tiene teléfono cargado.
                </span>
              )}

            </div>
          ) : null}

          {/* Service + Barber */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Servicio"
              value={form.service_id || ""}
              onChange={(e) => handleServiceChange(e.target.value)}
            >
                <option value="">Sin servicio</option>
                {form.service_id && services.some((s) => s.id === form.service_id && s.status !== "active") && <option value={form.service_id} disabled>{services.find((s) => s.id === form.service_id)?.name} (archivado)</option>}
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            <Select
              label="Asignado a"
              value={form.staff_id || ""}
              onChange={(e) =>
                setForm({ ...form, staff_id: e.target.value || null })
              }
            >
                <option value="">Asignar automáticamente (quien esté libre)</option>
                {activeStaff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </Select>
          </div>

          {/* Vehículo (lavaautos) */}
          {isCarWash && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">
                  Placa
                </label>
                <input
                  type="text"
                  value={form.vehicle_plate}
                  onChange={(e) =>
                    setForm({ ...form, vehicle_plate: e.target.value.toUpperCase() })
                  }
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono uppercase placeholder:text-on-surface-variant/50"
                  placeholder="ABC123"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">
                  Vehículo
                </label>
                <input
                  type="text"
                  value={form.vehicle_model}
                  onChange={(e) =>
                    setForm({ ...form, vehicle_model: e.target.value })
                  }
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. Mazda 3 gris"
                />
              </div>
            </div>
          )}

          {/* Fecha y hora: un solo campo que abre el selector (valores en 24 h). */}
          <DateTimeField
            value={{ date: form.appointment_date, start: form.start_time, end: form.end_time }}
            format={timeFormat}
            onChange={({ date, start, end }) => setForm({ ...form, appointment_date: date, start_time: start, end_time: end })}
            availability={{ staffId: form.staff_id, staffName: staffNameOf(form.staff_id), pool: teamIds, excludeId: appointment?.id ?? null, loadBusy: fetchDayBusy }}
            hours={businessHours}
          />
          {staffConflicts.length > 0 ? (
            <p role="alert" className="-mt-2 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">
              {staffNameOf(form.staff_id)} ya tiene una cita de {formatAppointmentTime(staffConflicts[0].start_time, timeFormat)} a {formatAppointmentTime(staffConflicts[0].end_time, timeFormat)}. Elige otra hora u otra persona.
            </p>
          ) : nobodyFree ? (
            <p role="alert" className="-mt-2 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">No hay nadie disponible a esa hora. Elige otra hora.</p>
          ) : autoStaff ? (
            <p className="-mt-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-on-surface-variant">Se asignará automáticamente a <strong className="text-on-surface">{staffNameOf(autoStaff)}</strong>, que está disponible a esa hora.</p>
          ) : null}

          <details className="rounded-xl border border-outline-variant/20 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-on-surface">Notas y detalles opcionales</summary>
            <div className="mt-4 space-y-4">
          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none"
              placeholder="Detalles de la cita..."
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Notas internas
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none"
              placeholder="Notas internas..."
            />
          </div>

            </div>
          </details>
          <details className="text-sm text-on-surface-variant">
            <summary className="cursor-pointer">Personalizar título</summary>
            <div className="mt-3">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Título *
            </label>
            <input
              type="text"
                            value={customTitle ? form.title : generatedTitle || form.title}
              onChange={(e) => { setCustomTitle(true); setForm({ ...form, title: e.target.value }); }}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. Corte de cabello"
            />
          </div>

            </div>
          </details>
          </fieldset>
        </form>
    </Modal>

      {showDeleteConfirm && (
        <Modal
          open
          onClose={() => {
            if (!busy) setShowDeleteConfirm(false);
          }}
          title="Eliminar Cita"
          description="¿Estás seguro de eliminar esta cita? Esta acción no se puede deshacer."
          role="alertdialog"
          size="sm"
          showCloseButton={false}
          className="text-center"
        >
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-highest transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteAction}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-error-dim hover:bg-error text-white transition-colors disabled:opacity-50"
              >
                {submitting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
        </Modal>
      )}

      {showCompleteConfirm && (
        <Modal
          open
          onClose={() => {
            if (!busy) setShowCompleteConfirm(false);
          }}
          title="¿Completar sin cobrar?"
          description="No se generará venta ni comisión. Si el cliente ya pagó, usa «Cobrar» en su lugar."
          role="alertdialog"
          size="sm"
          showCloseButton={false}
          className="text-center"
        >
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCompleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-highest transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleStatusChange("completed")}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
              >
                Completar sin cobrar
              </button>
            </div>
        </Modal>
      )}

      {/*
        "Mover a…": el mismo selector de fecha y hora, controlado desde acá.
        Al pulsar «Listo» se guarda de una (ver `moveTo`).
      */}
      {moveOpen ? (
        <DateTimeDialog
          initial={{ date: form.appointment_date, start: form.start_time, end: form.end_time }}
          format={timeFormat}
          availability={{ staffId: form.staff_id, staffName: staffNameOf(form.staff_id), pool: teamIds, excludeId: appointment?.id ?? null, loadBusy: fetchDayBusy }}
          hours={businessHours}
          title="¿A dónde la mueves?"
          onClose={() => setMoveOpen(false)}
          onApply={(next) => { setMoveOpen(false); void moveTo(next); }}
        />
      ) : null}

      <QuickCustomerModal open={showNewCustomer} onClose={() => setShowNewCustomer(false)} onCreated={(id) => { setForm((f) => ({ ...f, customer_id: id })); setShowNewCustomer(false); }} />
    {confirmDialog}
    </>
  );
}
