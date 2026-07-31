import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as workspaceService from "@/services/workspace.service";
import type { WorkspaceContext } from "@/services/workspace.service";

interface WorkspaceState {
  context: WorkspaceContext | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  select: (workspaceId: string) => Promise<boolean>;
  accept: (membershipId: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  context: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const context = await workspaceService.fetchWorkspaceContext();
      set({ context, loading: false });
    } catch (error) {
      set({ error: toMessage(error), loading: false });
    }
  },

  select: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      await workspaceService.selectWorkspace(workspaceId);
      const context = await workspaceService.fetchWorkspaceContext();
      set({ context, loading: false });
      return true;
    } catch (error) {
      set({ error: toMessage(error), loading: false });
      return false;
    }
  },

  accept: async (membershipId) => {
    set({ loading: true, error: null });
    try {
      await workspaceService.acceptInvitation(membershipId);
      await get().load();
      return true;
    } catch (error) {
      set({ error: toMessage(error), loading: false });
      return false;
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    try {
      await workspaceService.signOut();
      set({ context: null, loading: false });
      return true;
    } catch (error) {
      set({ error: toMessage(error), loading: false });
      return false;
    }
  },
}));
