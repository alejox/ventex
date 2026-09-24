import { create } from "zustand";
import { classErrorOf } from "@/services/school-classes.service";
import * as schoolClassesService from "@/services/school-classes.service";
import { useSchoolScheduleStore } from "@/stores/school-schedule.store";
import type {
  AttendanceEntry,
  CloseParticipantRow,
  PendingCloseCandidate,
  PendingRescheduleRequest,
  RescheduleRequestInput,
} from "@/services/school-classes.service";

// ============================================================================
// Operación de clases: confirmar, cerrar, cancelar y reprogramar.
//
// Store DELGADO: mantiene las listas de trabajo del coordinador (clases por
// cerrar, pedidos de reprogramación pendientes, preview de cierre) y delega
// cada mutación al servicio. La agenda SIGUE viviendo en el store de horarios:
// acá solo se la refresca (`refreshAgenda`) después de mutar, sin duplicar su
// estado. El plan de consumo se calcula en el componente con `consumptionPlanOf`
// (puro) — el cierre es explícito, nunca silencioso.
// ============================================================================

interface SchoolClassesState {
  /** Clases por cerrar: derivadas (scheduled + sin confirmar + terminadas). */
  pendingCloseLessons: PendingCloseCandidate[];
  /** Participantes + política congelada de la clase que se está cerrando. */
  closePreview: CloseParticipantRow[];
  /** Pedidos de reprogramación pendientes, con clase/profesor/estudiante. */
  pendingRescheduleRequests: PendingRescheduleRequest[];
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchPendingCloseLessons: (nowIso: string) => Promise<void>;
  fetchClosePreview: (lessonId: string) => Promise<void>;
  confirmLesson: (lessonId: string) => Promise<boolean>;
  closeLesson: (lessonId: string, entries: AttendanceEntry[]) => Promise<boolean>;
  cancelLesson: (lessonId: string, reason: string) => Promise<boolean>;
  requestReschedule: (input: RescheduleRequestInput) => Promise<boolean>;
  fetchPendingRescheduleRequests: () => Promise<void>;
  approveReschedule: (
    requestId: string,
    range?: { startAt: string; endAt: string }
  ) => Promise<boolean>;
  rejectReschedule: (requestId: string, reason: string) => Promise<boolean>;
  /** Devuelve el saldo reconstruido tras el ajuste (null si falló). */
  adjustCredit: (enrollmentId: string, amount: number, reason: string) => Promise<number | null>;
  /** Refresca la agenda del store de horarios si ya hay un rango cargado. */
  refreshAgenda: () => Promise<void>;
  clearError: () => void;
}

export const useSchoolClassesStore = create<SchoolClassesState>((set, get) => ({
  pendingCloseLessons: [],
  closePreview: [],
  pendingRescheduleRequests: [],
  loading: false,
  saving: false,
  error: null,

  fetchPendingCloseLessons: async (nowIso) => {
    set({ loading: true, error: null });
    try {
      const pendingCloseLessons = await schoolClassesService.fetchPendingCloseLessons(nowIso);
      set({ pendingCloseLessons, loading: false });
    } catch (e) {
      set({ error: classErrorOf(e), loading: false });
    }
  },

  fetchClosePreview: async (lessonId) => {
    set({ loading: true, error: null });
    try {
      const closePreview = await schoolClassesService.fetchClosePreview(lessonId);
      set({ closePreview, loading: false });
    } catch (e) {
      set({ error: classErrorOf(e), loading: false });
    }
  },

  confirmLesson: async (lessonId) => {
    set({ saving: true, error: null });
    try {
      await schoolClassesService.confirmLesson(lessonId);
      await get().refreshAgenda();
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: classErrorOf(e), saving: false });
      return false;
    }
  },

  closeLesson: async (lessonId, entries) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolClassesService.closeLesson(lessonId, entries);
      if (!result.alreadyClosed) {
        await get().refreshAgenda();
        set((s) => ({
          pendingCloseLessons: s.pendingCloseLessons.filter((l) => l.id !== lessonId),
        }));
      }
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: classErrorOf(e), saving: false });
      return false;
    }
  },

  cancelLesson: async (lessonId, reason) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolClassesService.cancelLesson(lessonId, reason);
      if (!result.alreadyCancelled) {
        await get().refreshAgenda();
        set((s) => ({
          pendingCloseLessons: s.pendingCloseLessons.filter((l) => l.id !== lessonId),
        }));
      }
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: classErrorOf(e), saving: false });
      return false;
    }
  },

  requestReschedule: async (input) => {
    set({ saving: true, error: null });
    try {
      await schoolClassesService.requestReschedule(input);
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: classErrorOf(e), saving: false });
      return false;
    }
  },

  fetchPendingRescheduleRequests: async () => {
    set({ loading: true, error: null });
    try {
      const pendingRescheduleRequests =
        await schoolClassesService.fetchPendingRescheduleRequests();
      set({ pendingRescheduleRequests, loading: false });
    } catch (e) {
      set({ error: classErrorOf(e), loading: false });
    }
  },

  approveReschedule: async (requestId, range) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolClassesService.approveReschedule(requestId, range);
      if (!result.alreadyDecided) {
        await get().refreshAgenda();
        await get().fetchPendingRescheduleRequests();
      }
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: classErrorOf(e), saving: false });
      return false;
    }
  },

  rejectReschedule: async (requestId, reason) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolClassesService.rejectReschedule(requestId, reason);
      if (!result.alreadyDecided) {
        await get().fetchPendingRescheduleRequests();
      }
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: classErrorOf(e), saving: false });
      return false;
    }
  },

  adjustCredit: async (enrollmentId, amount, reason) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolClassesService.adjustCredit(enrollmentId, amount, reason);
      set({ saving: false });
      return result.balance;
    } catch (e) {
      set({ error: classErrorOf(e), saving: false });
      return null;
    }
  },

  refreshAgenda: async () => {
    const { agendaFrom, agendaTo } = useSchoolScheduleStore.getState();
    if (agendaFrom && agendaTo) {
      await useSchoolScheduleStore.getState().fetchAgenda(agendaFrom, agendaTo);
    }
  },

  clearError: () => set({ error: null }),
}));

// Selectores granulares
export const selectPendingCloseLessons = (s: SchoolClassesState) => s.pendingCloseLessons;
export const selectClosePreview = (s: SchoolClassesState) => s.closePreview;
export const selectPendingRescheduleRequests = (s: SchoolClassesState) =>
  s.pendingRescheduleRequests;
export const selectClassesSaving = (s: SchoolClassesState) => s.saving;
export const selectClassesError = (s: SchoolClassesState) => s.error;