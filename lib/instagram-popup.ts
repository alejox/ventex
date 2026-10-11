import type { InstagramConnectResult } from "@/services/instagram-protocol";

/**
 * "Conectar Instagram" in a popup: the PURE parts (no DOM, no network), shared
 * by the editor, the connect/callback routes and `tests/instagram-popup.test.ts`.
 *
 * The callback page tells the editor how the round trip ended with
 * `postMessage` to the EXACT site origin, and the editor only trusts messages
 * from its own origin with a known result. Same-tab navigation stays as the
 * fallback when the browser blocks the popup.
 */

export const INSTAGRAM_POPUP_MESSAGE_TYPE = "ventex:instagram";
/** Window name: a second click reuses the same popup instead of opening another. */
export const INSTAGRAM_POPUP_NAME = "ventex-instagram";
export const INSTAGRAM_POPUP_FEATURES = "popup,width=520,height=720";
/**
 * Same-origin backup channel. Instagram's pages may send a
 * Cross-Origin-Opener-Policy that severs `window.opener` for the rest of the
 * popup's life; a BroadcastChannel does not depend on the opener.
 */
export const INSTAGRAM_POPUP_CHANNEL = "ventex-instagram";
/** Remembers, between connect and callback, that the flow runs in a popup. */
export const INSTAGRAM_POPUP_COOKIE = "ig_oauth_popup";

/** Mirrors `INSTAGRAM_CONNECT_PATH` in `services/instagram.service.ts` (kept I/O-free here). */
const CONNECT_PATH = "/api/instagram/connect";

const RESULTS: readonly InstagramConnectResult[] = ["connected", "denied", "error", "forbidden", "unconfigured"];

export function isInstagramConnectResult(value: unknown): value is InstagramConnectResult {
  return typeof value === "string" && (RESULTS as readonly string[]).includes(value);
}

/** `?popup=1` on the connect route; anything else keeps the same-tab flow. */
export function popupRequested(value: string | null | undefined): boolean {
  return value === "1";
}

export function instagramConnectHref(origin: string, siteId: string | null, popup: boolean): string {
  const url = new URL(CONNECT_PATH, origin);
  if (siteId) url.searchParams.set("site", siteId);
  if (popup) url.searchParams.set("popup", "1");
  return url.toString();
}

/**
 * The result carried by a `message` event, or null when it must be ignored:
 * another origin, another message type, or an unknown result.
 */
export function readInstagramPopupMessage(
  origin: string,
  expectedOrigin: string,
  data: unknown,
): InstagramConnectResult | null {
  if (origin !== expectedOrigin) return null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== INSTAGRAM_POPUP_MESSAGE_TYPE) return null;
  return isInstagramConnectResult(record.result) ? record.result : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON safe to inline in a <script>: no `</script>`, no line terminators JS chokes on. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const FALLBACK_TEXT: Record<InstagramConnectResult, string> = {
  connected: "Instagram quedó conectado.",
  denied: "Cancelaste la conexión con Instagram.",
  error: "No se pudo conectar Instagram.",
  forbidden: "Solo el dueño del negocio puede conectar Instagram.",
  unconfigured: "La conexión con Instagram todavía no está disponible.",
};

export interface InstagramPopupPage {
  result: InstagramConnectResult;
  /** The exact site origin the editor runs on; `postMessage` never targets `*`. */
  origin: string;
  /** Same-origin path back to the editor, for when the window cannot close. */
  editorPath: string;
}

/**
 * The page the callback renders inside the popup. It carries only the outcome:
 * never a token, a code or a state.
 */
export function instagramPopupHtml({ result, origin, editorPath }: InstagramPopupPage): string {
  if (!isInstagramConnectResult(result)) throw new Error("unknown instagram connect result");
  const message = { type: INSTAGRAM_POPUP_MESSAGE_TYPE, result };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Instagram</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px 16px;text-align:center;color:#1f1d2b;background:#fff}a{color:#5b4fd6;font-weight:700}@media (prefers-color-scheme:dark){body{color:#e6e3f5;background:#14131c}a{color:#b4abff}}</style>
</head>
<body>
<p>${escapeHtml(FALLBACK_TEXT[result])}</p>
<p>Ya puedes cerrar esta ventana.</p>
<p><a href="${escapeHtml(editorPath)}">Volver al editor de tu página</a></p>
<script>
(function () {
  var message = ${scriptJson(message)};
  try { if (window.opener) window.opener.postMessage(message, ${scriptJson(origin)}); } catch (e) {}
  try { var channel = new BroadcastChannel(${scriptJson(INSTAGRAM_POPUP_CHANNEL)}); channel.postMessage(message); channel.close(); } catch (e) {}
  window.close();
})();
</script>
</body>
</html>
`;
}
