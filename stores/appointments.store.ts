import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import type { BusyAppointment } from "@/lib/appointment-availability";
import type { AgendaBusySlot } from "@/lib/agenda-privacy";
import type { OpeningHour } from "@/lib/appointment-hours";
import { removePending, upsertPending } from "@/lib/pending-appointments";
import * as appointmentsService from "@/services/appointments.service";
import { browserTimeZone, fetchBusinessTimeZone } from "@/services/finance.service";
import type {
  Appointment,
  AppointmentPaymentMethod,
  BillableAppointment,
  NewAppointmentInput,
} from "@/services/appointments.service";

interface AppointmentsState {
  today: Appointment[];
  todayLoading: boolean;
  todayError: string | null;
  fetchToday: (date: string) => Promise<void>;
  appointments: Appointment[];
  selectedDate: Date;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  linkedAppointment: Appointment | null;
  linkLoading: boolean;
  linkError: string | null;
  fetchLinkedAppointment: (id: string) => Promise<Appointment | null>;

  /**
   * Reservas pendientes de CUALQUIER fecha (ver `fetchPendingAppointments`).
   * Cada acción que cambia una cita la refleja aquí, así el contador de
   * "Pendientes" no queda viejo tras confirmar o cancelar.
   */
  pendingAppointments: Appointment[];
  pendingLoading: boolean;
  pendingError: string | null;
  fetchPendingAppointments: () => Promise<void>;

  /**
   * Citas del período. Con `withBusy` (trabajador sin agenda completa) trae
   * además los horarios ocupados del resto del equipo, sin identidad.
   */
  fetchAppointments: (startDate: string, endDate: string, options?: { withBusy?: boolean }) => Promise<void>;
  /** Horarios ocupados del período (`agenda_busy_slots`); vacío si no se pidieron. */
  busySlots: AgendaBusySlot[];
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

  /**
   * Mueve la cita (arrastre en la grilla o "Mover a…"). Optimista: la grilla
   * la dibuja ya en su lugar nuevo y, si la base la rechaza, vuelve atrás.
   */
  /** `staffId` (opcional) reasigna la cita: arrastrarla a la columna de otra persona. */
  rescheduleAppointment: (id: string, next: { date: string; start: string; end: string; staffId?: string | null }) => Promise<boolean>;

  /** Horario de atención; `null` = sin cargar o el negocio nunca lo configuró. */
  businessHours: OpeningHour[] | null;
  businessHoursLoaded: boolean;
  fetchBusinessHours: () => Promise<void>;

  /**
   * Business timezone (`business_sites.timezone`): the agenda's "today" and
   * "now" come from it. Starts as the device zone so nothing waits on it.
   */
  timeZone: string;
  ensureTimeZone: () => Promise<void>;
}


let linkRequest = 0;
let calendarRequest = 0;
let todayRequest = 0;
let pendingRequest = 0;

/**
 * Una cita fuera del período cargado (abierta desde "Pendientes" o desde un
 * enlace) no está en `appointments`: se sigue en `linkedAppointment`, que es lo
 * que el modal lee primero (`currentAppointment`). Sin esto, confirmar una
 * reserva de otro mes dejaba la píldora en "Pendiente".
 */
function tracksOutside(s: Pick<AppointmentsState, "appointments" | "linkedAppointment">, id: string): boolean {
  return s.linkedAppointment?.id === id || !s.appointments.some((a) => a.id === id);
}

