/** A local File is uploaded separately; only remote previews belong in payloads. */
export function productImageUrl(preview: string, hasFile: boolean): string {
  if (hasFile) return "";
  try {
    const url = new URL(preview);
    return url.protocol === "https:" || url.protocol === "http:" ? preview : "";
  } catch {
    return "";
  }
}
