import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de notificaciones ----

export type NotificationSeverity = "info" | "warning" | "error";

export interface AppNotification {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const NOTIFICATION_SELECT = "id, type, severity, title, body, data, read_at, created_at";

/** Últimas notificaciones del usuario autenticado (RLS: solo las suyas). */
export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AppNotification[];
}

/** Cuenta de no leídas, sin traer las filas. */
export async function fetchUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}
