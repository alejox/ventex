"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAppointmentsStore } from "@/stores/appointments.store";
import { useCustomersStore } from "@/stores/customers.store";
import { useServicesStore } from "@/stores/services.store";
import { useStaffStore } from "@/stores/staff.store";
import { useProfile } from "@/components/ProfileProvider";
import { Select } from "@/components/ui/Select";
import { whatsappUrl, toWhatsappNumber } from "@/config/contact";
import type { Appointment, NewAppointmentInput } from "@/services/appointments.service";
import { toISODate, formatDateOnly } from "@/lib/date";

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
}: {
  customerName: string;
  serviceName: string;
  date: string;
  startTime: string;
}): string {
  const readableDate = date
    ? formatDateOnly(date, { weekday: "long", day: "numeric", month: "long" })
    : date;

  const firstName = customerName.trim().split(" ")[0];
  const greeting = firstName ? `Hola ${firstName}` : "Hola";
  const what = serviceName ? ` de ${serviceName}` : "";

  return `${greeting}, te confirmamos tu cita${what} para el ${readableDate} a las ${startTime.slice(0, 5)}. ¡Te esperamos!`;
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
  { value: "confirmed", label: "Confirmada", color: "bg-[#6063ee]/10 text-[#6063ee] border-[#6063ee]/20" },
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
  const { submitting, addAppointment, updateAppointment, updateStatus, chargeAppointment, deleteAppointment } =
    useAppointmentsStore();
  const customers = useCustomersStore((s) => s.customers);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);
  const services = useServicesStore((s) => s.services);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const staff = useStaffStore((s) => s.staff);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const profile = useProfile();
  const isCarWash = profile?.businessType === "lavaautos";

  const [form, setForm] = useState<NewAppointmentInput>(() =>
    buildInitialForm(appointment, selectedDate, defaultStartTime),
  );
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
      ? (s.appointments.find((a) => a.id === appointment.id)?.status ?? appointment.status)
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
  });

  useEffect(() => {
    if (customers.length === 0) fetchCustomers();
    if (services.length === 0) fetchServices();
    if (staff.length === 0) fetchStaff();
  }, [customers.length, fetchCustomers, services.length, fetchServices, staff.length, fetchStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("El título es requerido");
      return;
    }
    if (form.start_time >= form.end_time) {
      setError("La hora de fin debe ser posterior a la hora de inicio");
      return;
    }

    let ok: boolean;
    if (isEditing && appointment) {
      ok = await updateAppointment(appointment.id, form);
    } else {
      ok = await addAppointment(form);
    }
    if (ok) onClose();
  };

  const handleDelete = async () => {
    if (!appointment) return;
    if (!confirm("¿Eliminar esta cita?")) return;
    const ok = await deleteAppointment(appointment.id);
    if (ok) onClose();
  };

  const handleStatusChange = async (status: string) => {
    if (!appointment || status === liveStatus) return;
    const ok = await updateStatus(appointment.id, status);
    // Sin aviso, un cambio de estado correcto se ve igual que uno que falló.
    if (ok) {
      const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
      toast.success(`Cita marcada como ${label.toLowerCase()}.`);
    } else {
      toast.error(useAppointmentsStore.getState().error ?? "No se pudo cambiar el estado.");
    }
  };

  const canCharge =
    !!appointment &&
    !!appointment.service_id &&
    liveStatus !== "completed" &&
    liveStatus !== "cancelled";

  const handleCharge = async () => {
    if (!appointment) return;
    if (!confirm("¿Cobrar esta cita? Se registrará como venta y la cita quedará completada.")) return;
    const ok = await chargeAppointment(appointment);
    if (ok) onClose();
  };

  const handleServiceChange = (id: string) => {
    const svc = activeServices.find((s) => s.id === id);
    setForm((f) => ({
      ...f,
      service_id: id || null,
      // Sincroniza el texto y autocompleta título/duración a partir del servicio.
      service_type: svc ? svc.name : "",
      title: f.title.trim() ? f.title : svc?.name ?? f.title,
      end_time: svc ? addMinutes(f.start_time, svc.duration_minutes) : f.end_time,
    }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-on-surface">
            {isEditing ? "Editar Cita" : "Nueva Cita"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
            aria-label="Cerrar"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status bar (editing only) */}
        {isEditing && (
          <div className="px-4 sm:px-6 py-3 border-b border-outline-variant/10 bg-surface-container-lowest shrink-0">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  // Explícito aunque hoy quede fuera del <form>: si alguien mueve
                  // esta barra adentro, el default `submit` guardaría la cita
                  // entera en cada clic de estado.
                  type="button"
                  aria-pressed={liveStatus === opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    liveStatus === opt.value
                      ? opt.color
                      : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {error && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Título *
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. Corte de cabello"
            />
          </div>

          {/* Customer */}
          <Select
            label="Cliente"
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

              {customerWhatsapp ? (
                <a
                  href={whatsappUrl(confirmationMessage, customerWhatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition-all"
                >
                  Confirmar por WhatsApp
                </a>
              ) : null}
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
                <option value="">Sin asignar</option>
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

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Fecha *
            </label>
            <input
              type="date"
              required
              value={form.appointment_date}
              onChange={(e) =>
                setForm({ ...form, appointment_date: e.target.value })
              }
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Hora Inicio *
              </label>
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-on-surface block">
                Hora Fin *
              </label>
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>

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
              Notas
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50 resize-none"
              placeholder="Notas internas..."
            />
          </div>

          {/* Footer */}
          <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-outline-variant/10">
            <div className="flex gap-2 flex-1">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-error-dim hover:bg-error-container/20 transition-colors"
                >
                  Eliminar
                </button>
              )}
              {canCharge && (
                <button
                  type="button"
                  onClick={handleCharge}
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  Cobrar
                </button>
              )}
            </div>
            <div className="flex gap-3 flex-1 sm:flex-none">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Guardando..."
                  : isEditing
                    ? "Actualizar"
                    : "Crear Cita"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
