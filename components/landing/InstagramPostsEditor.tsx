"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { IconTrash } from "@/app/assets/icons/DashboardIcons";
import { instagramPostUrl, MAX_INSTAGRAM_POSTS, type InstagramSource } from "@/lib/instagram";
import {
  INSTAGRAM_POPUP_CHANNEL,
  INSTAGRAM_POPUP_FEATURES,
  INSTAGRAM_POPUP_NAME,
  instagramConnectHref,
  readInstagramPopupMessage,
} from "@/lib/instagram-popup";
import { useInstagramStore } from "@/stores/instagram.store";

const INPUT = "w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary";

const RESULT_TOASTS: Record<string, { kind: "success" | "info" | "error"; text: string }> = {
  connected: { kind: "success", text: "Instagram quedó conectado. Tus publicaciones se actualizan solas cada día." },
  denied: { kind: "info", text: "Cancelaste la conexión con Instagram." },
  error: { kind: "error", text: "No se pudo conectar Instagram. Intenta de nuevo." },
  forbidden: { kind: "error", text: "Solo el dueño del negocio puede conectar Instagram." },
  unconfigured: { kind: "error", text: "La conexión con Instagram todavía no está disponible. Mientras tanto, usa enlaces manuales." },
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

const SOURCES: { id: InstagramSource; label: string }[] = [
  { id: "account", label: "Desde mi cuenta" },
  { id: "manual", label: "Enlaces manuales" },
];

/**
 * Instagram posts on the public site: either the latest posts of the connected
 * account (refreshed daily server-side) or links the owner pastes by hand.
 */
export function InstagramPostsEditor({
  siteId,
  source,
  onSourceChange,
  posts,
  onChange,
}: {
  siteId: string | null;
  source: InstagramSource;
  onSourceChange: (source: InstagramSource) => void;
  posts: string[];
  onChange: (recipe: (posts: string[]) => string[]) => void;
}) {
  const labelId = useId();
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-outline-variant/20 p-3">
      <div role="radiogroup" aria-labelledby={labelId} className="space-y-1.5">
        <span id={labelId} className="block text-xs font-bold text-on-surface-variant">
          ¿De dónde salen las publicaciones?
        </span>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-container p-1">
          {SOURCES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={source === option.id}
              onClick={() => onSourceChange(option.id)}
              className={`rounded-md px-2 py-2 text-xs font-bold transition-colors ${
                source === option.id ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {source === "account" ? <AccountPosts siteId={siteId} /> : <ManualPosts posts={posts} onChange={onChange} />}
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

function AccountPosts({ siteId }: { siteId: string | null }) {
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
          ? `Se muestran ${connection.mediaPermalinks.length} publicaciones.`
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

/**
 * Links to the Instagram posts the public site shows. Each pasted link is
 * stored already canonical, so the list shows exactly what the site renders.
 */
function ManualPosts({
  posts,
  onChange,
}: {
  posts: string[];
  onChange: (recipe: (posts: string[]) => string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const full = posts.length >= MAX_INSTAGRAM_POSTS;

  function add() {
    const url = instagramPostUrl(draft);
    if (!url) {
      setError("Ese enlace no es de una publicación de Instagram.");
      return;
    }
    if (posts.includes(url)) {
      setError("Esa publicación ya está en la lista.");
      return;
    }
    onChange((current) => (current.includes(url) ? current : [...current, url].slice(0, MAX_INSTAGRAM_POSTS)));
    setDraft("");
    setError(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-on-surface-variant">
        En Instagram, abre la publicación, toca <strong>···</strong> y elige <strong>Copiar enlace</strong>. Luego pégalo aquí.
      </p>
      {posts.length ? (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li key={post} className="flex items-center gap-2 rounded-lg bg-surface-container px-3 py-1">
              <a href={post} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-on-surface hover:underline">
                {post.replace("https://www.", "")}
              </a>
              <IconButton
                aria-label="Quitar publicación"
                icon={<IconTrash width={16} height={16} />}
                size="sm"
                onClick={() => onChange((current) => current.filter((item) => item !== post))}
                className="text-error"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {full ? (
        <p className="text-xs text-on-surface-variant">Ya tienes {MAX_INSTAGRAM_POSTS} publicaciones, el máximo. Quita una para agregar otra.</p>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="block text-xs font-bold text-on-surface-variant">
            Enlace de la publicación
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              placeholder="https://www.instagram.com/p/…"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={INPUT}
            />
            <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
              Agregar
            </Button>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-xs font-semibold text-error">
              {error}
            </p>
          ) : (
            <p className="text-xs text-on-surface-variant">Puedes mostrar hasta {MAX_INSTAGRAM_POSTS} publicaciones.</p>
          )}
        </div>
      )}
    </div>
  );
}
