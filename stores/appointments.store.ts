import { create } from "zustand";
import * as appointmentsService from "@/services/appointments.service";
import type {
  Appointment,
  NewAppointmentInput,
} from "@/services/appointments.service";

interface AppointmentsState {
  appointments: Appointment[];
  selectedDate: Date;
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchAppointments: (startDate: string, endDate: string) => Promise<void>;
  addAppointment: (input: NewAppointmentInput) => Promise<boolean>;
  updateAppointment: (
    id: string,
    input: NewAppointmentInput,
  ) => Promise<boolean>;
  updateStatus: (id: string, status: string) => Promise<boolean>;
  deleteAppointment: (id: string) => Promise<boolean>;
  setSelectedDate: (date: Date) => void;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useAppointmentsStore = create<AppointmentsState>((set) => ({
  appointments: [],
  selectedDate: new Date(),
  loading: false,
  error: null,
  submitting: false,

  fetchAppointments: async (startDate, endDate) => {
    set({ loading: true, error: null });
    try {
      const appointments = await appointmentsService.fetchAppointments(
        startDate,
        endDate,
      );
      set({ appointments, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
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
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateStatus: async (id, status) => {
    set({ error: null });
    try {
      await appointmentsService.updateAppointmentStatus(id, status);
      set((s) => ({
        appointments: s.appointments.map((a) =>
          a.id === id ? { ...a, status: status as Appointment["status"] } : a,
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  deleteAppointment: async (id) => {
    set({ error: null });
    try {
      await appointmentsService.deleteAppointment(id);
      set((s) => ({
        appointments: s.appointments.filter((a) => a.id !== id),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  setSelectedDate: (date) => set({ selectedDate: date }),
}));
