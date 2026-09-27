"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { backdropProps } from "@/components/modal";

export type ConfirmTone = "primary" | "danger";

export interface ConfirmOptions {
  title: string;
  /** Cuerpo del mensaje. Acepta texto o nodos (p. ej. un aviso aparte). */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` pinta el botón de confirmar en rojo (acciones que quitan algo). */
  tone?: ConfirmTone;
  /** Ícono opcional sobre el título (se dibuja en un círculo del tono). */
  icon?: ReactNode;
  /** Texto del botón mientras `loading` (por defecto "Procesando…"). */
  loadingLabel?: string;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  /** Deshabilita los botones mientras corre la acción confirmada. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_TONE: Record<ConfirmTone, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-dim",
  danger: "bg-error text-white hover:bg-error/90",
};

const ICON_TONE: Record<ConfirmTone, string> = {
  primary: "bg-primary/10 text-primary",
  danger: "bg-error/10 text-error",
};

/**
 * Modal de confirmación de la plataforma: reemplaza a `window.confirm`, que no
 * respeta el tema ni el estilo del resto de los modales.
 *
 * Controlado (`open`/`onConfirm`/`onCancel`). Para usarlo como `confirm()`
 * —esperando la respuesta en un handler— está `useConfirm` más abajo.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "primary",
  icon,
  loadingLabel = "Procesando…",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropProps(() => {
        if (!loading) onCancel();
      })}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-surface-container-lowest rounded-3xl w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 animate-in zoom-in-95 duration-200"
      >
        {icon && (
          <div className={`w-12 h-12 mb-4 rounded-full flex items-center justify-center ${ICON_TONE[tone]}`}>
            {icon}
          </div>
        )}
        <h3 id="confirm-dialog-title" className="text-lg font-bold text-on-surface mb-2">
          {title}
        </h3>
        {description && <div className="text-sm text-on-surface-variant mb-6 space-y-3">{description}</div>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            // El foco arranca en Cancelar: un Enter distraído nunca confirma.
            autoFocus
            className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${CONFIRM_TONE[tone]}`}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * `confirm()` con el modal de la plataforma:
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm();
 * if (!(await confirm({ title: "¿Desactivar?", tone: "danger" }))) return;
 * // …y renderizar {dialog} en el componente.
 * ```
 *
 * Cerrar con Escape, clic afuera o Cancelar resuelve `false`.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    // Un pedido nuevo con otro abierto cancela el anterior en vez de colgarlo.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const handleCancel = useCallback(() => settle(false), [settle]);

  const dialog = options ? (
    <ConfirmDialog {...options} open onConfirm={() => settle(true)} onCancel={handleCancel} />
  ) : null;

  return { confirm, dialog };
}
