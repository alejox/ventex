"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { X } from "lucide-react";
import { PortalContainerContext } from "@/components/ui/portal-container";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

/**
 * Dónde se apoya el panel:
 * - `center` (por defecto): tarjeta centrada.
 * - `sheet`: hoja que sube desde abajo en el celular y tarjeta centrada desde `sm`.
 * - `right`: cajón lateral a pantalla completa de alto, pegado a la derecha.
 */
export type ModalPlacement = "center" | "sheet" | "right";

export interface ModalProps {
  /** Controlado: el padre decide si está abierto. Cerrado, no se monta nada. */
  open: boolean;
  /**
   * Pedido de cierre (Escape, clic en el fondo o la X). El Modal NO se cierra
   * solo: si el padre ignora el pedido (p. ej. mientras guarda), sigue abierto.
   */
  onClose: () => void;
  /** Título visible; también es el nombre accesible del diálogo (`aria-labelledby`). */
  title: ReactNode;
  /** Bajada opcional bajo el título (`aria-describedby`). */
  description?: ReactNode;
  /** Ícono opcional sobre el título, ya pintado por quien lo pasa. */
  icon?: ReactNode;
  /** Ancho máximo del panel. Por defecto `md`. */
  size?: ModalSize;
  /** Posición del panel (centrado, hoja inferior en móvil o cajón lateral). */
  placement?: ModalPlacement;
  children?: ReactNode;
  /** Pie fijo (acciones). Queda fuera del área que scrollea. */
  footer?: ReactNode;
  /** Si un clic en el fondo cierra el modal. Por defecto `true`. */
  dismissible?: boolean;
  /** Si Escape cierra el modal. Por defecto `true`. */
  closeOnEscape?: boolean;
  /** Muestra la X del encabezado. Por defecto `true`. */
  showCloseButton?: boolean;
  /** `alertdialog` para confirmaciones que interrumpen. Por defecto `dialog`. */
  role?: "dialog" | "alertdialog";
  /**
   * Elemento que recibe el foco al abrir. Alternativa: marcar el campo con
   * `data-autofocus`. Sin ninguno de los dos, el navegador enfoca el primer
   * elemento enfocable. (El `autoFocus` de React no funciona dentro.)
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Clases extra para el panel. */
  className?: string;
  /** Clases extra para el cuerpo scrolleable (por defecto lleva `px-6 pb-6`). */
  bodyClassName?: string;
  /** Clases del pie (por defecto lleva borde superior y `px-6 py-4`). */
  footerClassName?: string;
}

const PLACEMENT: Record<ModalPlacement, { dialog: string; panel: string }> = {
  center: {
    dialog: "items-center justify-center p-4",
    panel: "max-h-[90vh] rounded-3xl animate-in fade-in zoom-in-95",
  },
  sheet: {
    dialog: "items-end justify-center p-0 sm:items-center sm:p-4",
    panel: "max-h-[92dvh] rounded-t-3xl sm:max-h-[90vh] sm:rounded-3xl animate-in slide-in-from-bottom sm:fade-in sm:zoom-in-95",
  },
  right: {
    dialog: "items-stretch justify-end p-0",
    panel: "h-full max-h-none rounded-none border-y-0 border-r-0 animate-in slide-in-from-right",
  },
};

const SIZE: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[min(96vw,80rem)]",
};

/**
 * Bloqueo de scroll del fondo con contador: con dos modales abiertos, cerrar el
 * de arriba no tiene que devolverle el scroll a la página.
 */
let scrollLocks = 0;
let previousOverflow = "";

