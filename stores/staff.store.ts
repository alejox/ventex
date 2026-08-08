import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as staffService from "@/services/staff.service";
import * as workerService from "@/services/worker.service";
import type { StaffMember, NewStaffInput, CommissionRow } from "@/services/staff.service";
import type {
  WorkerMember,
  InviteWorkerInput,
  UpdateWorkerInput,
} from "@/services/worker.service";
import type { WorkerPermissions } from "@/config/business";

/**
 * Store de Personal: la ficha de la persona Y su acceso al sistema.
 *
 * Son dos consultas separadas a propósito. `fetchStaff` (solo fichas) lo usan
 * pantallas que cualquier empleado puede abrir — el selector de personal de las
 * citas, por ejemplo. `fetchAccounts` lee `profiles`, que solo el dueño puede
 * listar: mezclarlas en una sola acción rompería las citas para los empleados.
 */
interface StaffState {
  staff: StaffMember[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  /** Cuentas de acceso del negocio. Solo se cargan en la pantalla del dueño. */
  accounts: WorkerMember[];
  accountsLoading: boolean;

  commissions: CommissionRow[];
  commissionsLoading: boolean;

  fetchStaff: () => Promise<void>;
  fetchAccounts: () => Promise<void>;
  fetchCommissions: () => Promise<void>;

  /** Devuelve true si el alta fue correcta (para que el componente cierre el modal). */
  addStaff: (input: NewStaffInput) => Promise<boolean>;
  updateStaff: (id: string, input: NewStaffInput) => Promise<boolean>;
  deleteStaff: (id: string) => Promise<boolean>;

  /** Le crea cuenta a una ficha existente; `staffId` es lo que las enlaza. */
  grantAccess: (input: InviteWorkerInput) => Promise<boolean>;
  updateAccess: (accountId: string, input: UpdateWorkerInput) => Promise<boolean>;
  updatePermissions: (accountId: string, permissions: WorkerPermissions) => Promise<boolean>;
  resendInvitation: (accountId: string) => Promise<boolean>;
  reactivateAccess: (accountId: string) => Promise<boolean>;
  revokeAccess: (accountId: string) => Promise<boolean>;
}

export const useStaffStore = create<StaffState>((set) => ({
  staff: [],
  // Arranca en `true`: el primer render es anterior al fetch del efecto, y con
  // `false` mostraba el estado vacío sobre datos que sí existen.
  loading: true,
  error: null,
  submitting: false,
  accounts: [],
  accountsLoading: false,
  commissions: [],
  commissionsLoading: false,

  fetchStaff: async () => {
    set({ loading: true, error: null });
    try {
      const staff = await staffService.fetchStaff();
      set({ staff, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchAccounts: async () => {
    set({ accountsLoading: true });
    try {
      const accounts = await workerService.fetchWorkers();
      set({ accounts, accountsLoading: false });
    } catch (e) {
      set({ error: toMessage(e), accountsLoading: false });
    }
  },

  fetchCommissions: async () => {
    set({ commissionsLoading: true });
    try {
      const commissions = await staffService.fetchCommissions();
      set({ commissions, commissionsLoading: false });
    } catch (e) {
      set({ error: toMessage(e), commissionsLoading: false });
    }
  },

  addStaff: async (input) => {
    set({ submitting: true, error: null });
    try {
      const member = await staffService.createStaff(input);
      set((s) => ({ staff: [...s.staff, member], submitting: false }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateStaff: async (id, input) => {
    set({ submitting: true, error: null });
    try {
      const member = await staffService.updateStaff(id, input);
      set((s) => ({
        staff: s.staff.map((x) => (x.id === id ? member : x)),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  deleteStaff: async (id) => {
    set({ submitting: true, error: null });
    try {
      await staffService.deleteStaff(id);
      set((s) => ({
        staff: s.staff.filter((x) => x.id !== id),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  grantAccess: async (input) => {
    set({ submitting: true, error: null });
    try {
      await workerService.inviteWorkerViaApi(input);
      // La cuenta se crea del lado del servidor (Auth + perfil): hay que releer
      // para conocer su id, que es lo que después piden permisos y edición.
      const accounts = await workerService.fetchWorkers();
      set({ accounts, submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateAccess: async (accountId, input) => {
    set({ submitting: true, error: null });
    try {
      await workerService.updateWorker(accountId, input);
      set((s) => ({
        accounts: s.accounts.map((a) =>
          a.id === accountId
            ? { ...a, full_name: input.fullName, role: input.role || null }
            : a,
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updatePermissions: async (accountId, permissions) => {
    set({ submitting: true, error: null });
    try {
      await workerService.updateWorkerPermissions(accountId, permissions);
      set((s) => ({
        accounts: s.accounts.map((a) =>
          a.id === accountId ? { ...a, worker_permissions: permissions } : a,
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  resendInvitation: async (accountId) => {
    set({ submitting: true, error: null });
    try {
      await workerService.changeWorkerAccess(accountId, "resend");
      set({ submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  reactivateAccess: async (accountId) => {
    set({ submitting: true, error: null });
    try {
      await workerService.changeWorkerAccess(accountId, "reactivate");
      set((s) => ({
        accounts: s.accounts.map((a) =>
          a.id === accountId ? { ...a, access_status: "active", suspended_at: null } : a,
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  revokeAccess: async (accountId) => {
    set({ submitting: true, error: null });
    try {
      await workerService.changeWorkerAccess(accountId, "suspend");
      set((s) => ({
        accounts: s.accounts.map((a) =>
          a.id === accountId
            ? { ...a, access_status: "suspended", suspended_at: new Date().toISOString() }
            : a,
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
