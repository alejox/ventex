import { create } from "zustand";
import { scheduleErrorOf } from "@/services/school-schedule.service";
import * as schoolScheduleService from "@/services/school-schedule.service";
import type {
  WeeklyAvailabilityRow,
  BlockedDateRow,
  LessonWindow,
  SchoolLesson,
  EnrollmentScheduleViewRow,
  ParticipantEnrollmentOption,
  SeriesPlan,
  ScheduleSeriesInput,
  ScheduleSeriesResult,
  ScheduleLessonInput,
  SeriesPreviewInput,
  TeacherFreeWindowsInput,
  AvailabilityInput,
} from "@/services/school-schedule.service";

interface SchoolScheduleState {
  /** Clases de la semana visible, ya con profesor y alumnos. */
  lessons: SchoolLesson[];
  /** Rango (instantes ISO) con el que se cargó `lessons`. */
  agendaFrom: string;
  agendaTo: string;
  /** Disponibilidad del profesor que se está editando. */
  weekly: WeeklyAvailabilityRow[];
  blockedDates: BlockedDateRow[];
  /** Matrículas activas con su vista contratadas/consumidas/reservadas. */
  enrollmentViews: EnrollmentScheduleViewRow[];
  /** Matrículas que pueden sumarse a la clase que se está completando. */
  eligibleOptions: ParticipantEnrollmentOption[];
  /** Última previsualización de serie (null = no se previsualizó todavía). */
  seriesDraft: SeriesPlan | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchAgenda: (fromIso: string, toIso: string) => Promise<void>;
  fetchAvailability: (teacherProfileId: string) => Promise<void>;
  saveWeekly: (teacherProfileId: string, rows: AvailabilityInput[]) => Promise<boolean>;
  createBlockedDate: (
    teacherProfileId: string,
    blockedDate: string,
    reason?: string
  ) => Promise<boolean>;
  deleteBlockedDate: (id: string) => Promise<boolean>;
  fetchFreeWindows: (input: TeacherFreeWindowsInput) => Promise<LessonWindow[]>;
  previewSeries: (input: SeriesPreviewInput) => Promise<SeriesPlan | null>;
  scheduleSeries: (input: ScheduleSeriesInput) => Promise<ScheduleSeriesResult | null>;
  scheduleLesson: (input: ScheduleLessonInput) => Promise<boolean>;
  addParticipant: (lessonId: string, enrollmentId: string) => Promise<boolean>;
  fetchEnrollmentViews: () => Promise<void>;
  fetchEligibleOptions: (lessonId: string) => Promise<void>;
  resetAvailability: () => void;
  clearSeriesDraft: () => void;
}

