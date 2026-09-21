"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Un `<iframe>` con su propio viewport donde se monta el árbol de React.
 *
 * Existe por una sola razón: **las media queries miran el viewport, no el
 * contenedor.** La vista previa mostraba el sitio dentro de un `<div>` de 390px
 * con `zoom`, así que el móvil se veía como el escritorio achicado — las reglas
 * `@media (max-width: 1023px)` de las plantillas nunca se activaban, porque la
 * ventana del dashboard seguía midiendo lo que mide. Lo que el dueño elegía a
 * partir de esa previsualización no era lo que iba a ver su cliente.
 *
 * Un iframe es la única forma de tener un viewport de verdad sin reescribir el
 * CSS de las seis plantillas a container queries — y reescribirlo cambiaría el
 * sitio real para arreglar la previsualización, que es el orden al revés.
 *
 * La escala va con `transform: scale()` y no con `zoom`: `zoom` se propaga al
 * documento de adentro y le vuelve a mentir sobre su ancho, que es el problema
 * que vinimos a resolver. `transform` es puramente visual.
 */
export function PreviewFrame({
  width,
  scale,
  title,
  children,
}: {
  /** Ancho del viewport simulado, en píxeles CSS. */
  width: number;
  scale: number;
  title: string;
  children: ReactNode;
}) {
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(820);

  /**
   * Copia las hojas de estilo del documento padre.
   *
   * El iframe arranca en blanco: no hereda nada. En desarrollo Next inyecta el
   * CSS como `<style>` y agrega más en cada recarga en caliente, así que además
   * de copiar hay que seguir mirando. La clase del `<html>` viaja también
   * porque `next/font` publica ahí `--font-plus-jakarta-sans`, y sin ella las
   * plantillas caen a la tipografía de respaldo y la previsualización miente
   * otra vez, ahora con las fuentes.
   */
  const sincronizarEstilos = useCallback((doc: Document) => {
    doc.documentElement.className = document.documentElement.className;
    const yaEsta = new Set(
      [...doc.head.querySelectorAll("[data-copiado]")].map((n) => n.getAttribute("data-copiado")),
    );
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((nodo, i) => {
      const clave = `${nodo.nodeName}-${i}-${nodo.textContent?.length ?? 0}`;
      if (yaEsta.has(clave)) return;
      const copia = nodo.cloneNode(true) as HTMLElement;
      copia.setAttribute("data-copiado", clave);
      doc.head.appendChild(copia);
    });
  }, []);

  const alCargar = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      const doc = event.currentTarget.contentDocument;
      if (!doc) return;
      sincronizarEstilos(doc);
      doc.body.style.margin = "0";
      setFrameDoc(doc);
    },
    [sincronizarEstilos],
  );

  // Recarga en caliente: cada `<style>` nuevo del padre tiene que entrar acá.
  useEffect(() => {
    if (!frameDoc) return;
    const obs = new MutationObserver(() => sincronizarEstilos(frameDoc));
    obs.observe(document.head, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [frameDoc, sincronizarEstilos]);

  // El alto del viewport simulado sale del espacio real del panel, para que la
  // previsualización lo llene en vez de dejar una franja muerta abajo.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const obs = new ResizeObserver(([entrada]) => {
      const disponible = entrada.contentRect.height;
      if (disponible > 0) setAlto(Math.max(560, Math.round(disponible / scale)));
    });
    obs.observe(host);
    return () => obs.disconnect();
  }, [scale]);

  return (
    <div ref={hostRef} className="grid h-full place-items-center overflow-hidden p-4 sm:p-6">
      <div
        className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-white shadow-xl"
        style={{ width: width * scale, height: alto * scale }}
      >
        <iframe
          title={title}
          // Arranca con el `viewport` declarado: sin eso el documento de adentro
          // no se comporta como un teléfono aunque mida como uno.
          srcDoc='<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'
          onLoad={alCargar}
          style={{
            width,
            height: alto,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            display: "block",
          }}
        />
      </div>
      {frameDoc ? createPortal(children, frameDoc.body) : null}
    </div>
  );
}
