"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectProps {
  /** Opciones como `<option value="x">Etiqueta</option>`, igual que un select nativo. */
  children: React.ReactNode;
  value?: string;
  defaultValue?: string;
  /**
   * Recibe `{ target: { value } }` para que los handlers escritos contra un
   * `<select>` nativo (`e.target.value`) sigan funcionando sin cambios.
   */
  onChange?: (event: { target: { value: string } }) => void;
  /** Etiqueta sobre el campo, asociada por `id`. */
  label?: string;
  /** Texto de ayuda debajo. Lo reemplaza `error` cuando hay error. */
  hint?: string;
  /** Mensaje de error: pinta el borde y se anuncia con `aria-describedby`. */
  error?: string;
  /**
   * `md` (por defecto) para formularios; `sm` para barras densas como el panel
   * de factura, donde entran seis controles en una columna angosta.
   */
  size?: "sm" | "md";
  /** Clases del contenedor (para el ancho o el `col-span` de una grilla). */
  containerClassName?: string;
  className?: string;
  disabled?: boolean;
  /** Se emite en un input oculto, para que un `<form>` nativo lo recoja. */
  name?: string;
  id?: string;
  "aria-label"?: string;
}

interface OptionData {
  value: string;
  label: string;
  disabled: boolean;
}

const SIZES = {
  md: "h-11 pl-4 pr-10 text-base lg:text-sm rounded-xl",
  sm: "h-9 pl-3 pr-8 text-sm lg:text-xs rounded-lg",
} as const;

/** Lee los `<option>` hijos. Acepta arrays y fragmentos, como el select nativo. */
function readOptions(children: React.ReactNode): OptionData[] {
  return Children.toArray(children).flatMap((child): OptionData[] => {
    if (!isValidElement(child)) return [];
    const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
    const label = Children.toArray(props.children).join("");
    return [{
      value: String(props.value ?? label),
      label,
      disabled: Boolean(props.disabled),
    }];
  });
}