export const useSchoolScheduleStore = create<SchoolScheduleState>((set, get) => ({
  lessons: [],
  agendaFrom: "",
  agendaTo: "",
  weekly: [],
  blockedDates: [],
  enrollmentViews: [],
  eligibleOptions: [],
  seriesDraft: null,
  loading: false,
  saving: false,
  error: null,

  fetchAgenda: async (fromIso, toIso) => {
    set({ loading: true, error: null });
    try {
      const lessons = await schoolScheduleService.fetchAgendaLessons(fromIso, toIso);
      set({ lessons, agendaFrom: fromIso, agendaTo: toIso, loading: false });
    } catch (e) {
      set({ error: scheduleErrorOf(e), loading: false });
    }
  },

  fetchAvailability: async (teacherProfileId) => {
    set({ loading: true, error: null });
    try {
      const [weekly, blockedDates] = await Promise.all([
        schoolScheduleService.fetchWeeklyAvailability(teacherProfileId),
        schoolScheduleService.fetchBlockedDates(teacherProfileId),
      ]);
      set({ weekly, blockedDates, loading: false });
    } catch (e) {
      set({ error: scheduleErrorOf(e), loading: false });
    }
  },

  saveWeekly: async (teacherProfileId, rows) => {
    set({ saving: true, error: null });
    try {
      const weekly = await schoolScheduleService.saveWeeklyAvailability(teacherProfileId, rows);
      set({ weekly, saving: false });
      return true;
    } catch (e) {
      set({ error: scheduleErrorOf(e), saving: false });
      return false;
    }
  },

  createBlockedDate: async (teacherProfileId, blockedDate, reason) => {
    set({ saving: true, error: null });
    try {
      const row = await schoolScheduleService.addBlockedDate(teacherProfileId, blockedDate, reason);
      set((s) => ({
        blockedDates: [...s.blockedDates, row].sort((a, b) =>
          a.blocked_date.localeCompare(b.blocked_date)
        ),
        saving: false,
      }));
      return true;
    } catch (e) {
      set({ error: scheduleErrorOf(e), saving: false });
      return false;
    }
  },

  deleteBlockedDate: async (id) => {
    set({ saving: true, error: null });
    try {
      await schoolScheduleService.removeBlockedDate(id);
      set((s) => ({ blockedDates: s.blockedDates.filter((b) => b.id !== id), saving: false }));
      return true;
    } catch (e) {
      set({ error: scheduleErrorOf(e), saving: false });
      return false;
    }
  },

  fetchFreeWindows: async (input) => {
    set({ loading: true, error: null });
    try {
      const windows = await schoolScheduleService.fetchTeacherFreeWindows(input);
      set({ loading: false });
      return windows;
    } catch (e) {
      set({ error: scheduleErrorOf(e), loading: false });
      return [];
    }
  },

  previewSeries: async (input) => {
    set({ saving: true, error: null });
    try {
      const plan = await schoolScheduleService.previewSeries(input);
      set({ seriesDraft: plan, saving: false });
      return plan;
    } catch (e) {
      set({ seriesDraft: null, error: scheduleErrorOf(e), saving: false });
      return null;
    }
  },

  scheduleSeries: async (input) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolScheduleService.scheduleSeries(input);
      if (result.conflicts.length > 0) {
        set({
          seriesDraft: null,
          error: "La serie no se generó: hay clases que chocan con el horario.",
          saving: false,
        });
        return result;
      }
      const { agendaFrom, agendaTo, fetchAgenda, fetchEnrollmentViews } = get();
      if (agendaFrom) await fetchAgenda(agendaFrom, agendaTo);
      await fetchEnrollmentViews();
      set({ seriesDraft: null, saving: false });
      return result;
    } catch (e) {
      set({ error: scheduleErrorOf(e), saving: false });
      return null;
    }
  },

  scheduleLesson: async (input) => {
    set({ saving: true, error: null });
    try {
      await schoolScheduleService.scheduleLesson(input);
      const { agendaFrom, agendaTo, fetchAgenda, fetchEnrollmentViews } = get();
      if (agendaFrom) await fetchAgenda(agendaFrom, agendaTo);
      await fetchEnrollmentViews();
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: scheduleErrorOf(e), saving: false });
      return false;
    }
  },

  addParticipant: async (lessonId, enrollmentId) => {
    set({ saving: true, error: null });
    try {
      await schoolScheduleService.addParticipant(lessonId, enrollmentId);
      const { agendaFrom, agendaTo, fetchAgenda, fetchEligibleOptions, fetchEnrollmentViews } = get();
      if (agendaFrom) await fetchAgenda(agendaFrom, agendaTo);
      await fetchEligibleOptions(lessonId);
      await fetchEnrollmentViews();
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: scheduleErrorOf(e), saving: false });
      return false;
    }
  },

  fetchEnrollmentViews: async () => {
    set({ loading: true, error: null });
    try {
      const enrollmentViews = await schoolScheduleService.fetchEnrollmentScheduleViews();
      set({ enrollmentViews, loading: false });
    } catch (e) {
      set({ error: scheduleErrorOf(e), loading: false });
    }
  },

  fetchEligibleOptions: async (lessonId) => {
    set({ error: null });
    try {
      const eligibleOptions = await schoolScheduleService.fetchEligibleParticipantEnrollments(lessonId);
      set({ eligibleOptions });
    } catch (e) {
      set({ error: scheduleErrorOf(e) });
    }
  },

  resetAvailability: () => set({ weekly: [], blockedDates: [], error: null }),
  clearSeriesDraft: () => set({ seriesDraft: null }),
}));

// Selectores granulares
export const selectLessons = (s: SchoolScheduleState) => s.lessons;
export const selectEnrollmentViews = (s: SchoolScheduleState) => s.enrollmentViews;
export const selectSeriesDraft = (s: SchoolScheduleState) => s.seriesDraft;
export const selectWeekly = (s: SchoolScheduleState) => s.weekly;
export const selectBlockedDates = (s: SchoolScheduleState) => s.blockedDates;