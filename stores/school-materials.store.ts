import { create } from "zustand";
import * as schoolMaterialsService from "@/services/school-materials.service";
import { schoolLinkErrorOf } from "@/services/school-materials.service";
import { toMessage } from "@/lib/errors";
import type {
  AccessLinkResult,
  CommunicationLogEntry,
  CommunicationPurpose,
  CommunicationState,
  MaterialKind,
  NewMaterialFileInput,
  SchoolMaterial,
} from "@/services/school-materials.service";

// ============================================================================
// Materiales, enlaces de acceso y bitácora de comunicación.
//
// Store DELGADO como el resto del módulo: mantiene las listas que las
// pantallas necesitan y delega cada I/O al servicio. La subida de archivo es
// DOS pasos encadenados (`uploadMaterialFile` a la ruta de servidor, después
// `createMaterial` a la tabla) que este store expone como una sola acción
// para que el componente no tenga que orquestar el orden.
// ============================================================================

export interface UploadMaterialInput {
  title: string;
  instructions?: string | null;
  kind: MaterialKind;
  externalUrl?: string | null;
  file?: File | null;
  lessonId?: string | null;
  authorStaffId?: string | null;
  recipientStudentIds: string[];
}

interface SchoolMaterialsState {
  materials: SchoolMaterial[];
  materialsForStudent: SchoolMaterial[];
  communicationLog: CommunicationLogEntry[];
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchMaterials: () => Promise<void>;
  fetchMaterialsForStudent: (studentId: string) => Promise<void>;
  uploadMaterial: (input: UploadMaterialInput) => Promise<boolean>;
  deleteMaterial: (id: string) => Promise<boolean>;
  createConfirmLink: (lessonId: string) => Promise<AccessLinkResult | null>;
  createFamilyLink: (
    studentId: string,
    guardianCustomerId: string,
    hours?: number
  ) => Promise<AccessLinkResult | null>;
  revokeLink: (linkId: string) => Promise<boolean>;
  logCommunication: (input: {
    studentId: string;
    guardianCustomerId: string;
    purpose: CommunicationPurpose;
    state: CommunicationState;
    message?: string;
  }) => Promise<boolean>;
  fetchCommunicationLog: (studentId: string) => Promise<void>;
  clearError: () => void;
}

export const useSchoolMaterialsStore = create<SchoolMaterialsState>((set, get) => ({
  materials: [],
  materialsForStudent: [],
  communicationLog: [],
  loading: false,
  saving: false,
  error: null,

  fetchMaterials: async () => {
    set({ loading: true, error: null });
    try {
      const materials = await schoolMaterialsService.fetchMaterials();
      set({ materials, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchMaterialsForStudent: async (studentId) => {
    set({ loading: true, error: null });
    try {
      const materialsForStudent = await schoolMaterialsService.fetchMaterialsForStudent(studentId);
      set({ materialsForStudent, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  uploadMaterial: async (input) => {
    set({ saving: true, error: null });
    try {
      let file: NewMaterialFileInput | null = null;
      if (input.kind === "file") {
        if (!input.file) throw new Error("Seleccioná un archivo para subir.");
        file = await schoolMaterialsService.uploadMaterialFile(input.file);
      }
      await schoolMaterialsService.createMaterial({
        title: input.title,
        instructions: input.instructions,
        kind: input.kind,
        externalUrl: input.externalUrl,
        file,
        lessonId: input.lessonId,
        authorStaffId: input.authorStaffId,
        recipientStudentIds: input.recipientStudentIds,
      });
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  deleteMaterial: async (id) => {
    set({ saving: true, error: null });
    try {
      await schoolMaterialsService.deleteMaterial(id);
      set((s) => ({
        saving: false,
        materials: s.materials.filter((m) => m.id !== id),
        materialsForStudent: s.materialsForStudent.filter((m) => m.id !== id),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  createConfirmLink: async (lessonId) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolMaterialsService.createConfirmLink(lessonId);
      set({ saving: false });
      return result;
    } catch (e) {
      set({ error: schoolLinkErrorOf(e), saving: false });
      return null;
    }
  },

  createFamilyLink: async (studentId, guardianCustomerId, hours) => {
    set({ saving: true, error: null });
    try {
      const result = await schoolMaterialsService.createFamilyLink(
        studentId,
        guardianCustomerId,
        hours
      );
      set({ saving: false });
      return result;
    } catch (e) {
      set({ error: schoolLinkErrorOf(e), saving: false });
      return null;
    }
  },

  revokeLink: async (linkId) => {
    set({ saving: true, error: null });
    try {
      await schoolMaterialsService.revokeLink(linkId);
      set({ saving: false });
      return true;
    } catch (e) {
      set({ error: schoolLinkErrorOf(e), saving: false });
      return false;
    }
  },

  logCommunication: async (input) => {
    try {
      await schoolMaterialsService.logCommunication(input);
      await get().fetchCommunicationLog(input.studentId);
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  fetchCommunicationLog: async (studentId) => {
    try {
      const communicationLog = await schoolMaterialsService.fetchCommunicationLog(studentId);
      set({ communicationLog });
    } catch (e) {
      set({ error: toMessage(e) });
    }
  },

  clearError: () => set({ error: null }),
}));

// Selectores granulares
export const selectMaterials = (s: SchoolMaterialsState) => s.materials;
export const selectMaterialsForStudent = (s: SchoolMaterialsState) => s.materialsForStudent;
export const selectCommunicationLog = (s: SchoolMaterialsState) => s.communicationLog;
export const selectMaterialsSaving = (s: SchoolMaterialsState) => s.saving;
export const selectMaterialsError = (s: SchoolMaterialsState) => s.error;
