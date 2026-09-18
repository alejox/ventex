import Image from "next/image";

/**
 * Captura de producto que cambia con el tema.
 *
 * El intercambio se hace con CSS, NO leyendo el tema en JavaScript, y
 * la razón es el orden de arranque: el tema lo aplica un script síncrono en
 * `app/layout.tsx` ANTES de hidratar, así que el servidor no puede saber cuál
 * toca. Si esto renderizara una sola imagen elegida en JS, el HTML del servidor
 * traería la del tema equivocado para medio mundo y la corrección se vería como
 * un parpadeo al hidratar — justo lo que el script inline existe para evitar.
 * Con CSS, la clase ya está puesta en <html> cuando el navegador pinta el
 * primer frame, y nunca se ve la imagen que no va.
 *
 * La regla viaja ACÁ, en un <style> del propio componente, y no en globals.css.
 * Dos razones:
 *
 *  - No puede usar la variante `dark:` de Tailwind. Sin `@custom-variant`, en v4
 *    `dark:` compila a `@media (prefers-color-scheme: dark)`: sigue al SISTEMA
 *    OPERATIVO, no al toggle. Con el sistema en oscuro, la captura clara quedaba
 *    oculta incluso en tema claro.
 *  - Una regla suelta en globals.css es una dependencia invisible: cualquiera la
 *    borra por huérfana y este componente deja de funcionar sin que nada avise.
 *    Acá vive al lado de las clases que la usan.
 *
 * `precedence` hace que React la ice al <head> y la deduplique por `href`, así
 * que aunque haya cuatro ThemedShot en la página el CSS sale una sola vez.
 *
 * El costo es que el navegador se baja las dos. Se acepta a propósito: pasadas
 * por next/image son unas decenas de KB cada una al tamaño en que se muestran,
 * y la alternativa (elegir en cliente) cambia bytes por parpadeo, que es peor.
 */
// Los mismos selectores que usa el resto del tema (ver app/globals.css):
// el script síncrono de app/layout.tsx pone `data-theme` Y la clase `dark`.
const REGLA = `
.shot-light{display:block}
.shot-dark{display:none}
:root[data-theme="dark"] .shot-light,.dark .shot-light{display:none}
:root[data-theme="dark"] .shot-dark,.dark .shot-dark{display:block}
`;

type Props = {
  /** Captura del tema oscuro. */
  dark: string;
  /** Captura del tema claro. Sin ella se usa la oscura en ambos temas. */
  light?: string;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
};

export function ThemedShot({
  dark,
  light,
  alt,
  width = 1440,
  height = 900,
  sizes,
  className = "w-full h-auto",
  priority = false,
}: Props) {
  // Sin variante clara no hay nada que intercambiar: una sola imagen, y así el
  // alt no se duplica para quien usa lector de pantalla.
  if (!light) {
    return (
      <Image
        src={dark}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={className}
        priority={priority}
      />
    );
  }

  return (
    <>
      <style href="themed-shot" precedence="default">{REGLA}</style>
      <Image
        src={light}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={`${className} shot-light`}
        priority={priority}
      />
      {/* Las dos llevan el MISMO alt, y no se duplica: la que no toca queda en
          `display:none`, que la saca del árbol de accesibilidad, así que en
          cada tema hay exactamente una anunciable. Marcar una con `aria-hidden`
          sería peor — en su tema dejaría a la visible sin alt. */}
      <Image
        src={dark}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={`${className} shot-dark`}
        priority={priority}
      />
    </>
  );
}
