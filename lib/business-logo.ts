export const BUSINESS_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const SUPPORTED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export type BusinessLogoFileError = "unsupported" | "empty" | "too_large";

export function validateBusinessLogoFile(file: Pick<File, "type" | "size">): BusinessLogoFileError | null {
  if (!SUPPORTED_LOGO_TYPES.has(file.type)) return "unsupported";
  if (file.size <= 0) return "empty";
  if (file.size > BUSINESS_LOGO_MAX_BYTES) return "too_large";
  return null;
}
