"use client";

import { useEffect, useId, useRef, useState, type ReactElement, type Ref } from "react";
import { createPortal } from "react-dom";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia(REDUCE_MOTION_QUERY).matches;

/**
 * Props que el disparador tiene que desparramar sobre SU elemento
 * (`<Link {...trigger}>`). Tipado a `HTMLAnchorElement` porque hoy todos los
 * disparadores del riel son `next/link`; si algún día hace falta envolver un
 * `<button>`, esto se vuelve genérico recién ahí.
 */
export interface SidebarTooltipTrigger {
  ref: Ref<HTMLAnchorElement>;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: (e: React.FocusEvent) => void;
}

/**
 * Tooltip para la barra colapsada del sidebar.
 *
 * `children` es una función ("render prop") que arma el disparador con
 * `{...trigger}` en vez de que este componente clone el elemento del que
 * llama (`cloneElement`). Con `cloneElement` el `ref` viaja escondido dentro
 * de un objeto que se le pasa a una función, y el linter de hooks lo marca
 * como lectura insegura de un ref durante el render (no puede ver que
 * `cloneElement` es seguro). Repartiendo las props explícitamente en el JSX
 * de quien llama, el `ref` queda en el lugar de siempre —un atributo JSX— y
 * el análisis estático lo reconoce como lo que es.
 *
 * Por qué portal a `document.body` y no `absolute`: el `<nav>` donde viven los
 * iconos tiene `overflow-y-auto` (con trece ítems no entran en pantalla), y un
 * hijo `absolute` de un ancestro con overflow queda recortado en el borde del
 * contenedor en vez de flotar sobre el resto de la página. `position: fixed`
 * calculado desde `getBoundingClientRect()` del disparador es la misma salida
 * que ya usa `components/ui/Select.tsx` para el mismo problema.
 *
 * Por qué no el `title` nativo: aparece tarde, sin estilo y no se puede
 * animar — exactamente lo que este componente reemplaza. El disparador deja
 * de llevar `title` cuando queda envuelto acá.
 */
export function SidebarTooltip({
  label,
  children,
}: {
  label: string;
  children: (trigger: SidebarTooltipTrigger) => ReactElement;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
    setVisible(true);
    if (prefersReducedMotion()) {
      // Sin animación que esperar: aparece ya en su estado final.
      setEntered(true);
      return;
    }
    setEntered(false);
    // Un frame para que el navegador pinte el estado "oculto" antes de pasar
    // al "visible": es lo que hace que la transición corra en vez de que el
    // tooltip aparezca de golpe.
    requestAnimationFrame(() => setEntered(true));
  };

  const hide = () => {
    setVisible(false);
    setEntered(false);
  };

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    // capture: true agarra también el scroll del propio <nav>
    // (overflow-y-auto), que no burbujea hasta window en su forma normal.
    const onScroll = () => hide();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [visible]);

  const trigger: SidebarTooltipTrigger = {
    ref: triggerRef,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  };

  return (
    <>
      {children(trigger)}
      {visible && pos &&
        createPortal(
          <span
            role="tooltip"
            id={tooltipId}
            style={{ top: pos.top, left: pos.left }}
            className={`fixed z-[190] -translate-y-1/2 whitespace-nowrap rounded-md bg-inverse-surface px-2.5 py-1.5 text-xs font-medium text-inverse-on-surface shadow-lg pointer-events-none transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
              entered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1"
            }`}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
