"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { LogoVertical } from "@/components/Logo";

/**
 * Panel decorativo de las pantallas de acceso.
 *
 * Los tres puntitos de abajo ya estaban en el diseño, pero eran tres divs
 * quietos: prometían un carrusel que nunca existió. Ahora son los indicadores
 * reales, uno por vista, y se puede hacer clic.
 *
 * Es un componente cliente porque necesita estado. El layout que lo contiene
 * sigue siendo de servidor: lo único que se manda al navegador es esto.
 */

/**
 * Cada vista trae su foto Y su mensaje. Van juntos a propósito: la copia habla
 * de lo que se ve en la imagen, así que separarlos sería la forma más rápida de
 * terminar con un texto de inventario sobre una foto de mostrador.
 *
 * `objectPosition` es por foto. Las tres son APAISADAS y el panel es angosto, así
 * que `object-cover` recorta a lo ancho —el alto entra justo y el eje vertical
 * no hace nada—: el porcentaje dice qué franja horizontal sobrevive, y cada
 * imagen tiene su sujeto en otro lado.
 */
const VISTAS = [
  {
    imagen: "/auth/pos-mostrador.webp",
    // 40%: corre a la persona hasta el borde izquierdo, donde queda visible
    // pero FUERA de la caja del titular. Centrada, el texto le caía en la cara.
    objectPosition: "40% 50%",
    titulo: "Optimiza tu futuro hoy mismo.",
    copia:
      "Accede a la plataforma líder en gestión de activos digitales. Experimenta la potencia del ecosistema Ventex con total seguridad.",
  },
  {
    imagen: "/auth/pos-terminal.webp",
    // 32%: deja el equipo y la impresora en el tercio inferior izquierdo y el
    // ventanal a la derecha, que es la zona tranquila donde cae la copia.
    objectPosition: "32% 50%",
    titulo: "Tu negocio, en una sola pantalla.",
    copia:
      "Punto de venta, inventario y caja trabajando juntos: cobras, el stock se descuenta solo y el turno cierra cuadrado.",
  },
  {
    imagen: "/auth/pos-lavadero.webp",
    // 45%: el equipo queda abajo a la izquierda y el lavado a la derecha, con
    // la copia sobre el cielo, que es la única zona lisa de esta foto.
    objectPosition: "45% 50%",
    // Corto a propósito: con el texto largo el titular se iba a TRES líneas
    // mientras los otros dos entran en dos, y el salto se notaba al rotar.
    titulo: "Hecho para tu rubro.",
    copia:
      "Tienda, salón, lavadero o servicios: Ventex arma el panel con los módulos que tu negocio usa y esconde los que no.",
  },
] as const;

/** Cada cuánto pasa de vista. Siete segundos alcanzan para leer el párrafo. */
const INTERVALO_MS = 7000;

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";
const suscribirReduccion = (avisar: () => void) => {
  const mql = window.matchMedia(REDUCE_MOTION);
  mql.addEventListener("change", avisar);
  return () => mql.removeEventListener("change", avisar);
};
const leerReduccion = () => window.matchMedia(REDUCE_MOTION).matches;
// En el servidor no se puede saber la preferencia. Se asume "reducido" para que
// el primer render nunca arranque el giro; si la persona sí quiere movimiento,
// empieza al hidratar. Al revés, ya habría movido la pantalla una vez.
const leerReduccionServidor = () => true;

/**
 * Las MISMAS caras que los testimonios de la landing.
 *
 * Antes eran iniciales blancas sobre degradados de la marca, y ese cian
 * (`#0fdff3`) daba 1.67:1 contra el blanco — texto ilegible en la pantalla de
 * acceso. Con fotos no queda texto que leer, así que el problema desaparece de
 * raíz en vez de taparse subiéndole el contraste al degradado.
 *
 * Son archivos LOCALES ya versionados, no retratos traídos de un servicio
 * externo: eso último habría metido una petición a otro origen en la pantalla
 * más crítica de la app, rota sin conexión porque el service worker no cachea
 * fuera del dominio.
 *
 * Van con `aria-hidden` igual que antes: el dato lo dice el texto de al lado, y
 * anunciar tres fotos decorativas antes del formulario solo estorba.
 */
const ACTIVE_USERS = [
  { src: "/landing/fotos/avatar-mariana.webp" },
  { src: "/landing/fotos/avatar-diego.webp" },
  { src: "/landing/fotos/avatar-valentina.webp" },
];

