"use client";

import { useState } from "react";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";

interface BarcodeFieldProps {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  scanTitle?: string;
}

function IconScan(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}

/**
 * Campo de código de barras con escaneo por cámara.
 *
 * Existe como componente propio porque el mismo par (input + botón de cámara)
 * se repite en el alta rápida y en el formulario avanzado, y el estado del
 * escáner —abierto/cerrado— no tiene por qué vivir en cada formulario.
 *
 * Se puede escribir a mano: los lectores láser USB de mostrador escriben en el
 * campo enfocado como si fueran un teclado, así que el input tiene que aceptar
 * texto además de la cámara.
 */
export function BarcodeField({
  value,
  onChange,
  id,
  placeholder = "Ej. 7701234567890",
  className = "",
  scanTitle = "Escanear código de barras",
}: BarcodeFieldProps) {
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          /* text-base en móvil: por debajo de 16px iOS hace zoom al enfocar. */
          className={`flex-1 min-w-0 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary ${className}`}
        />
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          aria-label={scanTitle}
          title={scanTitle}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-colors"
        >
          <IconScan className="w-5 h-5" />
        </button>
      </div>

      {scannerOpen && (
        <BarcodeScannerModal
          title={scanTitle}
          hint="Apunta la cámara al código de barras del empaque."
          onDetected={(code) => onChange(code.trim())}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </>
  );
}
