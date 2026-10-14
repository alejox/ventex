/** Raw phone photos are compressed by the upload service before its size check. */
export function validateStaffPhotoFile(
  file: Pick<File, "type" | "size">,
): "empty" | "unsupported" | null {
  if (file.size === 0) return "empty";
  return ["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ? null
    : "unsupported";
}
