import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as staffService from "@/services/staff.service";
import * as workerService from "@/services/worker.service";
import type {
  StaffMember,
  NewStaffInput,
  CommissionRow,
  CommissionPeriod,
  CommissionScope,
  CommissionSettlement,
  ServicesByStaff,
  SettleCommissionsInput,
  VoidSettlementResult,
} from "@/services/staff.service";
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
  /**
   * Qué alcance tienen las `commissions` cargadas. Liquidar o anular relee con
   * ESTE alcance: releer con otro dejaba la tabla mostrando un rango distinto
   * del chip que el dueño tiene elegido.
   */
  commissionsScope: CommissionScope;

  /** Historial de liquidaciones del negocio. */
  settlements: CommissionSettlement[];
  settlementsLoading: boolean;

  /** Reporte de servicios por persona. Va aparte de `commissions` a propósito. */
  servicesReport: ServicesByStaff[];
  servicesReportLoading: boolean;
  reportServices: { id: string; name: string }[] | null;
  servicesUnassigned: number;
  servicesReportError: string | null;

  fetchStaff: () => Promise<void>;
  fetchAccounts: () => Promise<void>;
  /** Nombra o quita al administrador del negocio (solo el dueño). */
  setAdmin: (accountId: string, isAdmin: boolean) => Promise<boolean>;
  /** Sin argumento carga TODO lo pendiente (lo que se debe, sin límite de fecha). */
  fetchCommissions: (scope?: CommissionScope) => Promise<void>;
  fetchSettlements: () => Promise<void>;
  fetchServicesReport: (period: CommissionPeriod) => Promise<void>;

  /**
   * Liquida y devuelve el id de la liquidación (para abrir su comprobante), o
   * null si falló. Relee comisiones e historial: después de pagar, el pendiente
   * de esa persona cambió y la pantalla tiene que decirlo.
   */
  settleCommissions: (input: SettleCommissionsInput) => Promise<string | null>;
  /** Devuelve qué se pudo reversar (incluido el efectivo), o null si falló. */
  voidSettlement: (settlementId: string) => Promise<VoidSettlementResult | null>;

  /**
   * Devuelve la ficha creada (o null si falló). La devuelve, y no solo un
   * booleano, porque el perfil docente de Personal necesita el `id` recién
   * creado para vincularse ahí mismo, en el mismo submit — sin eso habría que
   * releer `staff` a ciegas para encontrarlo.
   */
  addStaff: (input: NewStaffInput) => Promise<StaffMember | null>;
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

let servicesReportRequest = 0;
let commissionsRequest = 0;

export const useStaffStore = create<StaffState>((set, get) => ({
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
  commissionsScope: { kind: "pending" },
  settlements: [],
  settlementsLoading: false,
  servicesReport: [],
  servicesReportLoading: true,
  reportServices: null,
  servicesUnassigned: 0,
  servicesReportError: null,

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

  fetchCommissions: async (scope = { kind: "pending" }) => {
    const request = ++commissionsRequest;
    set({ commissionsLoading: true, commissionsScope: scope });
    try {
      const commissions = await staffService.fetchCommissions(scope);
      // Cambiar de chip rápido dispara dos consultas: gana la última pedida.
      if (request !== commissionsRequest) return;
      set({ commissions, commissionsLoading: false });
    } catch (e) {
      if (request !== commissionsRequest) return;
      set({ error: toMessage(e), commissionsLoading: false });
    }
  },

  fetchServicesReport: async (period) => {
    const request = ++servicesReportRequest;
    set({ servicesReportLoading: true, servicesReportError: null });
    try {
      const report = await staffService.fetchServicesByStaff(period);
      if (request !== servicesReportRequest) return;
      set({ servicesReport: report.rows, reportServices: report.services,
        servicesUnassigned: report.unassignedServices, servicesReportLoading: false });
    } catch (e) {
      if (request !== servicesReportRequest) return;
      set({ servicesReportError: toMessage(e), servicesReportLoading: false });
    }
  },

  fetchSettlements: async () => {
    set({ settlementsLoading: true });
    try {
      const settlements = await staffService.fetchSettlements();
      set({ settlements, settlementsLoading: false });
    } catch (e) {
      set({ error: toMessage(e), settlementsLoading: false });
    }
  },

  settleCommissions: async (input) => {
    set({ submitting: true, error: null });
    try {
      const id = await staffService.settleCommissions(input);
      const [commissions, settlements] = await Promise.all([
        staffService.fetchCommissions(get().commissionsScope),
        staffService.fetchSettlements(),
      ]);
      set({ commissions, settlements, submitting: false });
      return id;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  voidSettlement: async (settlementId) => {
    set({ submitting: true, error: null });
    try {
      const result = await staffService.voidCommissionSettlement(settlementId);
      const [commissions, settlements] = await Promise.all([
        staffService.fetchCommissions(get().commissionsScope),
        staffService.fetchSettlements(),
      ]);
      set({ commissions, settlements, submitting: false });
      return result;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
    }
  },

  addStaff: async (input) => {
    set({ submitting: true, error: null });
    try {
      const member = await staffService.createStaff(input);
      set((s) => ({ staff: [...s.staff, member], submitting: false }));
      return member;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return null;
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

  setAdmin: async (accountId, isAdmin) => {
    set({ submitting: true, error: null });
    try {
      await workerService.setWorkerAdmin(accountId, isAdmin);
      set((s) => ({
        accounts: s.accounts.map((a) =>
          a.id === accountId ? { ...a, is_admin: isAdmin } : a,
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
