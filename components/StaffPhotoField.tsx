"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { validateStaffPhotoFile } from "@/lib/staff-photo";
import { useStaffStore } from "@/stores/staff.store";

/** The local preview is temporary; only a completed upload changes the form. */
export function StaffPhotoField({
  value,
  onChange,
  nombre,
  disabled = false,
  onUploadingChange,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  nombre: string;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const uploadPhoto = useStaffStore((s) => s.uploadPhoto);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const uploading = useRef(false);
  const objectUrl = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helpId = useId();
  const errorId = useId();

  function releasePreview() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releasePreview();
    };
  }, []);

  const initials = nombre.trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]).join("").toUpperCase() || "?";
  const blocked = disabled || pending;
  const imageUrl = preview ?? value;

  async function choose(file: File | undefined) {
    // A ref closes the gap before React renders the disabled control.
    if (!file || disabled || uploading.current) return;
    if (input.current) input.current.value = "";
    const invalid = validateStaffPhotoFile(file);
    if (invalid) {
      setError(invalid === "empty" ? "La imagen está vacía." : "Usa una imagen PNG, JPG o WebP.");
      return;
    }
    uploading.current = true;
    setError(null);
    setPending(true);
    onUploadingChange?.(true);
    try {
      objectUrl.current = URL.createObjectURL(file);
      setPreview(objectUrl.current);
      const url = await uploadPhoto(file);
      if (mounted.current) onChange(url);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      releasePreview();
      uploading.current = false;
      if (mounted.current) {
        setPreview(null);
        setPending(false);
        onUploadingChange?.(false);
      }
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-semibold text-on-surface block">Foto</span>
      <button
        type="button"
        disabled={blocked}
        aria-label={value ? "Cambiar foto" : "Subir foto"}
        aria-busy={pending}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
        onClick={() => input.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          if (blocked || uploading.current) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = blocked ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void choose(e.dataTransfer.files[0]);
        }}
        className={`flex w-full min-w-0 items-center gap-4 rounded-xl border border-dashed p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed ${dragging ? "border-primary bg-primary/10" : "border-outline-variant/50 hover:border-primary"}`}
      >
        <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-container-highest">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill sizes="64px" unoptimized className="object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-sm font-bold text-on-surface-variant">{initials}</span>
          )}
          {pending && (
            <span className="absolute inset-0 grid place-items-center bg-scrim/60">
              <Loader2 className="h-5 w-5 animate-spin text-on-surface" />
            </span>
          )}
        </span>
        <span className="min-w-0 space-y-1">
          <span className="flex items-center gap-2 text-sm text-on-surface">
            <Camera className="h-4 w-4 shrink-0" />
            {pending ? "Subiendo foto…" : value ? "Cambiar foto" : "Subir foto"}
          </span>
          <span className="block text-xs text-on-surface-variant">Arrastra una imagen aquí o toca para elegir. PNG, JPG o WebP.</span>
        </span>
      </button>
      {value && (
        <button
          type="button"
          onClick={() => { if (!disabled && !uploading.current) onChange(null); }}
          disabled={blocked}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-error hover:bg-error-container/20 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" /> Quitar
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={blocked}
        className="hidden"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      <p id={helpId} className="text-xs text-on-surface-variant">
        Se publica en tu sitio web. Si no subes ninguna, se muestran las iniciales.
      </p>
      {error && <p id={errorId} role="alert" className="text-xs text-error">{error}</p>}
      <span role="status" className="sr-only">{pending ? "Subiendo foto. Espera antes de guardar o cerrar." : ""}</span>
    </div>
  );
}
