import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as notificationsService from "@/services/notifications.service";
import type { AppNotification } from "@/services/notifications.service";

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}


export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  fetchNotifications: async () => {
    set({ loading: true, error: null });
    try {
      const notifications = await notificationsService.fetchNotifications();
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read_at).length,
        loading: false,
      });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const unreadCount = await notificationsService.fetchUnreadCount();
      set({ unreadCount });
    } catch (e) {
      set({ error: toMessage(e) });
    }
  },

  markRead: async (id) => {
    // Optimista: el badge debe bajar apenas se abre la notificación.
    const now = new Date().toISOString();
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)),
      unreadCount: Math.max(s.unreadCount - 1, 0),
    }));
    try {
      await notificationsService.markRead(id);
    } catch (e) {
      set({ error: toMessage(e) });
    }
  },

  markAllRead: async () => {
    const now = new Date().toISOString();
    set((s) => ({
      notifications: s.notifications.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      unreadCount: 0,
    }));
    try {
      await notificationsService.markAllRead();
    } catch (e) {
      set({ error: toMessage(e) });
    }
  },
}));
