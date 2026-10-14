"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * "Abre tu caja para empezar": lo ve el dueño/administrador con
 * `settings.owner_uses_shifts` encendido al entrar al POS sin caja abierta.
 * No bloquea: "Iniciar sin abrir caja" lo deja vender y no vuelve a preguntar
 * en este dispositivo hasta mañana (`lib/owner-shift-prompt.ts`).
 *
 * Sin cierre por fondo, Escape ni X: la idea es que elija una de las dos.
 */
export function OwnerShiftPrompt({
  open,
  onOpenShift,
  onSkip,
}: {
  open: boolean;
  onOpenShift: () => void;
  onSkip: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onSkip}
      title="Abre tu caja para empezar"
      description="Con la caja abierta registras la base, los retiros y cierras con arqueo. Si hoy no la necesitas, puedes vender sin abrirla."
      size="sm"
      placement="sheet"
      dismissible={false}
      closeOnEscape={false}
      showCloseButton={false}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onSkip}>
            Iniciar sin abrir caja
          </Button>
          <Button variant="primary" onClick={onOpenShift} data-autofocus>
            Abrir caja
          </Button>
        </div>
      }
    />
  );
}
