import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as workerService from "@/services/worker.service";
import type {
  WorkerMember,
  InviteWorkerInput,
  UpdateWorkerInput,
} from "@/services/worker.service";
import type { WorkerPermissions } from "@/config/business";

interface WorkerState {
  workers: WorkerMember[];
  loading: boolean;
  error: string | null;
  submitting: boolean;

  fetchWorkers: () => Promise<void>;
  inviteWorker: (input: InviteWorkerInput) => Promise<boolean>;
  updateWorker: (workerId: string, input: UpdateWorkerInput) => Promise<boolean>;
  updatePermissions: (workerId: string, permissions: WorkerPermissions) => Promise<boolean>;
  deactivateWorker: (workerId: string) => Promise<boolean>;
}


export const useWorkerStore = create<WorkerState>((set) => ({
  workers: [],
  loading: false,
  error: null,
  submitting: false,

  fetchWorkers: async () => {
    set({ loading: true, error: null });
    try {
      const workers = await workerService.fetchWorkers();
      set({ workers, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  inviteWorker: async (input) => {
    set({ submitting: true, error: null });
    try {
      await workerService.inviteWorkerViaApi(input);
      set({ submitting: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updateWorker: async (workerId, input) => {
    set({ submitting: true, error: null });
    try {
      await workerService.updateWorker(workerId, input);
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === workerId
            ? { ...w, full_name: input.fullName, username: input.username, role: input.role || null }
            : w,
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  updatePermissions: async (workerId, permissions) => {
    set({ submitting: true, error: null });
    try {
      await workerService.updateWorkerPermissions(workerId, permissions);
      set((s) => ({
        workers: s.workers.map((w) =>
          w.id === workerId ? { ...w, worker_permissions: permissions } : w,
        ),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },

  deactivateWorker: async (workerId) => {
    set({ submitting: true, error: null });
    try {
      await workerService.deactivateWorker(workerId);
      set((s) => ({
        workers: s.workers.filter((w) => w.id !== workerId),
        submitting: false,
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e), submitting: false });
      return false;
    }
  },
}));
