"use client";

import { useState, useEffect } from "react";
import { useAppointmentsStore } from "@/stores/appointments.store";
import { useCustomersStore } from "@/stores/customers.store";
import type { Appointment, NewAppointmentInput } from "@/services/appointments.service";

interface AppointmentModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate?: Date;
  appointment?: Appointment | null;
  defaultStartTime?: string;
}

const EMPTY_FORM: NewAppointmentInput = {
  customer_id: null,
  title: "",
  description: "",
  service_type: "",
  appointment_date: "",
  start_time: "09:00",
  end_time: "10:00",
  notes: "",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { value: "confirmed", label: "Confirmada", color: "bg-[#6063ee]/10 text-[#6063ee] border-[#6063ee]/20" },
  { value: "completed", label: "Completada", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { value: "cancelled", label: "Cancelada", color: "bg-error-container/20 text-error-dim border-error-container/30" },
];

export default function AppointmentModal({
  open,
  onClose,
  selectedDate,
  appointment,
  defaultStartTime,
}: AppointmentModalProps) {
  const { submitting, addAppointment, updateAppointment, updateStatus, deleteAppointment } =
    useAppointmentsStore();
  const customers = useCustomersStore((s) => s.customers);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);

  const [form, setForm] = useState<NewAppointmentInput>(EMPTY_FORM);
  const [error, setError] = useState("");
  const isEditing = !!appointment;

  useEffect(() => {
    if (customers.length === 0) fetchCustomers();
  }, [customers.length, fetchCustomers]);

  useEffect(() => {
    if (open) {
      if (appointment) {
        setForm({
          customer_id: appointment.customer_id,
          title: appointment.title,
          description: appointment.description || "",
          service_type: appointment.service_type || "",
          appointment_date: appointment.appointment_date,
          start_time: appointment.start_time.slice(0, 5),
          end_time: appointment.end_time.slice(0, 5),
          notes: appointment.notes || "",
        });
      } else {
        const dateStr = selectedDate
          ? selectedDate.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        setForm({
          ...EMPTY_FORM,
          appointment_date: dateStr,
          start_time: defaultStartTime || "09:00",
          end_time: defaultStartTime
            ? incrementHour(defaultStartTime)
            : "10:00",
        });
      }
      setError("");
    }
  }, [open, appointment, selectedDate, defaultStartTime]);

  const incrementHour = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const newH = Math.min(h + 1, 23);
    return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

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
    if (!appointment) return;
    await updateStatus(appointment.id, status);
  };

  if (!open) return null;

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
                  onClick={() => handleStatusChange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    appointment?.status === opt.value
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
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Cliente
            </label>
            <select
              value={form.customer_id || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  customer_id: e.target.value || null,
                })
              }
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            >
              <option value="">Sin cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Service type */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">
              Tipo de Servicio
            </label>
            <input
              type="text"
              value={form.service_type}
              onChange={(e) =>
                setForm({ ...form, service_type: e.target.value })
              }
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. Corte, Lavado, Consulta..."
            />
          </div>

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
          <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3 border-t border-outline-variant/10">
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
