import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTAGRAM_POPUP_MESSAGE_TYPE,
  instagramConnectHref,
  instagramPopupHtml,
  isInstagramConnectResult,
  popupRequested,
  readInstagramPopupMessage,
} from "../lib/instagram-popup";

const ORIGIN = "https://www.ventex.app";
const SITE = "3f2b8c1e-9a4d-4b7e-8c21-5d6f7a8b9c0d";

test("isInstagramConnectResult accepts only the known outcomes", () => {
  for (const result of ["connected", "denied", "error", "forbidden", "unconfigured"]) {
    assert.equal(isInstagramConnectResult(result), true, result);
  }
  for (const value of ["", "CONNECTED", "ok", null, undefined, 1, {}]) {
    assert.equal(isInstagramConnectResult(value), false, String(value));
  }
});

test("readInstagramPopupMessage accepts a well-formed message from the same origin", () => {
  assert.equal(
    readInstagramPopupMessage(ORIGIN, ORIGIN, { type: INSTAGRAM_POPUP_MESSAGE_TYPE, result: "connected" }),
    "connected",
  );
  assert.equal(readInstagramPopupMessage(ORIGIN, ORIGIN, { type: "ventex:instagram", result: "denied" }), "denied");
});

test("readInstagramPopupMessage rejects foreign origins, other types and unknown results", () => {
  const ok = { type: INSTAGRAM_POPUP_MESSAGE_TYPE, result: "connected" };
  assert.equal(readInstagramPopupMessage("https://evil.example", ORIGIN, ok), null);
  assert.equal(readInstagramPopupMessage("https://ventex.app", ORIGIN, ok), null);
  assert.equal(readInstagramPopupMessage("null", ORIGIN, ok), null);
  assert.equal(readInstagramPopupMessage(ORIGIN, ORIGIN, { type: "other", result: "connected" }), null);
  assert.equal(readInstagramPopupMessage(ORIGIN, ORIGIN, { type: INSTAGRAM_POPUP_MESSAGE_TYPE, result: "pwned" }), null);
  assert.equal(readInstagramPopupMessage(ORIGIN, ORIGIN, "connected"), null);
  assert.equal(readInstagramPopupMessage(ORIGIN, ORIGIN, null), null);
  assert.equal(readInstagramPopupMessage(ORIGIN, ORIGIN, [INSTAGRAM_POPUP_MESSAGE_TYPE, "connected"]), null);
});

test("popupRequested is true only for popup=1", () => {
  assert.equal(popupRequested("1"), true);
  assert.equal(popupRequested("true"), false);
  assert.equal(popupRequested("0"), false);
  assert.equal(popupRequested(null), false);
  assert.equal(popupRequested(undefined), false);
});

test("instagramConnectHref keeps the site and marks the popup flow", () => {
  const popup = new URL(instagramConnectHref(ORIGIN, SITE, true));
  assert.equal(popup.origin, ORIGIN);
  assert.equal(popup.pathname, "/api/instagram/connect");
  assert.equal(popup.searchParams.get("site"), SITE);
  assert.equal(popup.searchParams.get("popup"), "1");

  const tab = new URL(instagramConnectHref(ORIGIN, null, false));
  assert.equal(tab.searchParams.has("site"), false);
  assert.equal(tab.searchParams.has("popup"), false);
});

test("instagramPopupHtml posts the result to the exact origin and closes itself", () => {
  const html = instagramPopupHtml({ result: "connected", origin: ORIGIN, editorPath: `/dashboard/landing?site=${SITE}` });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /window\.opener/);
  assert.match(html, /postMessage\(/);
  assert.ok(html.includes(JSON.stringify(ORIGIN)), "targets the exact origin, never *");
  assert.ok(!html.includes('"*"'), "never posts to any origin");
  assert.ok(html.includes(JSON.stringify(INSTAGRAM_POPUP_MESSAGE_TYPE)));
  assert.ok(html.includes('"connected"'));
  assert.match(html, /window\.close\(\)/);
  assert.ok(!/<script[^>]+src=/i.test(html), "no external scripts");
  // Visible fallback in Spanish with a link back to the editor.
  assert.match(html, /Ya puedes cerrar esta ventana/);
  assert.ok(html.includes(`href="/dashboard/landing?site=${SITE}"`));
});

test("instagramPopupHtml escapes the link and the script payload", () => {
  const html = instagramPopupHtml({
    result: "error",
    origin: "https://a.example</script><script>alert(1)</script>",
    editorPath: '/dashboard/landing?x="><img src=x onerror=alert(1)>&y=1',
  });
  assert.ok(!html.includes("</script><script>alert(1)"), "a </script> inside the payload is neutralized");
  assert.ok(!html.includes('"><img'), "the href attribute cannot be broken out of");
  assert.ok(html.includes("&amp;y=1"));
});

test("instagramPopupHtml refuses an unknown result", () => {
  assert.throws(() =>
    instagramPopupHtml({ result: "nope" as never, origin: ORIGIN, editorPath: "/dashboard/landing" }),
  );
});
