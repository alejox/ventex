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
}: {
  value: string | null;
  onChange: (url: string | null) => void;
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

      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-highest">
        {value ? (
          <Image src={value} alt="" fill sizes="(max-width: 768px) 100vw, 640px" unoptimized className="object-cover" />
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
      </div>

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
