import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as schoolPeopleService from "@/services/school-people.service";
import type {
  SchoolStudent,
  StudentGuardian,
  TeacherProfile,
  NewStudentInput,
  NewGuardianInput,
  NewTeacherInput,
  StaffOption,
} from "@/services/school-people.service";
import * as schoolEnrollmentsService from "@/services/school-enrollments.service";
import type { SchoolEnrollment, CreditMovement } from "@/services/school-enrollments.service";

export interface StudentDetail {
  student: SchoolStudent | null;
  guardians: StudentGuardian[];
  enrollments: SchoolEnrollment[];
  movements: CreditMovement[];
}

interface SchoolPeopleState {
  students: SchoolStudent[];
  teachers: TeacherProfile[];
  staffOptions: StaffOption[];
  detail: StudentDetail | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchStudents: () => Promise<void>;
  fetchTeachers: () => Promise<void>;
  fetchStaffOptions: () => Promise<void>;
  fetchStudentDetail: (id: string) => Promise<boolean>;
  saveStudent: (id: string | null, input: NewStudentInput) => Promise<boolean>;
  saveGuardian: (id: string | null, input: NewGuardianInput) => Promise<boolean>;
  saveTeacher: (id: string | null, input: NewTeacherInput) => Promise<boolean>;
}

const EMPTY_DETAIL: StudentDetail = { student: null, guardians: [], enrollments: [], movements: [] };

export const useSchoolPeopleStore = create<SchoolPeopleState>((set, get) => ({
  students: [],
  teachers: [],
  staffOptions: [],
  detail: EMPTY_DETAIL,
  loading: false,
  saving: false,
  error: null,

  fetchStudents: async () => {
    set({ loading: true, error: null });
    try {
      const students = await schoolPeopleService.fetchStudents();
      set({ students, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchTeachers: async () => {
    set({ loading: true, error: null });
    try {
      const teachers = await schoolPeopleService.fetchTeacherProfiles();
      set({ teachers, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchStaffOptions: async () => {
    try {
      const staffOptions = await schoolPeopleService.fetchEligibleStaff();
      set({ staffOptions });
    } catch (e) {
      set({ error: toMessage(e) });
    }
  },

  fetchStudentDetail: async (id) => {
    set({ loading: true, error: null });
    try {
      const [student, guardians, enrollments, movements] = await Promise.all([
        schoolPeopleService.fetchStudent(id),
        schoolPeopleService.fetchGuardians(id),
        schoolEnrollmentsService.fetchEnrollments().then((all) =>
          all.filter((e) => e.student_id === id)
        ),
        schoolEnrollmentsService
          .fetchEnrollments()
          .then(async (all) => {
            const active = all.find((e) => e.student_id === id && e.status === "active");
            return active ? schoolEnrollmentsService.fetchCreditMovements(active.id) : [];
          }),
      ]);
      set({ detail: { student, guardians, enrollments, movements }, loading: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), loading: false });
      return false;
    }
  },

  saveStudent: async (id, input) => {
    set({ saving: true, error: null });
    try {
      const student = id
        ? await schoolPeopleService.updateStudent(id, input)
        : await schoolPeopleService.createStudent(input);
      set((s) => ({
        students: id
          ? s.students.map((x) => (x.id === id ? student : x))
          : [...s.students, student].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")),
        saving: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  saveGuardian: async (id, input) => {
    set({ saving: true, error: null });
    try {
      const guardian = id
        ? await schoolPeopleService.updateGuardian(id, input)
        : await schoolPeopleService.createGuardian(input);
      set((s) => ({
        detail: s.detail
          ? {
              ...s.detail,
              guardians: id
                ? s.detail.guardians.map((g) => (g.id === id ? guardian : g))
                : [...s.detail.guardians, guardian].map((g) => ({
                    ...g,
                    is_notice_receiver:
                      g.id === guardian.id ? guardian.is_notice_receiver : false,
                  })),
            }
          : s.detail,
        saving: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  saveTeacher: async (id, input) => {
    set({ saving: true, error: null });
    try {
      const teacher = id
        ? await schoolPeopleService.updateTeacherProfile(id, input)
        : await schoolPeopleService.createTeacherProfile(input);
      set((s) => ({
        teachers: id
          ? s.teachers.map((t) => (t.id === id ? teacher : t))
          : [...s.teachers, teacher].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")),
        saving: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },
}));

// Selectores granulares
export const selectStudents = (s: SchoolPeopleState) => s.students;
export const selectTeachers = (s: SchoolPeopleState) => s.teachers;
export const selectStaffOptions = (s: SchoolPeopleState) => s.staffOptions;
export const selectStudentDetail = (s: SchoolPeopleState) => s.detail;