function lockScroll() {
  if (scrollLocks === 0) {
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
  scrollLocks += 1;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.documentElement.style.overflow = previousOverflow;
}

/**
 * Modal de la plataforma, sobre `<dialog>` nativo con `showModal()`.
 *
 * Lo que da el navegador gratis y por eso NO se reimplementa: el diálogo sube a
 * la *top layer* (por encima de cualquier `z-index`), el resto de la página
 * queda `inert` (el Tab no se escapa: foco atrapado), y al cerrar el foco
 * vuelve al elemento que lo abrió. Lo que se agrega a mano: bloqueo del scroll
 * del fondo, Escape y clic en el fondo como *pedidos* al padre, y el portal de
 * desplegables (`usePortalContainer`) apuntando al propio diálogo — si no,
 * un `<Select>` adentro se abriría debajo del fondo, inerte.
 *
 * El `<dialog>` ocupa toda la pantalla y es transparente; el panel visible va
 * adentro. Así "clic en el fondo" es simplemente "el press empezó en el
 * `<dialog>` y no en el panel", y el diálogo nunca lleva `transform` (que
 * rompería el `position: fixed` de los desplegables portaleados).
 *
 * Al imprimir, el diálogo se oculta (`print:hidden`): el POS imprime el recibo
 * con un modal abierto ("Venta realizada", "Ventas recientes") y lo que tiene
 * que salir es la página. Por eso los modales que imprimen SU contenido
 * (comprobante de comisión, cierre de turno) no usan este componente.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  placement = "center",
  children,
  footer,
  dismissible = true,
  closeOnEscape = true,
  showCloseButton = true,
  role = "dialog",
  initialFocusRef,
  className = "",
  bodyClassName = "px-6 pb-6",
  footerClassName = "border-t border-outline-variant/10 px-6 py-4",
}: ModalProps) {
  if (!open) return null;
  return (
    <OpenModal
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      size={size}
      placement={placement}
      footer={footer}
      dismissible={dismissible}
      closeOnEscape={closeOnEscape}
      showCloseButton={showCloseButton}
      role={role}
      initialFocusRef={initialFocusRef}
      className={className}
      bodyClassName={bodyClassName}
      footerClassName={footerClassName}
    >
      {children}
    </OpenModal>
  );
}

type OpenModalProps = Omit<ModalProps, "open"> &
  Required<Pick<ModalProps, "size" | "placement" | "dismissible" | "closeOnEscape" | "showCloseButton" | "role" | "className" | "bodyClassName" | "footerClassName">>;

function OpenModal({
  onClose,
  title,
  description,
  icon,
  size,
  placement,
  children,
  footer,
  dismissible,
  closeOnEscape,
  showCloseButton,
  role,
  initialFocusRef,
  className,
  bodyClassName,
  footerClassName,
}: OpenModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  // El `close()` del desmontaje dispara un evento `close` asíncrono: no es un
  // pedido de cierre del usuario y no tiene que llegarle al padre.
  const unmountingRef = useRef(false);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Antes del primer pintado: abrir en la top layer y bloquear el scroll.
  useLayoutEffect(() => {
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // `autoFocus` de React NO sirve adentro: enfoca en el commit, antes de que
    // el diálogo esté abierto (y visible). Por eso `initialFocusRef` o el
    // atributo `data-autofocus`; sin ninguno, el navegador enfoca el primer
    // elemento enfocable.
    const target =
      initialFocusRef?.current ?? dialog.querySelector<HTMLElement>("[data-autofocus]");
    target?.focus();
    lockScroll();
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
      unlockScroll();
      // close() devuelve el foco a quien abrió el modal; quitar el nodo del DOM
      // sin cerrarlo no lo hace.
      if (dialog.open) dialog.close();
    };
    // initialFocusRef se lee solo al abrir, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      // El navegador cerraría el diálogo por su cuenta; el estado es del padre.
      e.preventDefault();
      if (closeOnEscape) onCloseRef.current();
    },
    [closeOnEscape],
  );

  const handleClose = useCallback(() => {
    // `dialog.open` otra vez en true: es el `close()` del doble montaje de
    // StrictMode, que ya se reabrió. No es un pedido de cierre.
    if (unmountingRef.current || dialog?.open) return;
    // Chrome ignora `preventDefault` en un segundo Escape sin interacción del
    // usuario y cierra igual. Si el padre lo sigue queriendo abierto, se reabre.
    if (closeOnEscape) onCloseRef.current();
    requestAnimationFrame(() => {
      if (dialog?.isConnected && !dialog.open) dialog.showModal();
    });
  }, [closeOnEscape, dialog]);

  return (
    <dialog
      ref={setDialog}
      role={role === "alertdialog" ? "alertdialog" : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleClose}
      onMouseDown={(e) => {
        // `mousedown` y no `click`: ver `backdropProps` en components/modal.ts.
        if (dismissible && e.target === e.currentTarget) onCloseRef.current();
      }}
      className={`ui-modal print:hidden fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent text-on-surface open:flex backdrop:bg-black/60 backdrop:backdrop-blur-sm ${PLACEMENT[placement].dialog}`}
    >
      <div
        className={`flex w-full flex-col overflow-hidden border border-outline-variant/10 bg-surface-container-lowest shadow-2xl duration-200 ${PLACEMENT[placement].panel} ${SIZE[size]} ${className}`}
      >
        <div className="flex shrink-0 items-start gap-3 px-6 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            {icon && <div className="mb-4">{icon}</div>}
            <h2 id={titleId} className="text-lg font-bold text-on-surface">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-sm text-on-surface-variant">
                {description}
              </div>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => onCloseRef.current()}
              className="-mr-2 -mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <PortalContainerContext.Provider value={dialog}>
          <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
          {footer && (
            <div className={`shrink-0 ${footerClassName}`}>{footer}</div>
          )}
        </PortalContainerContext.Provider>
      </div>
    </dialog>
  );
}
