import { create } from "zustand";
import * as sessionService from "@/services/session.service";
import type { SessionUser } from "@/services/session.service";

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Carga el usuario una sola vez; llamadas posteriores son no-op (datos compartidos entre componentes). */
  loadSession: () => Promise<void>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  loading: false,
  loaded: false,
  error: null,

  loadSession: async () => {
    // Evita fetches duplicados cuando varios componentes la invocan al montar.
    if (get().loaded || get().loading) return;
    set({ loading: true, error: null });
    try {
      const user = await sessionService.fetchSessionUser();
      set({ user, loading: false, loaded: true });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },
}));
