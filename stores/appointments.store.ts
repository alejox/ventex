import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import type { BusyAppointment } from "@/lib/appointment-availability";
import * as appointmentsService from "@/services/appointments.service";
import type {
  Appointment,
  AppointmentPaymentMethod,
  BillableAppointment,
  NewAppointmentInput,
} from "@/services/appointments.service";

interface AppointmentsState {
  appointments: Appointment[];
  selectedDate: Date;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  linkedAppointment: Appointment | null;
  linkLoading: boolean;
  linkError: string | null;
  fetchLinkedAppointment: (id: string) => Promise<Appointment | null>;

  fetchAppointments: (startDate: string, endDate: string) => Promise<void>;
  /** Las citas de un día (sin cancelar) para calcular quién está libre. No toca el estado. */
  fetchDayBusy: (date: string) => Promise<BusyAppointment[]>;
  addAppointment: (input: NewAppointmentInput) => Promise<boolean>;
  updateAppointment: (
    id: string,
    input: NewAppointmentInput,
  ) => Promise<boolean>;
  updateStatus: (id: string, status: string) => Promise<boolean>;
  /** Cobra la cita (crea la venta del servicio) y la marca como completada. */
  chargeAppointment: (
    appointment: Appointment,
    paymentMethod: AppointmentPaymentMethod,
  ) => Promise<boolean>;

  /** Citas de hoy sin cobrar, para cobrarlas de una desde el POS. */
  billable: BillableAppointment[];
  fetchBillable: (today: string) => Promise<void>;
  /** Ata a la cita la venta que la pagó (cobrada desde el POS). */
  linkSale: (appointmentId: string, saleId: string) => Promise<boolean>;
  deleteAppointment: (id: string) => Promise<boolean>;
  setSelectedDate: (date: Date) => void;
}


let linkRequest = 0;
let calendarRequest = 0;

export const useAppointmentsStore = create<AppointmentsState>((set) => ({
  appointments: [],
  selectedDate: new Date(),
  loading: false,
  error: null,
  submitting: false,
  linkedAppointment: null,
  linkLoading: false,
  linkError: null,

  fetchLinkedAppointment: async (id) => {
    const request = ++linkRequest;
    set({ linkLoading: true, linkError: null, linkedAppointment: null });
    try {
      const appointment = await appointmentsService.fetchAppointmentById(id);
      if (request !== linkRequest) return null;
      set({ linkedAppointment: appointment, linkLoading: false,
        linkError: appointment ? null : "Esta reserva ya no está disponible o no tienes acceso a ella." });
      return appointment;
    } catch (e) {
      if (request !== linkRequest) return null;
      set({ linkError: toMessage(e), linkLoading: false });
      return null;
    }
  },
  billable: [],

  fetchAppointments: async (startDate, endDate) => {
    const request = ++calendarRequest;
    set({ loading: true, error: null });
    try {
      const appointments = await appointmentsService.fetchAppointments(
        startDate,
        endDate,
      );
      if (request !== calendarRequest) return;
      set({ appointments, loading: false });
    } catch (e) {
      if (request !== calendarRequest) return;
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchDayBusy: async (date) => {
    try {
      return await appointmentsService.fetchDayBusy(date);
    } catch {
      // Sin esta lista la pantalla no avisa, pero el trigger igual protege al guardar.
      return [];
    }
  },

  addAppointment: async (input) => {
    set({ submitting: true, error: null });
    try {
      const appointment = await appointmentsService.createAppointment(input);
      set((s) => ({
        appointments: [...s.appointments, appointment],
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateAppointment: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const updated = await appointmentsService.updateAppointment(id, input);
      set((s) => ({
        appointments: s.appointments.map((a) => (a.id === id ? updated : a)),
        linkedAppointment: s.linkedAppointment?.id === id ? updated : s.linkedAppointment,
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateStatus: async (id, status) => {
    set({ submitting: true, error: null });
    try {
      await appointmentsService.updateAppointmentStatus(id, status);
      set((s) => ({
        submitting: false,
        linkedAppointment: s.linkedAppointment?.id === id ? { ...s.linkedAppointment, status: status as Appointment["status"] } : s.linkedAppointment,
        appointments: s.appointments.map((a) =>
          a.id === id ? { ...a, status: status as Appointment["status"] } : a,
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  chargeAppointment: async (appointment, paymentMethod) => {
    set({ submitting: true, error: null });
    try {
      const saleId = await appointmentsService.chargeAppointment(appointment, paymentMethod);
      set((s) => ({
        linkedAppointment: s.linkedAppointment?.id === appointment.id ? { ...s.linkedAppointment, status: "completed" } : s.linkedAppointment,
        appointments: s.appointments.map((a) =>
          a.id === appointment.id ? { ...a, status: "completed", sale_id: saleId } : a,
        ),
        billable: s.billable.filter((b) => b.id !== appointment.id),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  deleteAppointment: async (id) => {
    set({ error: null });
    try {
      await appointmentsService.deleteAppointment(id);
      set((s) => ({
        linkedAppointment: s.linkedAppointment?.id === id ? null : s.linkedAppointment,
        appointments: s.appointments.filter((a) => a.id !== id),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  // Falla en silencio a propósito: la franja de citas es un atajo del POS, y
  // un error de red ahí no puede tapar el cobro normal con un cartel.
  fetchBillable: async (today) => {
    try {
      const billable = await appointmentsService.fetchBillableAppointments(today);
      set({ billable });
    } catch {
      set({ billable: [] });
    }
  },

  linkSale: async (appointmentId, saleId) => {
    try {
      await appointmentsService.linkAppointmentToSale(appointmentId, saleId);
      set((s) => ({
        billable: s.billable.filter((b) => b.id !== appointmentId),
        appointments: s.appointments.map((a) =>
          a.id === appointmentId ? { ...a, status: "completed", sale_id: saleId } : a,
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  setSelectedDate: (date) => set({ selectedDate: date }),
}));
