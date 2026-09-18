/**
 * Conversión de imágenes a WebP antes de subirlas a Storage.
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

/**
 * Formatos que NO se convierten, porque pasarlos por el lienzo los empeora en
 * silencio:
 *
 * - `svg+xml` es vectorial: rasterizarlo a 1200px lo deja fijo en ese tamaño y
 *   borroso en cualquier pantalla más grande. Un logo en SVG ya pesa unos pocos
 *   KB; no hay nada que ahorrar y sí mucho que perder.
 * - `gif` puede estar animado, y el lienzo solo se queda con el primer cuadro.
 *   El archivo baja de peso y la animación desaparece sin avisarle a nadie.
 */
const SIN_CONVERTIR = new Set(["image/svg+xml", "image/gif"]);

export async function toWebp(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (SIN_CONVERTIR.has(file.type)) return file;
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

/**
 * Falla temprano y en castellano si la imagen sigue pasada de peso.
 *
 * Los buckets ya tienen su propio tope y rechazan el archivo igual, pero el
 * error que devuelve Storage viene en inglés y habla de objetos y de bytes. La
 * persona que está subiendo la foto de su barbero desde el celular necesita
 * saber que la foto es muy pesada, no leer "The object exceeded the maximum
 * allowed size".
 *
 * Va DESPUÉS de convertir: casi todas las fotos de celular entran holgadas una
 * vez pasadas a WebP, así que avisar antes de intentarlo rechazaría archivos
 * que en realidad sí se podían subir.
 */
export function verificarPeso(file: File, maxBytes: number): void {
  if (file.size <= maxBytes) return;
  const mb = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;
  throw new Error(
    `La imagen pesa ${mb(file.size)} y el máximo es ${mb(maxBytes)}. ` +
      `Probá con una foto más chica o recortala antes de subirla.`,
  );
}
