import test from "node:test";
import assert from "node:assert/strict";
import { readPrintSettings, savePrintPaperWidth, PRINT_SETTINGS_KEY } from "../services/print-settings.service";
import { usePrintSettingsStore } from "../stores/print-settings.store";

function storage(value: string | null = null) {
  return { getItem: () => value, setItem: (key: string, next: string) => { assert.equal(key, PRINT_SETTINGS_KEY); value = next; } };
}

test("paper width defaults safely and normalizes corrupted device preferences", () => {
  for (const value of [null, "bad", '{}', '{"paperWidth":"100mm"}']) assert.equal(readPrintSettings(storage(value)).paperWidth, "80mm");
  assert.equal(readPrintSettings(storage('{"paperWidth":"58mm"}')).paperWidth, "58mm");
});

test("device preference round trips without storing tenant or printer credentials", () => {
  const device = storage();
  assert.equal(savePrintPaperWidth("58mm", device), true);
  assert.deepEqual(readPrintSettings(device), { paperWidth: "58mm", storageAvailable: true });
  assert.equal(savePrintPaperWidth("80mm", device), true);
  assert.equal(readPrintSettings(device).paperWidth, "80mm");
});

test("unavailable storage never blocks printing", () => {
  const blocked = { getItem: () => { throw new Error("Blocked"); }, setItem: () => { throw new Error("Blocked"); } };
  assert.deepEqual(readPrintSettings(blocked), { paperWidth: "80mm", storageAvailable: false });
  assert.equal(savePrintPaperWidth("58mm", blocked), false);
  assert.deepEqual(readPrintSettings(null), { paperWidth: "80mm", storageAvailable: false });
});

test("device store hydrates before use and retains selection when storage is unavailable", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const device = storage('{"paperWidth":"58mm"}');
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: device });
  try {
    usePrintSettingsStore.setState({ hydrated: false, paperWidth: "80mm" });
    usePrintSettingsStore.getState().init();
    assert.equal(usePrintSettingsStore.getState().hydrated, true);
    assert.equal(usePrintSettingsStore.getState().paperWidth, "58mm");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("Blocked"); } });
    usePrintSettingsStore.getState().setPaperWidth("80mm");
    assert.equal(usePrintSettingsStore.getState().paperWidth, "80mm");
    assert.equal(usePrintSettingsStore.getState().storageAvailable, false);
    usePrintSettingsStore.getState().setPaperWidth("58mm");
    usePrintSettingsStore.getState().init();
    assert.equal(usePrintSettingsStore.getState().paperWidth, "58mm");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
