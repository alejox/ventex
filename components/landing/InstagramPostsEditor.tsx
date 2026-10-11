"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  INSTAGRAM_COUNTS,
  MAX_INSTAGRAM_POSTS,
  type InstagramCount,
  type InstagramLayout,
} from "@/lib/instagram";
import {
  INSTAGRAM_POPUP_CHANNEL,
  INSTAGRAM_POPUP_FEATURES,
  INSTAGRAM_POPUP_NAME,
  instagramConnectHref,
  readInstagramPopupMessage,
} from "@/lib/instagram-popup";
import { useInstagramStore } from "@/stores/instagram.store";

const RESULT_TOASTS: Record<string, { kind: "success" | "info" | "error"; text: string }> = {
  connected: { kind: "success", text: "Instagram quedó conectado. Tus publicaciones se actualizan solas cada día." },
  denied: { kind: "info", text: "Cancelaste la conexión con Instagram." },
  error: { kind: "error", text: "No se pudo conectar Instagram. Intenta de nuevo." },
  forbidden: { kind: "error", text: "Solo el dueño del negocio puede conectar Instagram." },
  unconfigured: { kind: "error", text: "La conexión con Instagram todavía no está disponible. Intenta más tarde." },
};

/**
 * Toast for the result of the OAuth round trip (`?instagram=` in the same-tab
 * fallback, or the popup's message). Unknown values are ignored.
 */
export function showInstagramResult(result: string) {
  const message = RESULT_TOASTS[result];
  if (!message) return;
  // A fixed id: React may run the effect twice in development; one toast.
  toast[message.kind](message.text, { id: "instagram-connect-result" });
}

const LAYOUTS: { id: InstagramLayout; label: string }[] = [
  { id: "grid", label: "Cuadrícula" },
  { id: "carousel", label: "Carrusel" },
];

const COUNTS = INSTAGRAM_COUNTS.map((count) => ({ id: count, label: String(count) }));

/** Segmented single-choice control (radiogroup), same look as the rest of the editor. */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="space-y-1.5">
      <span id={labelId} className="block text-xs font-bold text-on-surface-variant">
        {label}
      </span>
      <div className={`grid gap-1 rounded-lg bg-surface-container p-1 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={`rounded-md px-2 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink ${
              value === option.id ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Instagram posts on the public site: the latest posts of the connected
 * account (refreshed daily server-side), shown as a grid or a carousel.
 */
export function InstagramPostsEditor({
  siteId,
  layout,
  count,
  onLayoutChange,
  onCountChange,
}: {
  siteId: string | null;
  layout: InstagramLayout;
  count: InstagramCount;
  onLayoutChange: (layout: InstagramLayout) => void;
  onCountChange: (count: InstagramCount) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-outline-variant/20 p-3">
      <AccountPosts siteId={siteId} count={count} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented label="Diseño" options={LAYOUTS} value={layout} onChange={onLayoutChange} />
        <Segmented label="Cantidad" options={COUNTS} value={count} onChange={onCountChange} />
      </div>
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/** How often to check whether the owner closed the popup by hand. */
const POPUP_CLOSED_POLL_MS = 1000;

/**
 * "Conectar Instagram" in a popup so the owner never leaves the editor (and
 * nothing unsaved is lost). The callback page reports the outcome by
 * `postMessage` to this exact origin (plus a same-origin BroadcastChannel, in
 * case Instagram severed `window.opener`). A blocked popup falls back to the
 * same-tab flow, whose `?instagram=` result `LandingEditor` already handles.
 */
function useInstagramPopup(siteId: string | null) {
  const fetchConnection = useInstagramStore((s) => s.fetchConnection);
  const pollRef = useRef<number | null>(null);
  const pendingRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => {
    const origin = window.location.origin;
    function handle(eventOrigin: string, data: unknown) {
      const result = readInstagramPopupMessage(eventOrigin, origin, data);
      // Both channels may deliver the same outcome: act on the first one only.
      if (!result || !pendingRef.current) return;
      pendingRef.current = false;
      stopPolling();
      showInstagramResult(result);
      void fetchConnection();
    }
    const onMessage = (event: MessageEvent) => handle(event.origin, event.data);
    window.addEventListener("message", onMessage);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(INSTAGRAM_POPUP_CHANNEL);
      // Same-origin by construction: a BroadcastChannel never crosses origins.
      channel.onmessage = (event: MessageEvent) => handle(origin, event.data);
    }
    return () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
      stopPolling();
    };
  }, [fetchConnection, stopPolling]);

  return useCallback(() => {
    const popup = window.open(
      instagramConnectHref(window.location.origin, siteId, true),
      INSTAGRAM_POPUP_NAME,
      INSTAGRAM_POPUP_FEATURES,
    );
    if (!popup) {
      // Blocked: the classic same-tab round trip (the editor warns about unsaved changes).
      window.location.assign(instagramConnectHref(window.location.origin, siteId, false));
      return;
    }
    popup.focus();
    pendingRef.current = true;
    stopPolling();
    pollRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      // Closed by hand (or no message arrived): refresh once and stop. A late
      // message still lands, since the listeners outlive the poll.
      stopPolling();
      void fetchConnection();
    }, POPUP_CLOSED_POLL_MS);
  }, [fetchConnection, siteId, stopPolling]);
}

