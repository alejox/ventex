/**
 * Conversión de fotos de producto a WebP antes de subirlas.
 *
 * Una foto de celular pesa entre 3 y 8 MB. En el mostrador, con datos móviles,
 * eso son varios segundos por producto y ancho de banda del negocio. Reducida a
 * 1200px y convertida a WebP queda en el orden de 100 KB, sin diferencia visible
 * en una grilla de POS.
 *
 * Si algo falla (un formato que el navegador no sabe decodificar, como HEIC en
 * un escritorio) se devuelve el archivo ORIGINAL: subir una foto pesada es peor
 * que no subirla, pero mucho mejor que perder la carga con un error.
 */

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 0.82;

export async function toWebp(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (file.type === "image/webp" && file.size < 300_000) return file;

  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    // Un WebP más pesado que el original no tiene sentido (pasa con imágenes
    // ya optimizadas o con logos planos en PNG).
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${name}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Safari viejo no tiene createImageBitmap con File.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
