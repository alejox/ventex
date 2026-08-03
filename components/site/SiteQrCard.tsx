"use client";

import { useMemo, useState } from "react";
import { create as createQr } from "qrcode";
import { toast } from "sonner";

/**
 * QR del micrositio: para pegar en la vidriera, en la tarjeta o mandarlo por
 * WhatsApp.
 *
 * El código se dibuja a mano desde la matriz que devuelve `create()`, que es
 * SÍNCRONA. Por eso no hay efecto ni estado intermedio: el QR existe en el
 * primer render y cambia junto con la URL, sin un parpadeo en el medio.
 *
 * El PNG se arma recién al descargar, en un canvas de 1024px, para que se pueda
 * imprimir sin que se vea pixelado.
 */

/** Módulos en blanco alrededor del código. Menos de 4 y muchos lectores fallan. */
const QUIET_ZONE = 4;
/** Lado del PNG descargado. Alcanza para imprimirlo en una hoja. */
const PNG_SIZE = 1024;

export function SiteQrCard({
  url,
  fileName,
  published,
  hasUnsavedSlug,
}: {
  /** URL pública ya armada. */
  url: string;
  /** Nombre del archivo descargado, sin extensión. */
  fileName: string;
  /** Un sitio sin publicar tiene QR, pero el enlace todavía devuelve 404. */
  published: boolean;
  /** El slug del formulario no es el guardado: el QR apunta al viejo. */
  hasUnsavedSlug: boolean;
}) {
  const [sharing, setSharing] = useState(false);

  /**
   * Nivel M: aguanta ~15% del código tapado o gastado. Es el punto donde un QR
   * impreso sobrevive al uso real sin volverse un ladrillo de módulos.
   */
  const qr = useMemo(() => createQr(url, { errorCorrectionLevel: "M" }), [url]);
  const size = qr.modules.size;
  const modules = qr.modules.data;

  const path = useMemo(() => {
    let d = "";
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (modules[row * size + col]) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return d;
  }, [modules, size]);

  /** El PNG siempre sale negro sobre blanco: un QR invertido no escanea. */
  function renderPng(): Promise<Blob> {
    const total = size + QUIET_ZONE * 2;
    const scale = Math.floor(PNG_SIZE / total);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = total * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.reject(new Error("Sin canvas"));

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (modules[row * size + col]) {
          ctx.fillRect((col + QUIET_ZONE) * scale, (row + QUIET_ZONE) * scale, scale, scale);
        }
      }
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo generar la imagen"));
      }, "image/png");
    });
  }

  async function handleDownload() {
    try {
      const blob = await renderPng();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${fileName}.png`;
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error("No se pudo descargar el QR.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar. Copialo a mano del recuadro de arriba.");
    }
  }

  /**
   * Compartir manda la IMAGEN cuando el sistema la acepta (así el cliente
   * recibe el QR, no un texto), y si no, el enlace solo. Sin API de compartir
   * — escritorio, casi siempre — se copia el enlace, que es lo mismo en dos
   * pasos.
   */
  async function handleShare() {
    if (typeof navigator.share !== "function") {
      await handleCopy();
      return;
    }

    setSharing(true);
    try {
      const blob = await renderPng().catch(() => null);
      const file = blob ? new File([blob], `${fileName}.png`, { type: "image/png" }) : null;

      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: fileName, text: url, files: [file] });
      } else {
        await navigator.share({ title: fileName, text: "Reservá en línea:", url });
      }
    } catch {
      // Cancelar el diálogo del sistema tira un error igual que un fallo real;
      // no hay forma confiable de distinguirlos, así que no se avisa nada.
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Fondo blanco fijo: en tema oscuro un QR sobre gris no escanea. */}
        <div className="mx-auto shrink-0 rounded-lg bg-white p-2.5 sm:mx-0">
          <svg
            viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${size + QUIET_ZONE * 2} ${size + QUIET_ZONE * 2}`}
            className="h-36 w-36"
            shapeRendering="crispEdges"
            role="img"
            aria-label={`Código QR de ${url}`}
          >
            <path d={path} fill="#000000" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-on-surface-variant">
            Imprimilo o mandáselo a tus clientes: al escanearlo entran directo a tu sitio.
          </p>
          <p className="mt-2 break-all rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface">
            {url}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
            >
              Descargar QR
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="rounded-xl border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface disabled:opacity-50"
            >
              {sharing ? "Compartiendo…" : "Compartir"}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface"
            >
              Copiar enlace
            </button>
          </div>

          {hasUnsavedSlug ? (
            <p className="mt-3 text-xs text-amber-600">
              Cambiaste la dirección: guardá para que el QR apunte a la nueva.
            </p>
          ) : null}
          {!published ? (
            <p className="mt-2 text-xs text-on-surface-variant">
              Tu sitio todavía no está publicado: hasta que lo publiques, este enlace no abre
              para nadie más.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