export function AuthAside() {
  const [actual, setActual] = useState(0);
  const [detenido, setDetenido] = useState(false);
  const prefiereQuieto = useSyncExternalStore(
    suscribirReduccion,
    leerReduccion,
    leerReduccionServidor,
  );

  /**
   * No gira para quien pidió que nada se mueva, ni mientras el puntero o el
   * foco están encima.
   *
   * Lo de detenerse no es un detalle: un contenido que se mueve solo durante
   * más de cinco segundos necesita una forma de pararlo (WCAG 2.2.2), y acá hay
   * dos —quedarse encima o tocar un punto—. Sin eso, alguien que lee despacio
   * pierde el párrafo a mitad de camino.
   */
  useEffect(() => {
    if (prefiereQuieto || detenido) return;
    const id = setInterval(() => setActual((i) => (i + 1) % VISTAS.length), INTERVALO_MS);
    return () => clearInterval(id);
  }, [prefiereQuieto, detenido]);

  return (
    <div
      className="auth-aside hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden isolate"
      onMouseEnter={() => setDetenido(true)}
      onMouseLeave={() => setDetenido(false)}
      onFocusCapture={() => setDetenido(true)}
      onBlurCapture={() => setDetenido(false)}
    >
      {/*
        * Las fotos se apilan y se cruzan por opacidad en vez de montarse y
        * desmontarse: cambiar el `src` de una sola haría que la siguiente se
        * descargue recién al llegarle el turno, y se vería el hueco.
        *
        * `alt=""` porque son decoración: lo que dicen ya está escrito al lado, y
        * describirlas solo agregaría ruido en la pantalla de acceso.
        *
        * Sin `priority` y con `sizes` de 1px por debajo de lg: el panel es
        * `hidden` en móvil, y entrar desde el teléfono es el caso más frecuente.
        * Bajar 160 KB de decoración que nadie va a ver ahí sería cobrarle a
        * quien menos margen tiene.
        */}
      {VISTAS.map((vista, i) => (
        <Image
          key={vista.imagen}
          src={vista.imagen}
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 1px"
          className={`auth-media -z-20 object-cover transition-opacity duration-700 ${
            i === actual ? "opacity-100" : "opacity-0"
          }`}
          style={{ objectPosition: vista.objectPosition }}
        />
      ))}
      <div className="auth-scrim absolute inset-0 -z-10" aria-hidden="true" />

      <div className="flex items-center justify-center flex-1 z-10">
        <div className="max-w-md space-y-6 text-center flex flex-col items-center">
          <LogoVertical className="w-[320px] h-[180px] mb-6" />

          {/*
            * `aria-live="polite"` y no `assertive`: el texto cambia solo, y
            * quien está tecleando la contraseña no tiene por qué ser
            * interrumpido por una frase decorativa.
            */}
          <div aria-live="polite" aria-atomic="true" className="space-y-6">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-on-surface leading-tight">
              {VISTAS[actual].titulo}
            </h1>
            <p className="text-on-surface-variant text-base lg:text-lg">{VISTAS[actual].copia}</p>
          </div>

          {/* Prueba social. Ver ACTIVE_USERS: son las mismas caras que los
              testimonios de la landing, servidas desde nuestro propio dominio. */}
          <div className="flex items-center justify-center gap-4 mt-8 pt-4">
            <div className="flex -space-x-3">
              {ACTIVE_USERS.map((user) => (
                <Image
                  key={user.src}
                  src={user.src}
                  alt=""
                  aria-hidden="true"
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full border-2 border-surface-container-low object-cover shadow-sm"
                />
              ))}
              <div className="w-10 h-10 rounded-full border-2 border-surface-container-low shadow-sm bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-on-surface-variant">
                +15k
              </div>
            </div>
            <span className="text-sm font-medium text-on-surface-variant">~15k usuarios activos</span>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div className="flex items-center text-on-surface-variant z-10">
        {/*
          * Botones de verdad, no divs: se llega con Tab y se activan con Enter.
          * Un punto que cambia la vista y no se puede enfocar es un control que
          * existe solo para el mouse.
          *
          * El área táctil va a 44px con padding mientras el punto sigue de 8px:
          * agrandar el círculo arruinaría el diseño, y un blanco de 8px es
          * imposible de acertar con precisión motriz reducida.
          */}
        <div className="flex" role="tablist" aria-label="Vistas del panel">
          {VISTAS.map((vista, i) => (
            <button
              key={vista.imagen}
              type="button"
              role="tab"
              aria-selected={i === actual}
              aria-label={`Vista ${i + 1}: ${vista.titulo}`}
              onClick={() => setActual(i)}
              className="grid h-11 w-8 place-items-center"
            >
              <span
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === actual ? "bg-primary" : "bg-surface-bright"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
