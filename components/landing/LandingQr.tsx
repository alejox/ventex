"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { landingQr } from "@/services/landing-qr.service";

export function LandingQr({ slug, published, changed, saving, onGenerate }: { slug?: string; published: boolean; changed: boolean; saving: boolean; onGenerate: () => Promise<boolean> }) {
  const [color, setColor] = useState("#000000");
  const colorInput = useRef<HTMLInputElement>(null);
  const qr = useMemo(() => slug ? landingQr(slug, slug, color) : null, [slug, color]);

  return (
    <section className="space-y-3 rounded-xl border border-outline-variant/30 p-4" aria-label="QR de tu web">
      <h3 className="text-sm font-bold text-on-surface">QR de tu web</h3>
      <p className="text-xs text-on-surface-variant">Generar el QR guarda la dirección que escribiste y los cambios de tu página web.</p>
      <button type="button" onClick={() => void onGenerate()} disabled={saving} className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary disabled:opacity-50">{saving ? "Guardando…" : qr ? "Actualizar QR" : "Generar QR"}</button>
      {qr ? <>
        <p className="text-xs text-on-surface-variant">Tus clientes pueden escanearlo para abrir tu página.</p>
        <Image src={qr.dataUrl} alt={`Código QR de ${slug} para ${qr.url}`} width={qr.width * 6} height={qr.height * 6} unoptimized className="mx-auto h-auto w-56 max-w-full rounded-lg" />
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => colorInput.current?.click()} className="flex items-center gap-2 rounded-lg border border-outline-variant/30 px-3 py-2 text-sm font-bold text-on-surface">
            <span aria-hidden="true" className="h-4 w-4 rounded-full border border-outline-variant/30" style={{ backgroundColor: color }} />
            Cambiar color del QR
          </button>
          <input ref={colorInput} type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Color del QR" className="h-8 w-8 cursor-pointer rounded border border-outline-variant/30" />
        </div>
        <p className="break-all text-center text-xs text-on-surface-variant">{qr.url}</p>
        {!changed && !saving ? <a href={qr.dataUrl} download={`qr-${slug}.svg`} className="block rounded-lg border border-outline-variant/30 px-3 py-2 text-center text-sm font-bold text-on-surface">Descargar QR</a> : null}
        {!published ? <p className="text-xs text-on-surface-variant">Publica tu página web para que el enlace del QR esté disponible.</p> : null}
        {changed ? <p role="status" className="text-xs text-on-surface-variant">Cambiaste la dirección. Tocá «Actualizar QR» para generar el código con el nuevo enlace.</p> : null}
      </> : <p className="text-xs text-on-surface-variant">Tocá «Generar QR» para crear el código con la dirección de tu web.</p>}
    </section>
  );
}
