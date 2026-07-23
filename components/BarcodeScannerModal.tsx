"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

/**
 * Formats a retail POS actually meets: EAN/UPC on manufactured goods, Code
 * 128/39 and ITF on labels printed in-house, QR as a fallback carrier.
 */
const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "codabar",
  "qr_code",
] as const;

/** Minimal shape of the native Barcode Detection API (absent from lib.dom). */
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface NativeBarcodeDetectorCtor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** `torch` is a real capability on Android but is not in the TS lib types. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

const SAME_CODE_COOLDOWN_MS = 1500;
const NATIVE_DETECT_INTERVAL_MS = 200;

interface BarcodeScannerModalProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  /** Keep scanning after a hit, so several items can be added in one pass. */
  continuous?: boolean;
  title?: string;
  hint?: string;
}

export function BarcodeScannerModal({
  onDetected,
  onClose,
  continuous = false,
  title = "Escanear código",
  hint = "Apunta la cámara al código de barras del producto.",
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [errorMessage, setErrorMessage] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);

  const trackRef = useRef<MediaStreamTrack | null>(null);
  // The callbacks fire from timers and from ZXing, long after this render.
  // A ref keeps them pointing at the current props without restarting the camera.
  const latest = useRef({ onDetected, onClose, continuous });
  useEffect(() => {
    latest.current = { onDetected, onClose, continuous };
  });

  // De-duplication lives in a ref: a barcode stays in frame for many frames and
  // would otherwise be reported dozens of times per second.
  const lastHitRef = useRef<{ code: string; at: number } | null>(null);

  const handleHit = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    const previous = lastHitRef.current;
    if (previous && previous.code === code && now - previous.at < SAME_CODE_COOLDOWN_MS) return;
    lastHitRef.current = { code, at: now };

    navigator.vibrate?.(60);
    setLastCode(code);
    latest.current.onDetected(code);
    if (!latest.current.continuous) latest.current.onClose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fail = (message: string) => {
      if (cancelled) return;
      setErrorMessage(message);
      setStatus("error");
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        fail(
          window.isSecureContext
            ? "Este navegador no permite usar la cámara."
            : "La cámara solo funciona sobre HTTPS. Abre la app con https:// o desde localhost.",
        );
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          fail("Permiso de cámara denegado. Habilítalo en los ajustes del navegador.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          fail("No se encontró ninguna cámara en este dispositivo.");
        } else if (name === "NotReadableError") {
          fail("Otra aplicación está usando la cámara.");
        } else {
          fail("No se pudo iniciar la cámara.");
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      setTorchAvailable(Boolean((track?.getCapabilities?.() as TorchCapabilities | undefined)?.torch));

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      // iOS refuses inline autoplay without both attributes set on the element.
      video.setAttribute("playsinline", "true");
      video.muted = true;
      try {
        await video.play();
      } catch {
        // Autoplay rejection still leaves usable frames once the user interacts.
      }
      if (cancelled) return;
      setStatus("scanning");

      const NativeDetector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor })
        .BarcodeDetector;

      if (NativeDetector) {
        // Native path (Chrome/Android): no bundle cost and a much faster decode.
        let supported: string[] = [];
        try {
          supported = await NativeDetector.getSupportedFormats();
        } catch {
          supported = [];
        }
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (!cancelled && formats.length > 0) {
          const detector = new NativeDetector({ formats });
          let busy = false;
          intervalId = setInterval(async () => {
            if (busy || cancelled || video.readyState < 2) return;
            busy = true;
            try {
              const results = await detector.detect(video);
              if (!cancelled && results.length > 0) handleHit(results[0].rawValue);
            } catch {
              // A dropped frame is not worth surfacing; the next tick retries.
            } finally {
              busy = false;
            }
          }, NATIVE_DETECT_INTERVAL_MS);
          return;
        }
      }

      // Fallback (Safari/iOS and older browsers): ZXing, imported on demand so
      // its ~250 KB never reach users who do not open the scanner.
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (cancelled || !stream) return;
      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 150,
      });
      controls = await reader.decodeFromStream(stream, video, (result) => {
        if (result) handleHit(result.getText());
      });
      if (cancelled) controls.stop();
    };

    start();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      controls?.stop();
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [handleHit]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraint] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setManualCode("");
    onDetected(code);
    if (!continuous) onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-black/80 text-white">
        <div className="min-w-0">
          <h2 className="text-base font-bold truncate">{title}</h2>
          <p className="text-xs text-white/60 truncate">{hint}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label="Linterna"
              className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
                torchOn ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <path d="M6 2h12l-1 6-5 14-5-14-1-6z" />
                <line x1="12" y1="10" x2="12" y2="14" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar escáner"
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Camera */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />

        {status === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[78%] max-w-sm aspect-[5/3] rounded-2xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <p className="text-sm text-white/70">Iniciando cámara…</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-8 text-center">
            <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="w-10 h-10 text-white/40">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-white/80 max-w-xs">{errorMessage}</p>
            <p className="text-xs text-white/50">Puedes escribir el código a mano abajo.</p>
          </div>
        )}

        {continuous && lastCode && status === "scanning" && (
          <div className="absolute bottom-4 inset-x-4 flex justify-center pointer-events-none">
            <span className="rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-black font-mono">
              {lastCode}
            </span>
          </div>
        )}
      </div>

      {/* Manual entry: the escape hatch when the label is damaged or the camera fails. */}
      <form
        onSubmit={submitManual}
        className="flex items-center gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/80"
      >
        <input
          type="text"
          inputMode="numeric"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Escribir código manualmente"
          className="flex-1 min-w-0 h-12 rounded-xl bg-white/10 border border-white/20 px-4 text-base text-white placeholder:text-white/40 focus:outline-none focus:border-white/60"
        />
        <button
          type="submit"
          disabled={!manualCode.trim()}
          className="h-12 px-5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          Buscar
        </button>
      </form>
    </div>
  );
}
