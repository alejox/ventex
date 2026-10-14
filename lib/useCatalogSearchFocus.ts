"use client";

import { useEffect, useState } from "react";

const EDITOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"]';
// The barcode scanner is a custom full-screen overlay, not a native dialog.
const MODAL = 'dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog), [aria-modal="true"]:not(dialog), .fixed.inset-0.z-\\[300\\]';

export function bindCatalogSearchFocus(input: HTMLInputElement) {
  const doc = input.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};
  let frame: number | undefined;
  let initialPending = true;
  const schedule = () => {
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      frame = undefined;
      if (!input.isConnected || doc.visibilityState !== "visible") return;
      if (!initialPending && !win.matchMedia("(pointer: fine)").matches) return;
      // A visible attempt consumes entry intent even if editing or a modal wins.
      initialPending = false;
      if (doc.activeElement?.closest(EDITOR)) return;
      if (Array.from(doc.querySelectorAll(MODAL)).some((modal) => modal.getClientRects().length > 0)) return;
      input.focus({ preventScroll: true });
    });
  };
  const restore = () => schedule();
  schedule();
  win.addEventListener("focus", restore);
  win.addEventListener("pageshow", restore);
  doc.addEventListener("visibilitychange", restore);
  return () => {
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    win.removeEventListener("focus", restore);
    win.removeEventListener("pageshow", restore);
    doc.removeEventListener("visibilitychange", restore);
  };
}

/** Callback ref also handles an input that mounts after loading or Suspense. */
export function useCatalogSearchFocus() {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  useEffect(() => {
    if (input) return bindCatalogSearchFocus(input);
  }, [input]);
  return setInput;
}
