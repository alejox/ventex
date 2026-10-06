"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useAppointmentsStore } from "@/stores/appointments.store";
import { useCustomersStore } from "@/stores/customers.store";
import { useServicesStore } from "@/stores/services.store";
import { useStaffStore } from "@/stores/staff.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useShiftsStore } from "@/stores/shifts.store";
import { useProfile } from "@/components/ProfileProvider";
import { OpenShiftModal } from "@/components/shift/OpenShiftModal";
import { Select } from "@/components/ui/Select";
import { whatsappUrl, toWhatsappNumber } from "@/config/contact";
import type {
  Appointment,
  AppointmentPaymentMethod,
  NewAppointmentInput,
} from "@/services/appointments.service";
import { toISODate, formatDateOnly } from "@/lib/date";
import { formatAppointmentTime, type TimeFormat } from "@/lib/time";
import { DateTimeField } from "./DateTimeField";
import { conflictsFor, pickStaff, type BusyAppointment } from "@/lib/appointment-availability";
import { useFormatMoney } from "@/lib/useMoney";

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

const PAYMENT_OPTIONS: { value: AppointmentPaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
];

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
  const chargeAppointment = useAppointmentsStore((s) => s.chargeAppointment);
  const deleteAppointment = useAppointmentsStore((s) => s.deleteAppointment);
  const customers = useCustomersStore((s) => s.customers);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const services = useServicesStore((s) => s.services);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const staff = useStaffStore((s) => s.staff);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const profile = useProfile();
  const timeFormat = useSettingsStore((s) => s.settings?.time_format ?? "12");
  const isCarWash = profile?.businessType === "lavaautos";
  const isWorker = profile?.isWorker ?? false;
  const acceptsCard = useSettingsStore((s) => s.settings?.accepts_card) ?? true;
  const acceptsTransfer = useSettingsStore((s) => s.settings?.accepts_transfer) ?? true;
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const requireActiveShift = useSettingsStore((s) => s.loading || (s.settings?.require_active_shift ?? true));
  const currentShift = useShiftsStore((s) => s.currentShift);
  const fetchCurrentShift = useShiftsStore((s) => s.fetchCurrentShift);

  const [form, setForm] = useState<NewAppointmentInput>(() =>
    buildInitialForm(appointment, selectedDate, defaultStartTime),
  );
  const [customTitle, setCustomTitle] = useState(Boolean(appointment));
  const [savedForm, setSavedForm] = useState(form);
  const [saving, setSaving] = useState(false);
  const busy = submitting || saving;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);
  const dialogRef = useRef<HTMLDivElement>(null);
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
  const liveStatus = useAppointmentsStore((s) =>
    appointment
      ? (s.appointments.find((a) => a.id === appointment.id)?.status
        ?? (s.linkedAppointment?.id === appointment.id ? s.linkedAppointment.status : null) ?? appointment.status)
      : null,
  );

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

  // Lo que hace falta para COBRAR desde acá: qué medios acepta el negocio y,
  // para un empleado, si tiene la caja abierta (`create_sale` lo exige).
  useEffect(() => {
    fetchSettings();
    if (isWorker) fetchCurrentShift();
  }, [fetchSettings, isWorker, fetchCurrentShift]);

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

  const saveForm = async (): Promise<boolean> => {
    const input = { ...form, title: customTitle ? form.title : generatedTitle || form.title };
    setError("");
    if (staffConflicts.length > 0) {
      setError(`${staffNameOf(form.staff_id)} ya tiene una cita en ese horario. Elige otra hora u otra persona.`);
      return false;
    }
    if (nobodyFree) {
      setError("No hay nadie disponible a esa hora. Elige otra hora.");
      return false;
    }
    if (autoStaff) input.staff_id = autoStaff;
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
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    try { if (await saveForm()) onClose(); }
    finally { setSaving(false); }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChargeConfirm, setShowChargeConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<AppointmentPaymentMethod>("efectivo");
  const [chargeError, setChargeError] = useState("");

  const handleStatusChange = async (status: string) => {
    if (!appointment || status === liveStatus) return;
    // Completar una cita con servicio y sin venta la cierra sin plata ni
    // comisión: se pregunta antes, porque casi siempre lo que se quería era cobrar.
    if (status === "completed" && appointment.service_id && !liveSaleId && !showCompleteConfirm) {
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

  const liveSaleId = useAppointmentsStore((s) =>
    appointment
      ? (s.appointments.find((a) => a.id === appointment.id)?.sale_id ?? appointment.sale_id ?? null)
      : null,
  );

  const canCharge =
    !!appointment &&
    !!appointment.service_id &&
    !liveSaleId &&
    // Una cita completada SIN venta (alguien tocó "Marcar completada") sigue
    // cobrable: si no, el servicio quedaba hecho y nunca se registraba la plata.
    liveStatus !== "cancelled";

  const chargedService = appointment?.service_id
    ? services.find((s) => s.id === appointment.service_id) ?? null
    : null;

  const paymentOptions = PAYMENT_OPTIONS.filter(
    (o) =>
      o.value === "efectivo" ||
      (o.value === "tarjeta" && acceptsCard) ||
      (o.value === "transferencia" && acceptsTransfer),
  );

  /** Duración de lo que se está agendando, como la diría una persona. */

  /**
   * Abre el cobro. Un empleado sin turno abierto no puede cobrar (`create_sale`
   * lo rechaza): antes el botón fallaba en silencio y la cita quedaba
   * pendiente aunque el cliente ya hubiera pagado. Ahora se pide abrir la caja
   * primero y el cobro sigue solo.
   */
  const startCharge = () => {
    setChargeError("");
    if (isWorker && requireActiveShift && !currentShift) {
      setShowOpenShift(true);
      return;
    }
    setShowChargeConfirm(true);
  };

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

  const confirmChargeAction = async () => {
    if (!appointment) return;
    setChargeError("");
    const ok = await chargeAppointment(appointment, paymentMethod);
    if (ok) {
      setShowChargeConfirm(false);
      toast.success("Cita cobrada. Quedó registrada la venta y la cita como completada.");
      onClose();
    } else {
      setChargeError(useAppointmentsStore.getState().error ?? "No se pudo cobrar la cita.");
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

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (showDeleteConfirm) setShowDeleteConfirm(false);
      else if (showCompleteConfirm) setShowCompleteConfirm(false);
      else if (showChargeConfirm) setShowChargeConfirm(false);
      else if (!busy) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]') ?? []).filter((element) => element.offsetParent !== null);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div ref={dialogRef} onKeyDown={handleDialogKeyDown} className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title" className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 id="appointment-modal-title" className="text-lg sm:text-xl font-bold text-on-surface">
                {isEditing ? "Editar cita" : "Nueva cita"}
              </h2>
              {liveStatus && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {STATUS_OPTIONS.find((option) => option.value === liveStatus)?.label}
              </span>}
            </div>
            <p className="mt-1 text-sm text-on-surface-variant truncate">{generatedTitle || form.title || "Organiza la próxima visita"}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{form.appointment_date && formatDateOnly(form.appointment_date)} · {formatAppointmentTime(form.start_time, timeFormat)}–{formatAppointmentTime(form.end_time, timeFormat)}</p>
          </div>
          <button
            disabled={busy}
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
            aria-label="Cerrar"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isEditing && liveSaleId && (
          <div className="px-4 sm:px-6 py-3 border-b border-emerald-500/20 bg-emerald-500/10 shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Cita cobrada: la venta ya está registrada.
          </div>
        )}

        {/* Form */}
        <form id="appointment-edit-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto min-h-0">
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
        <div className="shrink-0 border-t border-outline-variant/20 bg-surface-container-lowest p-4 sm:px-6 space-y-3">
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
                {STATUS_OPTIONS.filter(option => option.value !== liveStatus && option.value !== "confirmed").map(option =>
                  <button key={option.value} type="button" disabled={busy} onClick={() => void handleStatusChange(option.value)} className="text-left rounded-lg p-2 text-sm text-on-surface hover:bg-surface-container-highest">
                    {option.value === "cancelled" ? "Cancelar cita" : option.value === "completed" ? "Marcar completada" : "Volver a pendiente"}
                  </button>)}
                <button type="button" disabled={busy} onClick={() => setShowDeleteConfirm(true)} className="text-left rounded-lg p-2 text-sm text-error-dim">Eliminar cita</button>
              </div>
            </details> : <button type="button" onClick={onClose} className="text-sm text-on-surface-variant">Volver</button>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="submit" form="appointment-edit-form" disabled={busy}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${isEditing ? "border border-outline-variant/30 text-on-surface" : "bg-primary text-on-primary"}`}>
                {busy ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear cita"}
              </button>
              {liveStatus === "pending" ? <button type="button" disabled={busy} onClick={() => void confirmPending()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">Confirmar reserva</button>
                : canCharge && <button type="button" disabled={busy || dirty} onClick={startCharge} title={dirty ? "Guarda los cambios antes de cobrar" : undefined} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-50">
                  {chargedService ? `Cobrar ${fmtMoney(chargedService.price)}` : "Cobrar"}
                </button>}
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-on-surface mb-2">Eliminar Cita</h3>
            <p className="text-sm text-on-surface-variant mb-6">
              ¿Estás seguro de eliminar esta cita? Esta acción no se puede deshacer.
            </p>
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
          </div>
        </div>
      )}

      {showCompleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div role="alertdialog" aria-modal="true" aria-labelledby="complete-confirm-title" className="bg-surface-container rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <h3 id="complete-confirm-title" className="text-lg font-bold text-on-surface mb-2">¿Completar sin cobrar?</h3>
            <p className="text-sm text-on-surface-variant mb-6">
              No se generará venta ni comisión. Si el cliente ya pagó, usa «Cobrar» en su lugar.
            </p>
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
          </div>
        </div>
      )}

      {showChargeConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-on-surface mb-1">Cobrar cita</h3>
            <p className="text-sm text-on-surface-variant mb-4">
              {chargedService?.name ?? appointment?.title}
              {selectedCustomer ? ` · ${selectedCustomer.full_name}` : ""}
            </p>
            {chargedService && (
              <p className="text-3xl font-bold text-on-surface tabular-nums mb-4">
                {fmtMoney(chargedService.price)}
              </p>
            )}

            <div className="mb-4 text-left">
              <p className="text-[13px] font-semibold text-on-surface mb-1.5">¿Cómo paga?</p>
              <div className="grid grid-cols-3 gap-2">
                {paymentOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPaymentMethod(o.value)}
                    aria-pressed={paymentMethod === o.value}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                      paymentMethod === o.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-on-surface-variant mb-4">
              Se registra la venta y la cita queda como completada.
            </p>

            {chargeError && (
              <div className="mb-4 rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim text-left">
                {chargeError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowChargeConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-highest transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmChargeAction}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
              >
                {submitting ? "Cobrando…" : "Confirmar cobro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOpenShift && (
        // Contenedor propio: el modal de turno usa z-50 y esta pantalla z-100.
        <div className="relative z-[120]">
          <OpenShiftModal
            onClose={() => setShowOpenShift(false)}
            onOpened={() => setShowChargeConfirm(true)}
          />
        </div>
      )}
    </div>
  );
}