/**
 * Selector de la plataforma.
 *
 * NO usa `<select>`. La lista desplegable de un select la dibuja el sistema
 * operativo y **no se puede estilar con CSS**: en macOS aparece gris oscuro con
 * el resaltado azul del sistema, que sobre el tema claro de Ventex se ve como
 * un cuerpo extraño. La única forma de que el desplegable tenga la identidad de
 * la plataforma es dibujarlo nosotros.
 *
 * A cambio hay que reponer a mano lo que el nativo daba gratis: navegación con
 * flechas, Inicio/Fin, Enter, Escape, búsqueda por tecleo y los roles ARIA.
 * Está todo acá abajo.
 *
 * El panel se posiciona con `position: fixed` a partir del rectángulo del
 * botón, no con `absolute`: dentro de un contenedor con `overflow` —el panel de
 * factura, la barra de pestañas— un desplegable absoluto queda recortado.
 */
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  label,
  hint,
  error,
  size = "md",
  containerClassName = "",
  className = "",
  disabled,
  name,
  id,
  "aria-label": ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listId = `${selectId}-list`;
  const describedById = `${selectId}-desc`;

  const options = readOptions(children);
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const current = value ?? uncontrolled;
  const selected = options.find((o) => o.value === current);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ query: "", at: 0 });

  const message = error ?? hint;
  const enabledIndexes = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const optionCount = options.length;

  // Sin `useCallback`: `options` y `enabledIndexes` se derivan en cada render,
  // así que la memoización manual no se puede preservar y el compilador de
  // React la rechaza. Él memoiza solo.
  const openList = () => {
    const el = buttonRef.current;
    if (!el || disabled) return;
    const box = el.getBoundingClientRect();
    const below = window.innerHeight - box.bottom;
    // Alto estimado del panel para decidir si se abre hacia arriba.
    const height = Math.min(options.length * 40 + 8, 280);
    const up = below < height && box.top > below;
    setRect({
      top: up ? box.top - height - 4 : box.bottom + 4,
      left: box.left,
      width: box.width,
      up,
    });
    const currentIndex = options.findIndex((o) => o.value === current);
    setActiveIndex(currentIndex >= 0 ? currentIndex : (enabledIndexes[0] ?? 0));
    setOpen(true);
  };

  const commit = (option: OptionData) => {
    if (option.disabled) return;
    if (value === undefined) setUncontrolled(option.value);
    onChange?.({ target: { value: option.value } });
    setOpen(false);
    buttonRef.current?.focus();
  };

  /**
   * El panel es `fixed`, así que al scrollear hay que reubicarlo o queda
   * flotando lejos de su botón.
   *
   * Reubicar y NO cerrar: enfocar el botón al abrirlo puede disparar un scroll
   * del navegador para traerlo a la vista, y con `capture: true` ese mismo
   * evento cerraba el desplegable en el instante en que se abría.
   */
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = buttonRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const below = window.innerHeight - box.bottom;
      const height = Math.min(optionCount * 40 + 8, 280);
      const up = below < height && box.top > below;
      setRect({
        top: up ? box.top - height - 4 : box.bottom + 4,
        left: box.left,
        width: box.width,
        up,
      });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, optionCount]);

  // Mantiene la opción activa a la vista mientras se navega con el teclado.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const move = (delta: number) => {
    const positions = enabledIndexes;
    if (positions.length === 0) return;
    const at = positions.indexOf(activeIndex);
    const next = at < 0 ? 0 : (at + delta + positions.length) % positions.length;
    setActiveIndex(positions[next]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(1); break;
      case "ArrowUp": e.preventDefault(); move(-1); break;
      case "Home": e.preventDefault(); setActiveIndex(enabledIndexes[0] ?? 0); break;
      case "End": e.preventDefault(); setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0); break;
      case "Escape": e.preventDefault(); setOpen(false); break;
      case "Tab": setOpen(false); break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[activeIndex]) commit(options[activeIndex]);
        break;
      default: {
        // Búsqueda por tecleo: el nativo la tiene y sin ella una lista larga
        // obliga a bajar opción por opción.
        if (e.key.length !== 1) return;
        const now = Date.now();
        const state = typeahead.current;
        state.query = now - state.at > 800 ? e.key : state.query + e.key;
        state.at = now;
        const hit = options.findIndex(
          (o) => !o.disabled && o.label.toLowerCase().startsWith(state.query.toLowerCase()),
        );
        if (hit >= 0) setActiveIndex(hit);
      }
    }
  };

  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label htmlFor={selectId} className="block text-[13px] font-semibold text-on-surface">
          {label}
        </label>
      )}

      <button
        ref={buttonRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? describedById : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        className={`relative w-full flex items-center bg-surface-container-lowest text-left text-on-surface
          border transition-colors focus:outline-none focus:ring-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${SIZES[size]}
          ${
            error
              ? "border-error focus:border-error focus:ring-error/20"
              : `border-outline-variant/30 focus:border-primary focus:ring-primary/20 ${open ? "border-primary" : ""}`
          }
          ${className}`}
      >
        <span className={`truncate ${selected ? "" : "text-on-surface-variant"}`}>
          {selected?.label ?? "—"}
        </span>
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-on-surface-variant transition-transform
            ${size === "sm" ? "right-2.5 w-3.5 h-3.5" : "right-3.5 w-4 h-4"}
            ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {name && <input type="hidden" name={name} value={current} />}

      {/* Portal a <body>: el panel de factura lleva `lg:translate-x-0`, y un
          `transform` en un ancestro convierte a ese elemento en el bloque
          contenedor de sus descendientes `fixed`. Sin el portal, el desplegable
          se posicionaba contra el panel y quedaba corrido ~20px en x y ~80 en y.
          Es la misma clase de trampa que el `overflow` que recorta. */}
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)} />
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={label ? selectId : undefined}
            style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
            className={`fixed z-[200] max-h-[280px] overflow-y-auto py-1 rounded-xl
              bg-surface-container-lowest border border-outline-variant/20 shadow-2xl
              animate-in fade-in duration-100 ${rect.up ? "slide-in-from-bottom-1" : "slide-in-from-top-1"}`}
          >
            {options.map((option, index) => {
              const isSelected = option.value === current;
              const isActive = index === activeIndex;
              return (
                <li key={`${option.value}-${index}`}>
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                    onClick={() => commit(option)}
                    className={`w-full flex items-center gap-2 px-3 min-h-[40px] py-2 text-left text-sm transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed
                      ${isActive ? "bg-primary/10" : ""}
                      ${isSelected ? "text-primary font-semibold" : "text-on-surface"}`}
                  >
                    <span className="flex-1 min-w-0 break-words">{option.label}</span>
                    {isSelected && (
                      <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>,
        document.body,
      )}

      {message && (
        <p id={describedById} className={`text-xs ${error ? "text-error" : "text-on-surface-variant"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
