/**
 * Decide si una imagen tiene que saltarse el optimizador de `next/image`.
 *
 * El problema que resuelve: `next/image` VALIDA el hostname contra
 * `images.remotePatterns` y, si no coincide, LANZA — no degrada la imagen,
 * tumba el render entero. En una página pública eso es un HTTP 500: el
 * micrositio de un negocio se cayó para todos sus visitantes porque UN producto
 * tenía la foto en `images.openfoodfacts.org`, que llega sola desde la búsqueda
 * por código de barras.
 *
 * Por qué no se agrega ese host a `remotePatterns`: el catálogo devuelve el
 * dominio que se le ocurra, así que el próximo proveedor vuelve a tirar la
 * página. Y un patrón comodín (`hostname: "**"`) convierte a `/_next/image` en
 * un proxy abierto: cualquiera puede hacer pasar imágenes de terceros por
 * nuestro servidor. La doc de Next es explícita en que `remotePatterns` existe
 * justamente para eso.
 *
 * `unoptimized` es la salida buena, y no por descarte: en el código de Next,
 * `generateImgAttrs` corta apenas ve la bandera y NO llega a llamar al loader,
 * que es donde vive la validación. O sea que la foto se muestra tal cual, sin
 * exponer el optimizador y sin que el host importe.
 *
 * Se aplica SOLO a lo ajeno: lo que está en nuestro Storage sigue pasando por
 * el optimizador, que es donde el AVIF y el redimensionado valen la pena.
 */

/**
 * Se resuelve una sola vez y en la primera llamada, no al importar: un
 * `NEXT_PUBLIC_SUPABASE_URL` mal escrito haría lanzar a `new URL` durante la
 * carga del módulo, y eso tumba la app entera en vez de degradar una imagen.
 */
let hostPropio: string | null | undefined;

function nuestroHost(): string | null {
  if (hostPropio === undefined) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      hostPropio = url ? new URL(url).hostname : null;
    } catch {
      hostPropio = null;
    }
  }
  return hostPropio;
}

export function esImagenAjena(src: string | null | undefined): boolean {
  if (!src) return false;
  // Las rutas relativas son nuestras: las sirve el mismo dominio.
  if (src.startsWith("/")) return false;

  let host: string;
  try {
    host = new URL(src).hostname;
  } catch {
    // Una URL que no parsea también revienta `next/image` (con otro error).
    // Tratarla como ajena la saca del optimizador y deja que falle, como mucho,
    // una sola imagen rota en vez de la página entera.
    return true;
  }
  return host !== nuestroHost();
}
