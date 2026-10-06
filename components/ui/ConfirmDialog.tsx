"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ConfirmTone = "primary" | "danger";

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

const ICON_TONE: Record<ConfirmTone, string> = {
  primary: "bg-primary/10 text-primary-ink",
  danger: "bg-error/10 text-error",
};

/**
 * Modal de confirmación de la plataforma: reemplaza a `window.confirm`, que no
 * respeta el tema ni el estilo del resto de los modales.
 *
 * Controlado (`open`/`onConfirm`/`onCancel`). Para usarlo como `confirm()`
 * —esperando la respuesta en un handler— está `useConfirm` más abajo.
 *
 * Se apoya en `<Modal>` (foco atrapado, Escape, scroll bloqueado). Escape y el
 * clic afuera equivalen a Cancelar, salvo mientras `loading`.
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
  // El foco arranca en Cancelar: un Enter distraído nunca confirma.
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) onCancel();
      }}
      title={title}
      role="alertdialog"
      size="sm"
      showCloseButton={false}
      initialFocusRef={cancelRef}
      icon={
        icon ? (
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${ICON_TONE[tone]}`}>
            {icon}
          </div>
        ) : undefined
      }
      bodyClassName={description ? "px-6 pb-2" : "p-0"}
      footerClassName="px-6 pt-4 pb-6"
      footer={
        <div className="flex gap-3">
          <Button
            ref={cancelRef}
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            loadingLabel={loadingLabel}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {description && <div className="space-y-3 text-sm text-on-surface-variant">{description}</div>}
    </Modal>
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
