import { normalizePaperWidth, type PaperWidth } from "@/lib/receipt-settings";

export const PRINT_SETTINGS_KEY = "ventex:print-settings";
type DeviceStorage = Pick<Storage, "getItem" | "setItem">;

function deviceStorage(): DeviceStorage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch { return null; }
}

/** Device-only preference. No printer identity, permissions or tenant data. */
export function readPrintSettings(storage: DeviceStorage | null = deviceStorage()) {
  if (!storage) return { paperWidth: "80mm" as PaperWidth, storageAvailable: false };
  try {
    const raw = storage.getItem(PRINT_SETTINGS_KEY);
    let value: unknown;
    try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
    const paperWidth = normalizePaperWidth(value && typeof value === "object" && "paperWidth" in value ? value.paperWidth : undefined);
    return { paperWidth, storageAvailable: true };
  } catch { return { paperWidth: "80mm" as PaperWidth, storageAvailable: false }; }
}

export function savePrintPaperWidth(paperWidth: PaperWidth, storage: DeviceStorage | null = deviceStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PRINT_SETTINGS_KEY, JSON.stringify({ paperWidth: normalizePaperWidth(paperWidth) }));
    return true;
  } catch { return false; }
}