function AccountPosts({ siteId, count }: { siteId: string | null; count: InstagramCount }) {
  const connection = useInstagramStore((s) => s.connection);
  const loading = useInstagramStore((s) => s.loading);
  const disconnecting = useInstagramStore((s) => s.disconnecting);
  const loadError = useInstagramStore((s) => s.error);
  const disconnect = useInstagramStore((s) => s.disconnect);
  const { confirm, dialog } = useConfirm();
  const connect = useInstagramPopup(siteId);

  async function askDisconnect() {
    const ok = await confirm({
      title: "¿Desconectar Instagram?",
      description: "Tu página deja de mostrar las publicaciones de la cuenta. Puedes volver a conectarla cuando quieras.",
      confirmLabel: "Desconectar",
      tone: "danger",
    });
    if (!ok) return;
    if (await disconnect()) toast.success("Instagram quedó desconectado.");
    else toast.error(useInstagramStore.getState().error ?? "No se pudo desconectar Instagram.");
  }

  if (loading) {
    return <p className="text-xs text-on-surface-variant">Revisando la conexión con Instagram…</p>;
  }

  if (!connection) {
    return (
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-on-surface-variant">
          Conecta tu cuenta y tus últimas {MAX_INSTAGRAM_POSTS} publicaciones aparecen solas en la página. La cuenta tiene que ser
          {" "}<strong>profesional</strong> (Empresa o Creador).
        </p>
        <Button variant="secondary" onClick={connect}>
          Conectar Instagram
        </Button>
        <p className="text-xs text-on-surface-variant">Se abre una ventana de Instagram; tu editor queda abierto aquí.</p>
        {loadError ? <p role="alert" className="text-xs font-semibold text-error">{loadError}</p> : null}
      </div>
    );
  }

  const syncedAt = formatDate(connection.mediaSyncedAt);
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-on-surface">
        {connection.username ? `@${connection.username} conectado` : "Cuenta de Instagram conectada"}
      </p>
      <p className="text-xs text-on-surface-variant">
        {syncedAt ? `Última actualización: ${syncedAt}.` : "Las publicaciones se traen en la próxima actualización."}
        {" "}{connection.mediaPermalinks.length
          ? `Se muestran ${Math.min(count, connection.mediaPermalinks.length)} publicaciones.`
          : "Todavía no hay publicaciones para mostrar."}
      </p>
      {connection.lastError ? (
        <p role="alert" className="text-xs font-semibold text-error">{connection.lastError}</p>
      ) : null}
      <Button variant="ghost" size="sm" onClick={askDisconnect} loading={disconnecting} className="text-error">
        Desconectar
      </Button>
      {dialog}
    </div>
  );
}
