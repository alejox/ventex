"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { uploadSiteBanner } from "@/services/business-site.service";

/**
 * Banner del micrositio: la foto grande del encabezado.
 *
 * La columna `hero_image_url` existía desde el principio, pero no tenía ningún
 * campo en el panel: estaba en `null` en todos los negocios y las plantillas
 * caían siempre a la foto de referencia. Esto es lo que la vuelve editable.
 *
 * Sube al elegir el archivo y no al guardar el formulario: una foto de varios
 * megas dejaría el botón "Guardar" colgado sin explicación. Acá la espera tiene
 * su propio indicador.
 */
export function SiteBannerField({
  value,
  onChange,
  focusX,
  focusY,
  overlay,
  onFocusChange,
  onOverlayChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  focusX: number;
  focusY: number;
  overlay: number;
  onFocusChange: (x: number, y: number) => void;
  onOverlayChange: (v: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSubiendo(true);
    try {
      onChange(await uploadSiteBanner(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
      // Sin esto, elegir DOS VECES el mismo archivo no vuelve a disparar el
      // change: el input conserva el valor anterior.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-on-surface">Imagen del encabezado</span>

      {/*
        * El punto focal se elige TOCANDO la foto, no con dos campos numéricos.
        * "¿Qué parte no quiero que se recorte?" se contesta señalando; traducirla
        * a dos porcentajes es trabajo que le estaríamos pasando al dueño.
        *
        * Es un <button> y no un div con onClick: así se llega con Tab, y las
        * flechas mueven el punto de a 5% para quien no usa mouse.
        */}
      <button
        type="button"
        onClick={(e) => {
          if (!value) return;
          const caja = e.currentTarget.getBoundingClientRect();
          onFocusChange(
            Math.round(((e.clientX - caja.left) / caja.width) * 100),
            Math.round(((e.clientY - caja.top) / caja.height) * 100),
          );
        }}
        onKeyDown={(e) => {
          const paso = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
          if (!paso || !value) return;
          e.preventDefault();
          onFocusChange(
            Math.min(100, Math.max(0, focusX + paso[0])),
            Math.min(100, Math.max(0, focusY + paso[1])),
          );
        }}
        aria-label={value ? "Elegí el punto de la foto que no se debe recortar" : "Sin imagen"}
        className={`relative block aspect-[21/9] w-full overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-highest ${value ? "cursor-crosshair" : "cursor-default"}`}
      >
        {value ? (
          <>
            <Image
              src={value}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              unoptimized
              className="object-cover"
              style={{ objectPosition: `${focusX}% ${focusY}%` }}
            />
            {/* El oscurecido se pinta acá mismo para que el deslizador se juzgue
                mirando el resultado y no un número. */}
            {overlay > 0 && (
              <span className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${overlay}%)` }} />
            )}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,.45)]"
              style={{ left: `${focusX}%`, top: `${focusY}%` }}
            />
          </>
        ) : (
          <span className="flex h-full items-center justify-center px-6 text-center text-xs text-on-surface-variant">
            Sin imagen propia: tu sitio usa una foto de referencia
          </span>
        )}
        {subiendo && (
          <span className="absolute inset-0 grid place-items-center bg-scrim/60">
            <Loader2 className="h-6 w-6 animate-spin text-on-surface" />
          </span>
        )}
      </button>

      {value && (
        <div className="space-y-2 rounded-xl border border-outline-variant/20 p-3">
          <p className="text-xs text-on-surface-variant">
            Tocá la foto para elegir qué parte NO se recorta. El círculo marca ese punto.
          </p>
          <label className="flex items-center gap-3 text-xs text-on-surface-variant">
            <span className="shrink-0">Oscurecer</span>
            {/*
              * Máximo 70 y no 100: con la foto en negro total el hero deja de ser
              * una foto. Y el mínimo es 0 sobre el velo que ya pone la plantilla:
              * ese piso es de CONTRASTE, no estético — dejar bajarlo sería dejar
              * publicar un titular ilegible sin darse cuenta.
              */}
            <input
              type="range"
              min={0}
              max={70}
              step={5}
              value={overlay}
              onChange={(e) => onOverlayChange(Number(e.target.value))}
              className="h-1 w-full accent-[var(--primary)]"
            />
            <span className="w-10 shrink-0 text-right tabular-nums">{overlay}%</span>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={subiendo}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-outline-variant/30 px-3 text-sm text-on-surface transition-colors hover:border-primary disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" />
          {value ? "Cambiar imagen" : "Subir imagen"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={subiendo}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-error transition-colors hover:bg-error-container/20 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Quitar
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => elegir(e.target.files?.[0])}
        />
      </div>

      <p className="text-xs text-on-surface-variant">
        Se ve apaisada y a lo ancho. Una foto horizontal de tu local funciona mejor que una vertical.
      </p>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
