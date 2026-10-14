import { create } from "zustand";
import { normalizePaperWidth, type PaperWidth } from "@/lib/receipt-settings";
import { readPrintSettings, savePrintPaperWidth } from "@/services/print-settings.service";

interface PrintSettingsState {
  paperWidth: PaperWidth;
  hydrated: boolean;
  storageAvailable: boolean;
  init: () => void;
  setPaperWidth: (width: PaperWidth) => void;
}

export const usePrintSettingsStore = create<PrintSettingsState>((set, get) => ({
  paperWidth: "80mm",
  hydrated: false,
  storageAvailable: true,
  init: () => {
    if (!get().hydrated) set({ ...readPrintSettings(), hydrated: true });
  },
  setPaperWidth: (width) => {
    const paperWidth = normalizePaperWidth(width);
    set({ paperWidth, storageAvailable: savePrintPaperWidth(paperWidth) });
  },
}));
