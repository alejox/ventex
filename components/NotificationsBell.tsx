"use client";

import { useEffect, useState } from "react";
import { IconBell } from "@/app/assets/icons/DashboardIcons";
import { useNotificationsStore } from "@/stores/notifications.store";
import type { AppNotification } from "@/services/notifications.service";
import { backdropProps } from "@/components/modal";

const SEVERITY_DOT: Record<string, string> = {
  error: "bg-error",
  warning: "bg-amber-500",
  info: "bg-primary",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
}) {
  const unread = !notification.read_at;
  return (
    <button
      type="button"
      onClick={() => unread && onRead(notification.id)}
      className={`w-full text-left px-5 py-3.5 flex gap-3.5 transition-colors hover:bg-surface-container-highest/60 ${
        unread ? "bg-primary/5" : ""
      }`}
    >
      <span
        className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${SEVERITY_DOT[notification.severity] ?? "bg-primary"} ${
          unread ? "ring-2 ring-primary/20" : "opacity-30"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${unread ? "font-bold text-on-surface" : "font-medium text-on-surface-variant"}`}>
          {notification.title}
        </span>
        {notification.body && (
          <span className="block text-xs text-on-surface-variant/90 mt-1 leading-relaxed">
            {notification.body}
          </span>
        )}
        <span className="block text-[11px] text-on-surface-variant/70 mt-1.5 font-mono">
          {timeAgo(notification.created_at)}
        </span>
      </span>
    </button>
  );
}

/**
 * Campana de alertas del dueño. La alimentan `close_shift` (turno cerrado con
 * descuadre) y `register_cash_withdrawal` (retiro de efectivo de la caja).
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const loading = useNotificationsStore((s) => s.loading);
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);
  const fetchUnreadCount = useNotificationsStore((s) => s.fetchUnreadCount);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  // Al montar solo se pide el contador (`head: true`, sin filas): la campana está
  // en el header de todo el dashboard y traer las 30 notificaciones en cada carga
  // es una consulta que casi nadie llega a mirar. La lista se pide al abrir.
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    // Al abrir se recarga: el badge puede llevar rato en pantalla.
    if (next) fetchNotifications();
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="text-on-surface-variant hover:text-on-surface transition-colors relative p-1 rounded-lg hover:bg-surface-container-highest/50"
        aria-label={unreadCount > 0 ? `${unreadCount} notificaciones sin leer` : "Notificaciones"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <IconBell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-error border-2 border-surface-container-lowest flex items-center justify-center">
            <span className="text-[9px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          {...backdropProps(() => setOpen(false))}
        >
          <div
            className="w-full max-w-md bg-surface-container-lowest h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 border-l border-outline-variant/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <IconBell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-on-surface leading-tight">Alertas</h2>
                  <p className="text-xs text-on-surface-variant">Notificaciones del negocio</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs font-semibold text-primary hover:text-primary-dim px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    Marcar todas
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest p-2 rounded-full transition-colors"
                  aria-label="Cerrar alertas"
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/10">
              {loading && notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant">
                  <p className="text-sm">Cargando alertas…</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-on-surface-variant">
                  <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center mb-3 text-on-surface-variant/60">
                    <IconBell className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-on-surface">No tienes alertas</p>
                  <p className="text-xs text-on-surface-variant mt-1 max-w-xs">
                    Aquí verás los retiros de caja, cierres con descuadre y avisos importantes del sistema.
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationRow key={n.id} notification={n} onRead={markRead} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
