import assert from "node:assert/strict";
import { test } from "node:test";
import { bindCatalogSearchFocus } from "../lib/useCatalogSearchFocus";

function fixture(fine = true) {
  const doc = new EventTarget() as EventTarget & Record<string, unknown>;
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  let frame: (() => void) | undefined;
  let editor = false;
  let modal = false;
  let focused = 0;
  doc.visibilityState = "visible";
  doc.activeElement = { closest: () => editor ? {} : null };
  doc.querySelectorAll = () => modal ? [{ getClientRects: () => [1] }] : [];
  doc.defaultView = win;
  win.matchMedia = () => ({ matches: fine });
  win.requestAnimationFrame = (callback: () => void) => { frame = callback; return 1; };
  win.cancelAnimationFrame = () => { frame = undefined; };
  const input = {
    ownerDocument: doc, isConnected: true,
    focus: (options: unknown) => { assert.deepEqual(options, { preventScroll: true }); focused++; },
  } as unknown as HTMLInputElement;
  const cleanup = bindCatalogSearchFocus(input);
  return {
    doc, win, cleanup,
    flush: () => { const pending = frame; frame = undefined; pending?.(); },
    edit: (value: boolean) => { editor = value; },
    modal: (value: boolean) => { modal = value; },
    count: () => focused,
  };
}

test("entry and all desktop return events focus without scrolling", () => {
  const f = fixture();
  f.flush();
  for (const [target, name] of [[f.win, "focus"], [f.win, "pageshow"], [f.doc, "visibilitychange"]] as const) {
    target.dispatchEvent(new Event(name)); f.flush();
  }
  assert.equal(f.count(), 4);
  f.cleanup();
});

test("guards run when the frame executes, preserving editors, dialogs and hidden tabs", () => {
  const f = fixture();
  f.edit(true); f.flush();
  f.edit(false); f.win.dispatchEvent(new Event("focus")); f.modal(true); f.flush();
  f.modal(false); f.win.dispatchEvent(new Event("focus")); f.doc.visibilityState = "hidden"; f.flush();
  assert.equal(f.count(), 0);
  f.doc.visibilityState = "visible"; f.doc.dispatchEvent(new Event("visibilitychange")); f.flush();
  assert.equal(f.count(), 1);
  f.cleanup();
});

test("mobile focuses only on entry and cleanup cancels frames and removes listeners", () => {
  const f = fixture(false); f.flush();
  f.win.dispatchEvent(new Event("focus")); f.win.dispatchEvent(new Event("pageshow"));
  f.doc.dispatchEvent(new Event("visibilitychange")); f.flush();
  assert.equal(f.count(), 1); f.cleanup();
  const desktop = fixture(); desktop.cleanup(); desktop.flush();
  desktop.win.dispatchEvent(new Event("focus")); desktop.doc.dispatchEvent(new Event("visibilitychange"));
  desktop.win.dispatchEvent(new Event("pageshow")); desktop.flush();
  assert.equal(desktop.count(), 0);
});

test("mobile entry intent survives early focus and pageshow events", () => {
  const f = fixture(false);
  f.win.dispatchEvent(new Event("focus"));
  f.win.dispatchEvent(new Event("pageshow"));
  f.flush();
  assert.equal(f.count(), 1);
  f.cleanup();
});

test("hidden mobile entry waits for visibility, without overriding subsequent editing", () => {
  const f = fixture(false);
  f.doc.visibilityState = "hidden"; f.flush();
  assert.equal(f.count(), 0);
  f.doc.visibilityState = "visible";
  f.doc.dispatchEvent(new Event("visibilitychange")); f.flush();
  assert.equal(f.count(), 1);
  f.cleanup();

  const editing = fixture(false);
  editing.edit(true); editing.flush();
  editing.edit(false); editing.win.dispatchEvent(new Event("focus")); editing.flush();
  assert.equal(editing.count(), 0);
  editing.cleanup();
});
