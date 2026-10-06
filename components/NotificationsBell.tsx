"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell } from "@/app/assets/icons/DashboardIcons";
import { useNotificationsStore } from "@/stores/notifications.store";
import type { AppNotification } from "@/services/notifications.service";
import { notificationDestination } from "@/services/notifications.service";
import { backdropProps } from "@/components/modal";
import { HEADER_ICON_BUTTON } from "@/components/ui/HeaderIconButton";

const SEVERITY_DOT: Record<string, string> = {
  error: "bg-error",
  warning: "bg-warning",
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
  onActivate,
}: {
  notification: AppNotification;
  onActivate: (notification: AppNotification) => void;
}) {
  const unread = !notification.read_at;
  const destination = notificationDestination(notification);
  return (
    <button
      type="button"
      onClick={() => onActivate(notification)}
      className={`w-full text-left px-5 py-3.5 flex gap-3.5 transition-colors hover:bg-surface-container-highest/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-ink ${
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
        {destination && <span className="mt-1.5 block text-xs font-semibold text-primary-ink">Ver reserva en Calendario →</span>}
        <span className="block text-[11px] text-on-surface-variant mt-1.5 font-mono">
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
  const router = useRouter();
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

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Cajón como diálogo modal (A9): el foco entra al abrir (al botón de cerrar,
  // que siempre existe), Tab queda atrapado adentro, Escape cierra y el foco
  // vuelve a la campana.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    // Al abrir se recarga: el badge puede llevar rato en pantalla.
    if (next) fetchNotifications();
  };

  function activateNotification(notification: AppNotification) {
    if (!notification.read_at) void markRead(notification.id);
    const destination = notificationDestination(notification);
    if (destination) {
      setOpen(false);
      router.push(destination);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={HEADER_ICON_BUTTON}
        aria-label={unreadCount > 0 ? `${unreadCount} notificaciones sin leer` : "Notificaciones"}
        title="Notificaciones"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <IconBell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-error border-2 border-surface-container-lowest flex items-center justify-center"
          >
            <span className="text-[11px] font-bold text-on-error leading-none">
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
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md bg-surface-container-lowest h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 border-l border-divider pt-[env(safe-area-inset-top)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary-ink flex items-center justify-center">
                  <IconBell className="w-5 h-5" />
                </div>
                <div>
                  <h2 id={titleId} className="text-lg font-bold text-on-surface leading-tight">Alertas</h2>
                  <p className="text-xs text-on-surface-variant">Notificaciones del negocio</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="min-h-10 text-xs font-semibold text-primary-ink px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
                  >
                    Marcar todas
                  </button>
                )}
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
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
                  <NotificationRow key={n.id} notification={n} onActivate={activateNotification} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
