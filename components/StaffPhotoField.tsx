"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { uploadStaffPhoto } from "@/services/staff.service";

/**
 * Foto de una persona del equipo.
 *
 * Va en la ficha de la persona y no en los ajustes del sitio web: la foto es un
 * atributo de QUIÉN es, no de dónde se publica. Cargarla acá significa que el
 * dueño la sube una vez, cuando da de alta a alguien, y no tiene que acordarse
 * de volver a otra pantalla para que el micrositio deje de mostrar iniciales.
 *
 * Sube al tocar, no al guardar el formulario: si esperara al submit, una foto
 * de varios megas dejaría el botón "Guardar" colgado sin explicación. Acá la
 * espera tiene su propio indicador y el resto del formulario sigue usable.
 */
export function StaffPhotoField({
  value,
  onChange,
  nombre,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Para las iniciales mientras no hay foto. */
  nombre: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iniciales =
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  async function elegir(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSubiendo(true);
    try {
      onChange(await uploadStaffPhoto(file));
    } catch (e) {
      // El mensaje del error importa: el más probable es que Storage haya
      // rechazado el archivo por tamaño o por tipo, y "algo salió mal" deja al
      // dueño reintentando la misma foto de 8 MB.
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
      // Se limpia para que elegir DOS VECES el mismo archivo vuelva a disparar
      // el change: el input conserva el valor y el segundo intento no emite nada.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-semibold text-on-surface block">Foto</span>
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-container-highest">
          {value ? (
            <Image src={value} alt="" fill sizes="64px" unoptimized className="object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-sm font-bold text-on-surface-variant">
              {iniciales}
            </span>
          )}
          {subiendo && (
            <span className="absolute inset-0 grid place-items-center bg-scrim/60">
              <Loader2 className="h-5 w-5 animate-spin text-on-surface" />
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
            <Camera className="h-4 w-4" />
            {value ? "Cambiar" : "Subir foto"}
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
        </div>

        {/* `capture` a propósito NO: en el celular el dueño casi siempre tiene la
            foto ya sacada en la galería, y forzar la cámara le obliga a sacar
            una nueva ahí mismo. */}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => elegir(e.target.files?.[0])}
        />
      </div>
      <p className="text-xs text-on-surface-variant">
        Se publica en tu sitio web. Si no subís ninguna, se muestran las iniciales.
      </p>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