export const useAppointmentsStore = create<AppointmentsState>((set, get) => ({
  today: [],
  todayLoading: true,
  todayError: null,
  fetchToday: async (date) => {
    const request = ++todayRequest;
    set({ todayLoading: true, todayError: null });
    try {
      const today = await appointmentsService.fetchAppointments(date, date);
      if (request === todayRequest) set({ today, todayLoading: false });
    } catch (e) {
      if (request === todayRequest) set({ todayError: toMessage(e), todayLoading: false });
    }
  },
  appointments: [],
  selectedDate: new Date(),
  loading: false,
  error: null,
  submitting: false,
  linkedAppointment: null,
  linkLoading: false,
  linkError: null,

  pendingAppointments: [],
  pendingLoading: false,
  pendingError: null,
  fetchPendingAppointments: async () => {
    const request = ++pendingRequest;
    set({ pendingLoading: true, pendingError: null });
    try {
      const pendingAppointments = await appointmentsService.fetchPendingAppointments();
      if (request !== pendingRequest) return;
      set({ pendingAppointments, pendingLoading: false });
    } catch (e) {
      if (request !== pendingRequest) return;
      set({ pendingError: toMessage(e), pendingLoading: false });
    }
  },

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

  busySlots: [],

  fetchAppointments: async (startDate, endDate, options) => {
    const request = ++calendarRequest;
    set({ loading: true, error: null });
    try {
      const [appointments, busySlots] = await Promise.all([
        appointmentsService.fetchAppointments(startDate, endDate),
        options?.withBusy
          ? appointmentsService.fetchAgendaBusy(startDate, endDate).catch((): AgendaBusySlot[] => [])
          : Promise.resolve<AgendaBusySlot[]>([]),
      ]);
      if (request !== calendarRequest) return;
      // Sin los ocupados la agenda propia igual sirve: no se tumba la pantalla.
      set({ appointments, busySlots, loading: false });
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
        pendingAppointments: upsertPending(s.pendingAppointments, appointment),
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
        linkedAppointment: tracksOutside(s, id) ? updated : s.linkedAppointment,
        pendingAppointments: upsertPending(s.pendingAppointments, updated),
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
      set((s) => {
        const nextStatus = status as Appointment["status"];
        const source = s.linkedAppointment?.id === id
          ? s.linkedAppointment
          : s.appointments.find((a) => a.id === id) ?? s.pendingAppointments.find((a) => a.id === id) ?? null;
        const pendingAppointments = source
          ? upsertPending(s.pendingAppointments, { ...source, status: nextStatus })
          : removePending(s.pendingAppointments, id);
        return {
          submitting: false,
          linkedAppointment: source && tracksOutside(s, id) ? { ...source, status: nextStatus } : s.linkedAppointment,
          appointments: s.appointments.map((a) =>
            a.id === id ? { ...a, status: nextStatus } : a,
          ),
          pendingAppointments,
        };
      });
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
        linkedAppointment: s.linkedAppointment?.id === appointment.id ? { ...s.linkedAppointment, status: "completed", sale_id: saleId } : s.linkedAppointment,
        appointments: s.appointments.map((a) =>
          a.id === appointment.id ? { ...a, status: "completed", sale_id: saleId } : a,
        ),
        billable: s.billable.filter((b) => b.id !== appointment.id),
        pendingAppointments: removePending(s.pendingAppointments, appointment.id),
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
        pendingAppointments: removePending(s.pendingAppointments, id),
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
        pendingAppointments: removePending(s.pendingAppointments, appointmentId),
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

  rescheduleAppointment: async (id, next) => {
    const previous = get().appointments.find((a) => a.id === id) ?? null;
    const reassigned = next.staffId !== undefined && next.staffId !== previous?.staff_id;
    const moved = (a: Appointment): Appointment => ({
      ...a,
      appointment_date: next.date,
      start_time: next.start,
      end_time: next.end,
      ...(reassigned ? { staff_id: next.staffId ?? null, staff: null } : {}),
    });
    set((s) => ({ error: null, appointments: s.appointments.map((a) => (a.id === id ? moved(a) : a)) }));
    try {
      const updated = await appointmentsService.rescheduleAppointment(id, next.date, next.start, next.end, next.staffId);
      set((s) => ({
        appointments: s.appointments.map((a) => (a.id === id ? updated : a)),
        linkedAppointment: s.linkedAppointment?.id === id ? updated : s.linkedAppointment,
        pendingAppointments: s.pendingAppointments.some((a) => a.id === id)
          ? upsertPending(s.pendingAppointments, updated)
          : s.pendingAppointments,
      }));
      return true;
    } catch (e) {
      set((s) => ({
        error: toMessage(e),
        appointments: previous ? s.appointments.map((a) => (a.id === id ? previous : a)) : s.appointments,
      }));
      return false;
    }
  },

  businessHours: null,
  businessHoursLoaded: false,
  // Se pide una vez: el horario no cambia mientras se mira el calendario. Un
  // error deja la grilla como siempre (7–21, sin sombrear), no la rompe.
  fetchBusinessHours: async () => {
    if (get().businessHoursLoaded) return;
    try {
      const businessHours = await appointmentsService.fetchBusinessHours();
      set({ businessHours, businessHoursLoaded: true });
    } catch {
      set({ businessHours: null, businessHoursLoaded: true });
    }
  },

  timeZone: browserTimeZone(),
  // The loader caches its promise for the session, so calling this from every
  // surface that shows "today" costs one request at most.
  ensureTimeZone: async () => {
    const timeZone = await fetchBusinessTimeZone();
    if (get().timeZone !== timeZone) set({ timeZone });
  },
}));
