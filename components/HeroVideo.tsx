"use client";

import { useSyncExternalStore } from "react";

/**
 * Video de fondo del hero.
 *
 * El póster se pinta SIEMPRE y el `src` del <video> solo se monta cuando el
 * visitante realmente va a ver la animación. Sin eso, el clip de 1.9 MB se
 * descarga incluso para quien pidió que nada se mueva o está contando megas,
 * que es justo a quien más le duele.
 *
 * Dos condiciones lo apagan, y son distintas:
 *  - `prefers-reduced-motion: reduce` es una preferencia de accesibilidad: hay
 *    gente a la que el movimiento en bucle le provoca mareo. No es un "nice to
 *    have" que se pueda negociar contra lo bonito que queda.
 *  - `saveData` es el modo ahorro de datos del navegador. En un plan prepago,
 *    1.9 MB de decoración es plata del visitante.
 *
 * El estado se lee con `useSyncExternalStore`, no con `useEffect` + `setState`:
 * el proyecto tiene activa `react-hooks/set-state-in-effect` y este es el mismo
 * patrón que ya usa ThemeToggle para el tema.
 */

const suscribirMedia = (consulta: string) => (avisar: () => void) => {
  const mql = window.matchMedia(consulta);
  mql.addEventListener("change", avisar);
  return () => mql.removeEventListener("change", avisar);
};

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

const suscribirReduccion = suscribirMedia(REDUCE_MOTION);
const leerReduccion = () => window.matchMedia(REDUCE_MOTION).matches;

// En el servidor no hay forma de saber la preferencia. Se asume "reducido" para
// que el HTML inicial nunca traiga el <source>: si resulta que el visitante sí
// quiere movimiento, el video entra al hidratar. Al revés — mandarlo siempre y
// quitarlo después — ya habría gastado la descarga.
const leerReduccionServidor = () => true;

const suscribirNada = () => () => {};
const hidratado = () => true;
const noHidratado = () => false;

type Props = {
  /** Ruta del mp4 (H.264 8-bit yuv420p, o no lo decodifica por hardware). */
  src: string;
  /** Imagen que se ve antes del primer frame y cuando el video no corre. */
  poster: string;
  className?: string;
};

export function HeroVideo({ src, poster, className }: Props) {
  const prefiereQuieto = useSyncExternalStore(
    suscribirReduccion,
    leerReduccion,
    leerReduccionServidor,
  );
  const yaHidrato = useSyncExternalStore(suscribirNada, hidratado, noHidratado);

  // `saveData` no es estándar en todos los navegadores: si no existe, se ignora.
  const ahorroDatos =
    yaHidrato &&
    Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData,
    );

  const reproducir = yaHidrato && !prefiereQuieto && !ahorroDatos;

  if (!reproducir) {
    // El póster es el mismo archivo que consume el atributo `poster` del
    // <video>: pasarlo por next/image generaría una segunda URL para el mismo
    // pixel y el navegador se bajaría las dos.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" aria-hidden className={className} />;
  }

  return (
    <video
      key={src}
      className={className}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      // Decorativo: lo que cuenta la escena ya lo dice el copy del hero.
      aria-hidden
      tabIndex={-1}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
