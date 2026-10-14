/** Appearance only: monetary, tax and sale information is never configurable. */
export interface ReceiptSettings {
  showLogo: boolean;
  showBusiness: boolean;
  showContact: boolean;
  showCustomer: boolean;
  showCashier: boolean;
  showSeller: boolean;
  headerText: string;
  footerText: string;
}

export type PaperWidth = "58mm" | "80mm";
export const RECEIPT_TEXT_MAX_LENGTH = 300;

export const DEFAULT_RECEIPT_SETTINGS: Readonly<ReceiptSettings> = Object.freeze({
  showLogo: true,
  showBusiness: true,
  showContact: true,
  showCustomer: true,
  showCashier: true,
  showSeller: true,
  headerText: "",
  footerText: "",
});

/** Treat persisted JSON as untrusted; never forward unknown properties to markup. */
export function normalizeReceiptSettings(input: unknown): ReceiptSettings {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const boolean = (key: keyof ReceiptSettings): boolean =>
    typeof value[key] === "boolean" ? value[key] as boolean : true;
  const text = (key: "headerText" | "footerText"): string =>
    typeof value[key] === "string"
      ? value[key].replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, RECEIPT_TEXT_MAX_LENGTH)
      : "";
  return {
    showLogo: boolean("showLogo"),
    showBusiness: boolean("showBusiness"),
    showContact: boolean("showContact"),
    showCustomer: boolean("showCustomer"),
    showCashier: boolean("showCashier"),
    showSeller: boolean("showSeller"),
    headerText: text("headerText"),
    footerText: text("footerText"),
  };
}

export function normalizePaperWidth(value: unknown): PaperWidth {
  return value === "58mm" ? "58mm" : "80mm";
}
